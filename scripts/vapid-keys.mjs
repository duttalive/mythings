// Generates a VAPID key pair for Web Push (SPEC §9) in the format the Worker
// expects: the public key as raw uncompressed P-256 (base64url), the private
// key as its JWK "d" (base64url).
//
//   node scripts/vapid-keys.mjs              print them
//   node scripts/vapid-keys.mjs >> .dev.vars  for local development
//
// For production: wrangler secret put VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.

const pair = await crypto.subtle.generateKey(
	{ name: "ECDSA", namedCurve: "P-256" },
	true,
	["sign", "verify"],
);
const raw = new Uint8Array(
	await crypto.subtle.exportKey("raw", pair.publicKey),
);
const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey);
const base64url = (bytes) => Buffer.from(bytes).toString("base64url");

console.log(`VAPID_PUBLIC_KEY=${base64url(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
