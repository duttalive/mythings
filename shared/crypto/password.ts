// Keys derived from the account password on the device (SPEC §8.5). The
// server is sent `authKey` in place of the password and stores a hash of it
// as before; `encKey` never leaves the device and unlocks the data key. The
// salt comes from the email, so no request is needed before signing in (and
// none could reveal whether an account exists).

import { toBase64 } from "./envelope";

export const PASSWORD_KDF_ITERATIONS = 600_000;
export const MIN_PASSWORD_LENGTH = 8;

const encoder = new TextEncoder();

export type AccountKeys = {
	/** Sent to the server instead of the password. */
	authKey: string;
	/** Wraps the data key. Never sent anywhere. */
	encKey: CryptoKey;
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function deriveAccountKeys(
	email: string,
	password: string,
	iterations = PASSWORD_KDF_ITERATIONS,
): Promise<AccountKeys> {
	const salt = new Uint8Array(
		await crypto.subtle.digest(
			"SHA-256",
			encoder.encode(`mythings/v1/${normalizeEmail(email)}`),
		),
	);
	const passwordKey = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const master = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations },
		passwordKey,
		256,
	);
	const hkdf = await crypto.subtle.importKey("raw", master, "HKDF", false, [
		"deriveBits",
		"deriveKey",
	]);
	const empty = new Uint8Array(0);
	const auth = await crypto.subtle.deriveBits(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: empty,
			info: encoder.encode("mythings/auth"),
		},
		hkdf,
		256,
	);
	const encKey = await crypto.subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: empty,
			info: encoder.encode("mythings/enc"),
		},
		hkdf,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
	return { authKey: toBase64(new Uint8Array(auth)), encKey };
}
