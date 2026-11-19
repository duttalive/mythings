// The data key in memory while the app runs (SPEC §8.5), and the boundary
// helpers the sync engine and the hooks use: text is encrypted before it's
// written to IndexedDB or sent, and decrypted when the lists read it.

import { useSyncExternalStore } from "react";
import { isEnvelope } from "../../shared/crypto/envelope";
import {
	decryptRow,
	ENCRYPTED_FIELDS,
	encryptPatch,
} from "../../shared/crypto/fields";
import type { EntityName } from "../../shared/schema";
import { loadDeviceRecord, openDeviceKey, usableKey } from "./deviceKeys";

/** The account is encrypted, but this device hasn't got the key open. */
export class EncryptionLocked extends Error {
	override name = "EncryptionLocked";
	constructor() {
		super("This device is locked");
	}
}

export type CryptoState = {
	userId: string | null;
	/** The account's text is encrypted (from the server). */
	encrypted: boolean;
	/** The data key, while this device has it open. */
	key: CryptoKey | null;
	/** This device keeps the key behind a passcode. */
	passcode: boolean;
	/** Loaded what this device has. */
	ready: boolean;
};

let state: CryptoState = {
	userId: null,
	encrypted: false,
	key: null,
	passcode: false,
	ready: false,
};
const listeners = new Set<() => void>();
/** Envelope → plain text, so unchanged rows aren't decrypted on every render. */
const cache = new Map<string, string>();
const CACHE_LIMIT = 50_000;

function set(patch: Partial<CryptoState>) {
	state = { ...state, ...patch };
	for (const listener of listeners) listener();
}

export const getCryptoState = () => state;

export function subscribeCrypto(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useCryptoState(): CryptoState {
	return useSyncExternalStore(subscribeCrypto, getCryptoState);
}

/** Loads this device's key for the signed-in user. */
export async function startCrypto(
	userId: string,
	encrypted: boolean,
): Promise<void> {
	if (state.userId !== userId) {
		cache.clear();
		set({ userId, key: null, ready: false });
	}
	const record = await loadDeviceRecord(userId);
	const passcode = record?.mode === "passcode";
	let key = state.key;
	if (!key && record?.mode === "device") {
		const raw = await openDeviceKey(userId);
		key = raw ? await usableKey(raw) : null;
	}
	set({ encrypted, passcode, key, ready: true });
}

export function setEncrypted(encrypted: boolean) {
	if (state.encrypted !== encrypted) set({ encrypted });
}

export function setKey(key: CryptoKey | null, passcode = state.passcode) {
	set({ key, passcode });
}

/** Forgets the key in memory and everything decrypted with it. */
export function lockNow() {
	cache.clear();
	set({ key: null });
}

export function resetCrypto() {
	cache.clear();
	set({
		userId: null,
		encrypted: false,
		key: null,
		passcode: false,
		ready: false,
	});
}

/** For the sync engine: encrypts a patch's text when the account is encrypted. */
export async function encryptForSync(
	entity: EntityName,
	patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	if (!state.encrypted) return patch;
	if (!state.key) {
		const needs = ENCRYPTED_FIELDS[entity].some((field) => {
			const value = patch[field];
			return typeof value === "string" && value !== "" && !isEnvelope(value);
		});
		if (!needs) return patch;
		throw new EncryptionLocked();
	}
	return encryptPatch(entity, patch, state.key);
}

/** For the hooks: decrypts rows' text (unchanged rows come from the cache). */
export async function decryptRows<T extends object>(
	entity: EntityName,
	rows: T[],
): Promise<T[]> {
	if (cache.size > CACHE_LIMIT) cache.clear();
	const key = state.key;
	const out: T[] = new Array(rows.length);
	for (let i = 0; i < rows.length; i++)
		out[i] = await decryptRow(entity, rows[i] as T, key, cache);
	return out;
}
