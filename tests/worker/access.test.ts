import { env } from "cloudflare:test";
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../../worker/index";
import { uniqueEmail } from "./helpers";

const TEAM = "myteam.cloudflareaccess.com";
const AUD = "test-aud";
const accessEnv = {
	...env,
	AUTH_MODE: "access",
	ACCESS_TEAM_DOMAIN: TEAM,
	ACCESS_AUD: AUD,
};

let privateKey: CryptoKey;
let publicJwk: JWK;

beforeAll(async () => {
	const pair = await generateKeyPair("RS256", { extractable: true });
	privateKey = pair.privateKey;
	publicJwk = {
		...(await exportJWK(pair.publicKey)),
		kid: "k1",
		alg: "RS256",
		use: "sig",
	};

	const realFetch = globalThis.fetch;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const url = input instanceof Request ? input.url : String(input);
		if (url === `https://${TEAM}/cdn-cgi/access/certs`) {
			return Response.json({ keys: [publicJwk] });
		}
		return realFetch(input, init);
	});
});

afterAll(() => {
	vi.restoreAllMocks();
});

function token(claims: { email: string; aud?: string; iss?: string }) {
	return new SignJWT({ email: claims.email })
		.setProtectedHeader({ alg: "RS256", kid: "k1" })
		.setIssuer(claims.iss ?? `https://${TEAM}`)
		.setAudience(claims.aud ?? AUD)
		.setIssuedAt()
		.setExpirationTime("5m")
		.sign(privateKey);
}

function me(jwt?: string) {
	return app.request(
		"/api/me",
		{ headers: jwt ? { "cf-access-jwt-assertion": jwt } : {} },
		accessEnv,
	);
}

describe("AUTH_MODE=access", () => {
	it("creates the user on first request and reuses it after", async () => {
		const email = uniqueEmail();
		const first = await me(await token({ email: email.toUpperCase() }));
		expect(first.status).toBe(200);
		const user = await first.json<{ id: string; email: string }>();
		expect(user.email).toBe(email);

		const again = await me(await token({ email }));
		expect((await again.json<{ id: string }>()).id).toBe(user.id);
	});

	it("rejects missing, wrong-audience and wrong-issuer tokens", async () => {
		const email = uniqueEmail();
		for (const res of [
			await me(),
			await me(await token({ email, aud: "someone-else" })),
			await me(
				await token({ email, iss: "https://evil.cloudflareaccess.com" }),
			),
			await me("not.a.jwt"),
		]) {
			expect(res.status).toBe(401);
		}
	});

	it("disables password signup and login", async () => {
		for (const path of ["/api/auth/signup", "/api/auth/login"]) {
			const res = await app.request(
				path,
				{
					method: "POST",
					headers: {
						origin: "http://localhost",
						"content-type": "application/json",
					},
					body: JSON.stringify({
						email: uniqueEmail(),
						password: "whatever123",
					}),
				},
				accessEnv,
			);
			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({ error: "auth_mode_access" });
		}
	});

	it("points logout at the Access logout URL", async () => {
		const res = await app.request(
			"/api/auth/logout",
			{ method: "POST", headers: { origin: "http://localhost" } },
			accessEnv,
		);
		expect(await res.json()).toEqual({
			ok: true,
			redirect: "/cdn-cgi/access/logout",
		});
	});
});
