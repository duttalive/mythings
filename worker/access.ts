// AUTH_MODE=access: the app sits behind Cloudflare Access, which signs each
// request with a JWT in `Cf-Access-Jwt-Assertion`. We verify it against the
// team's public keys and identify the user by its email claim.

import type { Context } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ulid } from "ulid";
import type { AppEnv, UserRow } from "./types";

// Users created through Access have no password; this never matches a hash.
const NO_PASSWORD = "!";

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function keySetFor(teamDomain: string) {
	let keySet = keySets.get(teamDomain);
	if (!keySet) {
		keySet = createRemoteJWKSet(
			new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
		);
		keySets.set(teamDomain, keySet);
	}
	return keySet;
}

async function verifiedEmail(c: Context<AppEnv>): Promise<string | null> {
	const { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: aud } = c.env;
	if (!team || !aud)
		throw new Error(
			"AUTH_MODE=access requires ACCESS_TEAM_DOMAIN and ACCESS_AUD",
		);

	const token = c.req.header("cf-access-jwt-assertion");
	if (!token) return null;
	try {
		const { payload } = await jwtVerify(token, keySetFor(team), {
			issuer: `https://${team}`,
			audience: aud,
		});
		return typeof payload.email === "string"
			? payload.email.toLowerCase()
			: null;
	} catch {
		return null;
	}
}

export async function getAccessUser(
	c: Context<AppEnv>,
): Promise<UserRow | null> {
	const email = await verifiedEmail(c);
	if (!email) return null;

	await c.env.DB.prepare(
		"INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING",
	)
		.bind(ulid(), email, NO_PASSWORD, Date.now())
		.run();
	return c.env.DB.prepare("SELECT * FROM users WHERE email = ?")
		.bind(email)
		.first<UserRow>();
}
