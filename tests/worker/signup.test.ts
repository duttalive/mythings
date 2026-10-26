import { createExecutionContext, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../worker/crypto";
import app from "../../worker/index";
import {
	api,
	mailTo,
	PASSWORD,
	signup,
	signupToken,
	skipEmailCooldown,
	uniqueEmail,
} from "./helpers";

async function start(email: string, name = "Test User") {
	return api("/auth/signup", { method: "POST", body: { name, email } });
}

async function verify(token: string, password = PASSWORD, name = "Test User") {
	return api("/auth/signup/verify", {
		method: "POST",
		body: { token, name, password },
	});
}

const userCount = async (email: string) =>
	(
		await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email = ?")
			.bind(email)
			.first<{ n: number }>()
	)?.n;

const login = (email: string, password = PASSWORD) =>
	api("/auth/login", { method: "POST", body: { email, password } });

/** Calls an auth route with sign-ups closed. */
const whileClosed = (path: string, body: unknown) =>
	app.fetch(
		new Request(`https://example.com/api${path}`, {
			method: "POST",
			headers: {
				origin: "https://example.com",
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		}),
		{ ...env, SIGNUPS_OPEN: "false" },
		createExecutionContext(),
	);

describe("sign-up email verification", () => {
	it("emails a link and creates no account until it's opened", async () => {
		const email = uniqueEmail();
		expect((await start(email)).status).toBe(202);
		const [mail] = await mailTo(email);
		expect(mail?.subject).toBe("Confirm your email for mythings");
		expect(mail?.text).toContain(
			`${env.APP_ORIGIN}/verify-email?token=${await signupToken(email)}\n`,
		);
		expect(await userCount(email)).toBe(0);
		expect((await login(email)).status).toBe(401);

		const res = await verify(await signupToken(email));
		expect(res.status).toBe(201);
		expect(await userCount(email)).toBe(1);
		expect((await login(email)).status).toBe(200);
	});

	it("stores only a hash of the link's token", async () => {
		const email = uniqueEmail();
		await start(email);
		const token = await signupToken(email);
		const row = await env.DB.prepare(
			"SELECT token_hash FROM signup_links WHERE email = ?",
		)
			.bind(email)
			.first<{ token_hash: string }>();
		expect(row?.token_hash).toBe(await sha256Hex(token));
	});

	it("shows whose sign-up a link is for, and nothing for a bad link", async () => {
		const email = uniqueEmail();
		await start(email, "Ada");
		const token = await signupToken(email);
		const res = await api("/auth/signup/link", {
			method: "POST",
			body: { token },
		});
		expect(await res.json()).toEqual({ email, name: "Ada" });
		const bad = await api("/auth/signup/link", {
			method: "POST",
			body: { token: "x".repeat(43) },
		});
		expect(bad.status).toBe(400);
		expect(await bad.json()).toEqual({ error: "link_expired" });
	});

	it("uses the name chosen when finishing, which can differ from step 1", async () => {
		const email = uniqueEmail();
		await start(email, "Someone else");
		const res = await verify(await signupToken(email), PASSWORD, " Ada ");
		expect(await res.json()).toMatchObject({ email, name: "Ada" });
	});

	it("expires after 24 hours", async () => {
		const email = uniqueEmail();
		await start(email);
		const row = await env.DB.prepare(
			"SELECT expires_at - created_at AS ttl FROM signup_links WHERE email = ?",
		)
			.bind(email)
			.first<{ ttl: number }>();
		expect(row?.ttl).toBe(24 * 60 * 60 * 1000);
		await env.DB.prepare(
			"UPDATE signup_links SET expires_at = ? WHERE email = ?",
		)
			.bind(Date.now() - 1, email)
			.run();
		const res = await verify(await signupToken(email));
		expect(await res.json()).toEqual({ error: "link_expired" });
		expect(await userCount(email)).toBe(0);
	});

	it("a resend replaces the link: only the newest works", async () => {
		const email = uniqueEmail();
		await start(email);
		const first = await signupToken(email);
		await skipEmailCooldown(email);
		await start(email);
		const second = await signupToken(email);
		expect(second).not.toBe(first);
		expect((await verify(first)).status).toBe(400);
		expect((await verify(second)).status).toBe(201);
	});

	it("sets the password chosen on the link's page; step 1 takes none", async () => {
		const email = uniqueEmail();
		// Someone else can start a sign-up for this address, but only the
		// inbox's owner gets the link and chooses the password.
		await start(email);
		expect(
			(await verify(await signupToken(email), "the owner's password")).status,
		).toBe(201);
		expect((await login(email, "the owner's password")).status).toBe(200);
	});

	it("needs a valid password and a name to finish", async () => {
		const email = uniqueEmail();
		await start(email);
		const token = await signupToken(email);
		for (const [password, name] of [
			["short", "Ada"],
			[PASSWORD, "  "],
		] as const) {
			const res = await verify(token, password, name);
			expect(res.status).toBe(400);
			expect(await res.json()).toMatchObject({ error: "invalid_input" });
		}
		// A failed attempt doesn't spend the link.
		expect((await verify(token)).status).toBe(201);
	});

	it("answers the same for emails that already have an account, and sends no link", async () => {
		const { email } = await signup();
		await skipEmailCooldown(email);
		const fresh = await start(uniqueEmail());
		const res = await start(email);
		expect(res.status).toBe(fresh.status);
		expect(await res.json()).toEqual({ pending: true, email });
		const [mail] = await mailTo(email);
		expect(mail?.subject).toBe("You already have a mythings account");
		expect(mail?.text).not.toContain("verify-email");
		const pending = await env.DB.prepare(
			"SELECT 1 FROM signup_links WHERE email = ?",
		)
			.bind(email)
			.first();
		expect(pending).toBeNull();
	});

	it("a link works only once", async () => {
		const email = uniqueEmail();
		await start(email);
		const token = await signupToken(email);
		const results = await Promise.all([verify(token), verify(token)]);
		expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
		expect(await userCount(email)).toBe(1);
		expect(await (await verify(token)).json()).toEqual({
			error: "link_expired",
		});
	});

	it('is closed when SIGNUPS_OPEN isn\'t "true"', async () => {
		const res = await whileClosed("/auth/signup", {
			name: "Test",
			email: uniqueEmail(),
		});
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "signups_closed" });
	});

	it("won't finish a sign-up while sign-ups are closed", async () => {
		const email = uniqueEmail();
		expect((await start(email)).status).toBe(202);
		const res = await whileClosed("/auth/signup/verify", {
			token: await signupToken(email),
			name: "Test",
			password: PASSWORD,
		});
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "signups_closed" });
		expect(await userCount(email)).toBe(0);
	});

	it("needs a well-formed token", async () => {
		const res = await verify("short");
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ error: "invalid_input" });
	});

	it("has no dev mailbox outside development", async () => {
		const res = await app.fetch(
			new Request("http://localhost/api/dev/mail"),
			{ ...env, DEV_MAILBOX: "false" },
			createExecutionContext(),
		);
		expect(res.status).toBe(404);
	});

	it("never shows the dev mailbox to a non-local request, even if DEV_MAILBOX is on", async () => {
		await start(uniqueEmail());
		const remoteHost = await app.fetch(
			new Request("https://mythings.example/api/dev/mail"),
			env,
			createExecutionContext(),
		);
		expect(remoteHost.status).toBe(404);
		const realClient = await app.fetch(
			new Request("http://localhost/api/dev/mail", {
				headers: { "cf-connecting-ip": "203.0.113.9" },
			}),
			env,
			createExecutionContext(),
		);
		expect(realClient.status).toBe(404);
	});
});
