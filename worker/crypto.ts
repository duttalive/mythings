// Password hashing and token helpers built on WebCrypto.
//
// Cloudflare's production runtime caps PBKDF2 at 100k iterations
// (crypto.subtle.deriveBits throws above it), so we stay at that ceiling even
// though current guidance for PBKDF2-SHA256 is higher. The iteration count is
// stored in each hash, so it can be raised later; verifyPassword reports
// needsRehash and login re-hashes old hashes.

export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
	return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
	return toBase64(bytes)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

async function pbkdf2(
	password: string,
	salt: Uint8Array,
	iterations: number,
): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(password),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations },
		key,
		HASH_BITS,
	);
	return new Uint8Array(bits);
}

/** Returns `pbkdf2_sha256$<iterations>$<salt b64>$<hash b64>`. */
export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
	return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export type VerifyResult = { ok: boolean; needsRehash: boolean };

export async function verifyPassword(
	password: string,
	stored: string,
): Promise<VerifyResult> {
	const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
	const iterations = Number(iterStr);
	if (
		scheme !== "pbkdf2_sha256" ||
		!Number.isInteger(iterations) ||
		!saltB64 ||
		!hashB64
	) {
		return { ok: false, needsRehash: false };
	}
	const expected = fromBase64(hashB64);
	const actual = await pbkdf2(password, fromBase64(saltB64), iterations);
	const ok =
		actual.byteLength === expected.byteLength &&
		crypto.subtle.timingSafeEqual(actual, expected);
	return { ok, needsRehash: ok && iterations < PBKDF2_ITERATIONS };
}

// A real hash of a random password, used to spend the same time on unknown
// emails as on wrong passwords so login timing doesn't reveal which emails exist.
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
	dummyHash ??= hashPassword(
		toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
	);
	return dummyHash;
}

/** 32 random bytes, base64url-encoded. */
export function randomToken(): string {
	return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(value: string): Promise<string> {
	const digest = new Uint8Array(
		await crypto.subtle.digest("SHA-256", encoder.encode(value)),
	);
	return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}
