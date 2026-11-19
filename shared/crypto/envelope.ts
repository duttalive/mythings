// End-to-end encryption of text fields (SPEC §8.5). A field is encrypted with
// the account's data key (AES-256-GCM) into an "envelope" string:
//
//   e1:<base64(12-byte IV ‖ ciphertext ‖ 16-byte tag)>
//
// The additional authenticated data is "<entity>.<field>", so a ciphertext
// can't be moved to another kind of field, but it can be copied between rows
// (the server copies repeating to-dos and projects without reading them).
// Uses only WebCrypto, so it runs in the page, the service worker and Workers.

export const ENVELOPE_PREFIX = "e1:";
/** IV (12) + GCM tag (16) bytes, base64 encoded, is at least 40 characters. */
export const ENVELOPE_PATTERN = /^e1:[A-Za-z0-9+/]{38,}={0,2}$/;

export function isEnvelope(value: unknown): boolean {
	return typeof value === "string" && ENVELOPE_PATTERN.test(value);
}

export function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
	const binary = atob(text);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

const encoder = new TextEncoder();
const utf8 = (text: string) => encoder.encode(text) as Uint8Array<ArrayBuffer>;
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

/** Encrypts bytes with AES-GCM: IV ‖ ciphertext ‖ tag. */
export async function sealBytes(
	key: CryptoKey,
	plaintext: Uint8Array<ArrayBuffer>,
	aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const sealed = new Uint8Array(
		await crypto.subtle.encrypt(
			{ name: "AES-GCM", iv, additionalData: encoder.encode(aad) },
			key,
			plaintext,
		),
	);
	const out = new Uint8Array(iv.length + sealed.length);
	out.set(iv);
	out.set(sealed, iv.length);
	return out;
}

/** Reverses `sealBytes`. Throws if the key or AAD is wrong or the data was changed. */
export async function openBytes(
	key: CryptoKey,
	sealed: Uint8Array<ArrayBuffer>,
	aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
	if (sealed.length < 28) throw new Error("Ciphertext too short");
	return new Uint8Array(
		await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: sealed.subarray(0, 12),
				additionalData: encoder.encode(aad),
			},
			key,
			sealed.subarray(12),
		),
	);
}

export async function encryptText(
	key: CryptoKey,
	text: string,
	aad: string,
): Promise<string> {
	return ENVELOPE_PREFIX + toBase64(await sealBytes(key, utf8(text), aad));
}

export async function decryptText(
	key: CryptoKey,
	envelope: string,
	aad: string,
): Promise<string> {
	if (!isEnvelope(envelope)) throw new Error("Not an encrypted value");
	const bytes = fromBase64(envelope.slice(ENVELOPE_PREFIX.length));
	return decoder.decode(await openBytes(key, bytes, aad));
}

/** A new random data key (extractable, so it can be wrapped). */
export function generateDataKey(): Promise<CryptoKey> {
	return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
		"encrypt",
		"decrypt",
	]) as Promise<CryptoKey>;
}

/** Imports 32 raw bytes as an AES-GCM key. */
export function importAesKey(
	raw: Uint8Array<ArrayBuffer>,
	extractable = false,
): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, extractable, [
		"encrypt",
		"decrypt",
	]);
}

/** The data key's raw bytes, sealed under a key-encryption key, as base64. */
export async function wrapKey(
	dataKeyRaw: Uint8Array<ArrayBuffer>,
	kek: CryptoKey,
	aad: string,
): Promise<string> {
	return toBase64(await sealBytes(kek, dataKeyRaw, aad));
}

export async function unwrapKey(
	wrapped: string,
	kek: CryptoKey,
	aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
	const raw = await openBytes(kek, fromBase64(wrapped), aad);
	if (raw.length !== 32) throw new Error("Bad key length");
	return raw;
}
