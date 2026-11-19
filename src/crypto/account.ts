// Account-level encryption flows (SPEC §8.5): password keys for signing in,
// turning encryption on and off, unlocking a device, the recovery key.

import {
	generateDataKey,
	toBase64,
	unwrapKey,
	wrapKey,
} from "../../shared/crypto/envelope";
import {
	type AccountKeys,
	deriveAccountKeys,
	MIN_PASSWORD_LENGTH,
	normalizeEmail,
} from "../../shared/crypto/password";
import type { KeyBundle, Me } from "../../shared/schema";
import { ApiError, api } from "../api";
import {
	forgetDeviceKey,
	loadDeviceRecord,
	saveDeviceKey,
	savePasscodeKey,
	usableKey,
} from "./deviceKeys";
import { getCryptoState, setEncrypted, setKey } from "./session";

const PASSWORD_AAD = "dk.password";
const RECOVERY_AAD = "dk.recovery";

// ---------------------------------------------------------------------------
// Password keys

/**
 * Until this date, a device that hasn't seen an account upgraded also sends
 * the password itself when signing in, so accounts last used before 2.0.0
 * can upgrade (shared/schema.ts `credentialsSchema`). After it, they use
 * Forgot password.
 */
const LEGACY_SIGN_IN_UNTIL = Date.UTC(2027, 5, 1);
const UPGRADED_KEY = "mythings:upgraded";

async function emailTag(email: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`mythings:${normalizeEmail(email)}`),
	);
	return toBase64(new Uint8Array(digest)).slice(0, 16);
}

function upgradedTags(): string[] {
	try {
		return JSON.parse(localStorage.getItem(UPGRADED_KEY) ?? "[]") as string[];
	} catch {
		return [];
	}
}

/** The account is known to use password keys: stop sending the password itself. */
export async function markUpgraded(email: string): Promise<void> {
	const tag = await emailTag(email);
	const tags = upgradedTags();
	if (tags.includes(tag)) return;
	try {
		localStorage.setItem(UPGRADED_KEY, JSON.stringify([...tags, tag]));
	} catch {}
}

/** Whether to also send the password for an account that may not be upgraded yet. */
export async function needsLegacy(email: string): Promise<boolean> {
	if (Date.now() >= LEGACY_SIGN_IN_UNTIL) return false;
	return !upgradedTags().includes(await emailTag(email));
}

/** Keys from the password just typed, kept in memory to unlock encryption after signing in. */
let typed: (AccountKeys & { email: string }) | null = null;

export class PasswordTooShort extends Error {}

/** Derives the keys for a password typed now, and remembers them for unlocking. */
export async function passwordKeys(
	email: string,
	password: string,
): Promise<AccountKeys> {
	const keys = await deriveAccountKeys(email, password);
	typed = { ...keys, email: normalizeEmail(email) };
	return keys;
}

/** Keys for a brand-new password (checks its length first: the server can't any more). */
export function newPasswordKeys(
	email: string,
	password: string,
): Promise<AccountKeys> {
	if (password.length < MIN_PASSWORD_LENGTH) throw new PasswordTooShort();
	return passwordKeys(email, password);
}

/** The keys from the password typed to sign in, once (they're dropped after). */
export function takeTypedKeys(email: string): AccountKeys | null {
	const keys = typed && typed.email === normalizeEmail(email) ? typed : null;
	typed = null;
	return keys;
}

/** Signs in, sending the password itself only for an account that may need upgrading. */
export async function signIn(email: string, password: string): Promise<Me> {
	const keys = await passwordKeys(email, password);
	const legacy = await needsLegacy(email);
	const user = await api<Me>("/auth/login", {
		method: "POST",
		body: {
			email,
			password: keys.authKey,
			...(legacy && { legacyPassword: password }),
		},
	});
	await markUpgraded(email);
	return user;
}

/** Re-typed password for a sensitive change: the body fields the server checks. */
export async function confirmBody(email: string, password: string) {
	const keys = await deriveAccountKeys(email, password);
	return {
		keys,
		body: {
			password: keys.authKey,
			...((await needsLegacy(email)) && { legacyPassword: password }),
		},
	};
}

// ---------------------------------------------------------------------------
// Recovery key: 20 random bytes as 32 letters and digits, in groups of four.

const BASE32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function encodeRecovery(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = "";
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += BASE32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
	return out.match(/.{1,4}/g)?.join("-") ?? out;
}

function decodeRecovery(text: string): Uint8Array<ArrayBuffer> | null {
	const clean = text.toUpperCase().replace(/[\s-]/g, "");
	if (clean.length !== 32) return null;
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const char of clean) {
		const index = BASE32.indexOf(char);
		if (index < 0) return null;
		value = ((value << 5) | index) & 0xffff;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return new Uint8Array(out.slice(0, 20));
}

async function recoveryKek(bytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
	const base = await crypto.subtle.importKey("raw", bytes, "HKDF", false, [
		"deriveKey",
	]);
	return crypto.subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: new Uint8Array(0),
			info: new TextEncoder().encode("mythings/recovery"),
		},
		base,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

export function newRecoveryKey(): string {
	return encodeRecovery(crypto.getRandomValues(new Uint8Array(20)));
}

export const isRecoveryKey = (text: string) => decodeRecovery(text) !== null;

// ---------------------------------------------------------------------------
// Keys on this device

async function rawOf(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
	return new Uint8Array(
		(await crypto.subtle.exportKey("raw", key)) as ArrayBuffer,
	);
}

/** Keeps the key on this device (behind its passcode, if it has one) and opens it. */
async function keepOnDevice(
	userId: string,
	raw: Uint8Array<ArrayBuffer>,
	passcode?: string,
) {
	const record = await loadDeviceRecord(userId);
	if (passcode) await savePasscodeKey(userId, raw, passcode);
	else if (record?.mode !== "passcode") await saveDeviceKey(userId, raw);
	setKey(await usableKey(raw), passcode ? true : record?.mode === "passcode");
}

async function bundle(
	raw: Uint8Array<ArrayBuffer>,
	encKey: CryptoKey,
	recovery: string,
) {
	const recoveryBytes = decodeRecovery(recovery);
	if (!recoveryBytes) throw new Error("Bad recovery key");
	return {
		version: 1 as const,
		wrappedByPassword: await wrapKey(raw, encKey, PASSWORD_AAD),
		wrappedByRecovery: await wrapKey(
			raw,
			await recoveryKek(recoveryBytes),
			RECOVERY_AAD,
		),
	};
}

/**
 * Turns encryption on (or replaces the keys, for `startOver`) with a
 * recovery key the person has already saved. Existing text is encrypted by
 * `reconcileEncryption` once this returns.
 */
export async function enableEncryption(
	user: Me,
	password: string,
	recovery: string,
	options: { newDataKey?: boolean } = {},
): Promise<Me> {
	const { keys, body } = await confirmBody(user.email, password);
	const current = getCryptoState().key;
	const dataKey =
		!options.newDataKey && current ? current : await generateDataKey();
	const raw = await rawOf(dataKey);
	const updated = await api<Me>("/keys", {
		method: "PUT",
		body: { ...body, ...(await bundle(raw, keys.encKey, recovery)) },
	});
	await markUpgraded(user.email);
	await keepOnDevice(user.id, raw);
	setEncrypted(true);
	return updated;
}

/** A new recovery key for an encrypted account; the old one stops working. */
export async function replaceRecoveryKey(
	user: Me,
	password: string,
	recovery: string,
): Promise<void> {
	const key = getCryptoState().key;
	if (!key) throw new Error("Locked");
	await enableEncryption(user, password, recovery);
}

/** Turns encryption off; `reconcileEncryption` then writes the text back as plain text. */
export async function disableEncryption(
	user: Me,
	password: string,
): Promise<Me> {
	const { body } = await confirmBody(user.email, password);
	const updated = await api<Me>("/keys/disable", { method: "POST", body });
	setEncrypted(false);
	return updated;
}

async function fetchBundle(): Promise<KeyBundle> {
	return api<KeyBundle>("/keys");
}

/** Opens the data key with the password's key (signing in on a new device). */
export async function unlockWithKeys(
	userId: string,
	encKey: CryptoKey,
): Promise<boolean> {
	const keys = await fetchBundle();
	try {
		const raw = await unwrapKey(keys.wrappedByPassword, encKey, PASSWORD_AAD);
		await keepOnDevice(userId, raw);
		return true;
	} catch {
		return false;
	}
}

/**
 * After a password reset on a device that still has the key open: seals the
 * data key under the new password, so other devices can unlock with it.
 */
export async function refreshPasswordWrap(keys: AccountKeys): Promise<void> {
	const key = getCryptoState().key;
	if (!key) return;
	const bundle = await fetchBundle();
	try {
		await unwrapKey(bundle.wrappedByPassword, keys.encKey, PASSWORD_AAD);
		return;
	} catch {}
	await api("/keys/rewrap", {
		method: "POST",
		body: {
			password: keys.authKey,
			wrappedByPassword: await wrapKey(
				await rawOf(key),
				keys.encKey,
				PASSWORD_AAD,
			),
		},
	});
}

export class WrongPassword extends Error {}
export class WrongRecoveryKey extends Error {}

/** Unlocks this device with the account password. */
export async function unlockWithPassword(
	user: Me,
	password: string,
): Promise<void> {
	const keys = await deriveAccountKeys(user.email, password);
	if (!(await unlockWithKeys(user.id, keys.encKey))) throw new WrongPassword();
}

/**
 * Unlocks with the recovery key (after a password reset) and seals the data
 * key under the current password again, so the password works next time.
 */
export async function unlockWithRecovery(
	user: Me,
	password: string,
	recovery: string,
): Promise<void> {
	const bytes = decodeRecovery(recovery);
	if (!bytes) throw new WrongRecoveryKey();
	const keys = await fetchBundle();
	let raw: Uint8Array<ArrayBuffer>;
	try {
		raw = await unwrapKey(
			keys.wrappedByRecovery,
			await recoveryKek(bytes),
			RECOVERY_AAD,
		);
	} catch {
		throw new WrongRecoveryKey();
	}
	const account = await deriveAccountKeys(user.email, password);
	try {
		await api("/keys/rewrap", {
			method: "POST",
			body: {
				password: account.authKey,
				wrappedByPassword: await wrapKey(raw, account.encKey, PASSWORD_AAD),
			},
		});
	} catch (err) {
		if (err instanceof ApiError && err.code === "wrong_password")
			throw new WrongPassword();
		throw err;
	}
	await keepOnDevice(user.id, raw);
}

/** The data key sealed under a new password, for changing it. */
export async function wrapForPassword(
	encKey: CryptoKey,
): Promise<string | undefined> {
	const key = getCryptoState().key;
	return key ? wrapKey(await rawOf(key), encKey, PASSWORD_AAD) : undefined;
}

// ---------------------------------------------------------------------------
// Passcode

export async function setPasscode(userId: string, passcode: string) {
	const key = getCryptoState().key;
	if (!key) throw new Error("Locked");
	await keepOnDevice(userId, await rawOf(key), passcode);
}

export async function removePasscode(userId: string) {
	const key = getCryptoState().key;
	if (!key) throw new Error("Locked");
	await saveDeviceKey(userId, await rawOf(key));
	setKey(key, false);
}

/** Signing out: this device forgets the key. */
export async function forgetKeys(userId: string) {
	await forgetDeviceKey(userId);
	setKey(null, false);
}
