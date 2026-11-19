// This device's copy of the account's data key (SPEC §8.5), shared by the
// page and the service worker (no DOM here). The key is never stored usable:
//
// - without a passcode it's sealed under a random device key that can't be
//   read out of the browser (a non-extractable CryptoKey), so the service
//   worker can still open it to show a reminder's text;
// - with a passcode it's sealed under a key derived from the passcode, so a
//   locked device holds nothing it can read.

import Dexie, { type Table } from "dexie";
import {
	fromBase64,
	importAesKey,
	toBase64,
	unwrapKey,
	wrapKey,
} from "../../shared/crypto/envelope";

export const PASSCODE_ITERATIONS = 600_000;
/** Wrong passcodes in a row before this device forgets the key. */
export const PASSCODE_ATTEMPTS = 10;

export type DeviceKeyRecord = {
	userId: string;
	/** The data key, sealed. */
	wrapped: string;
} & (
	| { mode: "device"; deviceKey: CryptoKey }
	| { mode: "passcode"; salt: string; iterations: number; failures: number }
);

class KeyDb extends Dexie {
	keys!: Table<DeviceKeyRecord, string>;
	constructor() {
		super("mythings-keys");
		this.version(1).stores({ keys: "userId" });
	}
}

let db: KeyDb | null = null;
const keyDb = () => {
	db ??= new KeyDb();
	return db;
};

const DEVICE_AAD = "dk.device";
const PASSCODE_AAD = "dk.passcode";

export function loadDeviceRecord(
	userId: string,
): Promise<DeviceKeyRecord | undefined> {
	return keyDb().keys.get(userId);
}

export function listDeviceRecords(): Promise<DeviceKeyRecord[]> {
	return keyDb().keys.toArray();
}

export async function forgetDeviceKey(userId: string): Promise<void> {
	await keyDb().keys.delete(userId);
}

/** Saves the data key on this device without a passcode. */
export async function saveDeviceKey(
	userId: string,
	raw: Uint8Array<ArrayBuffer>,
): Promise<void> {
	const deviceKey = (await crypto.subtle.generateKey(
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	)) as CryptoKey;
	await keyDb().keys.put({
		userId,
		mode: "device",
		deviceKey,
		wrapped: await wrapKey(raw, deviceKey, DEVICE_AAD),
	});
}

async function passcodeKey(
	passcode: string,
	salt: Uint8Array<ArrayBuffer>,
	iterations: number,
): Promise<CryptoKey> {
	const base = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(passcode) as Uint8Array<ArrayBuffer>,
		"PBKDF2",
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations },
		base,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

/** Saves the data key on this device behind a passcode. */
export async function savePasscodeKey(
	userId: string,
	raw: Uint8Array<ArrayBuffer>,
	passcode: string,
): Promise<void> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const kek = await passcodeKey(passcode, salt, PASSCODE_ITERATIONS);
	await keyDb().keys.put({
		userId,
		mode: "passcode",
		salt: toBase64(salt),
		iterations: PASSCODE_ITERATIONS,
		failures: 0,
		wrapped: await wrapKey(raw, kek, PASSCODE_AAD),
	});
}

/** The data key's raw bytes, if this device can open it without a passcode. */
export async function openDeviceKey(
	userId: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
	const record = await loadDeviceRecord(userId);
	if (record?.mode !== "device") return null;
	try {
		return await unwrapKey(record.wrapped, record.deviceKey, DEVICE_AAD);
	} catch {
		return null;
	}
}

export type PasscodeResult =
	| { ok: true; raw: Uint8Array<ArrayBuffer> }
	| { ok: false; attemptsLeft: number };

/** Opens the data key with the passcode. Too many wrong ones forget it. */
export async function openWithPasscode(
	userId: string,
	passcode: string,
): Promise<PasscodeResult> {
	const record = await loadDeviceRecord(userId);
	if (record?.mode !== "passcode") return { ok: false, attemptsLeft: 0 };
	const kek = await passcodeKey(
		passcode,
		fromBase64(record.salt),
		record.iterations,
	);
	try {
		const raw = await unwrapKey(record.wrapped, kek, PASSCODE_AAD);
		if (record.failures > 0) await keyDb().keys.put({ ...record, failures: 0 });
		return { ok: true, raw };
	} catch {
		const failures = record.failures + 1;
		if (failures >= PASSCODE_ATTEMPTS) await forgetDeviceKey(userId);
		else await keyDb().keys.put({ ...record, failures });
		return { ok: false, attemptsLeft: PASSCODE_ATTEMPTS - failures };
	}
}

/** The data key as a usable key; extractable in memory so it can be re-sealed. */
export const usableKey = (raw: Uint8Array<ArrayBuffer>) =>
	importAesKey(raw, true);
