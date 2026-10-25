import { createExecutionContext, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../../worker/index";
import {
	api,
	mailTo,
	PASSWORD,
	signup,
	signupCode,
	uniqueEmail,
} from "./helpers";

async function start(email: string, password = PASSWORD) {
	return api("/auth/signup", { method: "POST", body: { email, password } });
}

async function verify(email: string, code: string, password = PASSWORD) {
	return api("/auth/signup/verify", {
		method: "POST",
		body: { email, code, password },
	});
}

const userCount = async (email: string) =>
	(
		await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email = ?")
			.bind(email)
			.first<{ n: number }>()
	)?.n;

const otherCode = (code: string) => (code === "000000" ? "111111" : "000000");

describe("sign-up email verification", () => {
	it("emails a 6-digit code and creates no account until it's confirmed", async () => {
		const email = uniqueEmail();
		expect((await start(email)).status).toBe(202);
		const [mail] = await mailTo(email);
		expect(mail?.subject).toMatch(/^\d{6} is your mythings code$/);
		expect(mail?.text).toContain(mail?.subject.slice(0, 6));
		expect(await userCount(email)).toBe(0);
		expect(
			(
				await api("/auth/login", {
					method: "POST",
					body: { email, password: PASSWORD },
				})
			).status,
		).toBe(401);

		expect((await verify(email, await signupCode(email))).status).toBe(201);
		expect(await userCount(email)).toBe(1);
	});

	it("rejects a wrong code and still accepts the right one", async () => {
		const email = uniqueEmail();
		await start(email);
		const code = await signupCode(email);
		const wrong = await verify(email, otherCode(code));
		expect(wrong.status).toBe(400);
		expect(await wrong.json()).toEqual({ error: "invalid_code" });
		expect((await verify(email, code)).status).toBe(201);
	});

	it("gives up after 5 wrong guesses", async () => {
		const email = uniqueEmail();
		await start(email);
		const code = await signupCode(email);
		const errors: string[] = [];
		for (let i = 0; i < 5; i++)
			errors.push(
				(await (await verify(email, otherCode(code))).json<{ error: string }>())
					.error,
			);
		expect(errors).toEqual([
			"invalid_code",
			"invalid_code",
			"invalid_code",
			"invalid_code",
			"code_expired",
		]);
		expect((await verify(email, code)).status).toBe(400);
	});

	it("expires after 15 minutes", async () => {
		const email = uniqueEmail();
		await start(email);
		await env.DB.prepare(
			"UPDATE pending_signups SET expires_at = ? WHERE email = ?",
		)
			.bind(Date.now() - 1, email)
			.run();
		const res = await verify(email, await signupCode(email));
		expect(await res.json()).toEqual({ error: "code_expired" });
	});

	it("a resend replaces the code", async () => {
		const email = uniqueEmail();
		await start(email);
		const first = await signupCode(email);
		await start(email);
		const second = await signupCode(email);
		if (first !== second) expect((await verify(email, first)).status).toBe(400);
		expect((await verify(email, second)).status).toBe(201);
	});

	it("sets the password given with the code, not one someone else sent at step 1", async () => {
		const email = uniqueEmail();
		await start(email, "the owner's password");
		await start(email, "an attacker's password");
		const res = await verify(
			email,
			await signupCode(email),
			"the owner's password",
		);
		expect(res.status).toBe(201);
		const login = (password: string) =>
			api("/auth/login", { method: "POST", body: { email, password } });
		expect((await login("an attacker's password")).status).toBe(401);
		expect((await login("the owner's password")).status).toBe(200);
	});

	it("needs a valid password with the code", async () => {
		const email = uniqueEmail();
		await start(email);
		const res = await verify(email, await signupCode(email), "short");
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ error: "invalid_input" });
	});

	it("answers the same for emails that already have an account, and sends no code", async () => {
		const { email } = await signup();
		const fresh = await start(uniqueEmail());
		const res = await start(email);
		expect(res.status).toBe(fresh.status);
		expect(await res.json()).toEqual({ pending: true, email });
		const [mail] = await mailTo(email);
		expect(mail?.subject).toBe("You already have a mythings account");
		expect(mail?.text).not.toMatch(/\d{6}/);
		const pending = await env.DB.prepare(
			"SELECT 1 FROM pending_signups WHERE email = ?",
		)
			.bind(email)
			.first();
		expect(pending).toBeNull();
	});

	it("counts parallel wrong guesses separately", async () => {
		const email = uniqueEmail();
		await start(email);
		const code = await signupCode(email);
		await Promise.all(
			Array.from({ length: 5 }, () => verify(email, otherCode(code))),
		);
		expect((await verify(email, code)).status).toBe(400);
	});

	it("a code works only once", async () => {
		const email = uniqueEmail();
		await start(email);
		const code = await signupCode(email);
		const results = await Promise.all([
			verify(email, code),
			verify(email, code),
		]);
		expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
		expect(await userCount(email)).toBe(1);
	});

	it('is closed when SIGNUPS_OPEN isn\'t "true"', async () => {
		const res = await app.fetch(
			new Request("https://example.com/api/auth/signup", {
				method: "POST",
				headers: {
					origin: "https://example.com",
					"content-type": "application/json",
				},
				body: JSON.stringify({ email: uniqueEmail(), password: PASSWORD }),
			}),
			{ ...env, SIGNUPS_OPEN: "false" },
			createExecutionContext(),
		);
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "signups_closed" });
	});

	it("won't confirm a code while sign-ups are closed", async () => {
		const email = uniqueEmail();
		expect((await start(email)).status).toBe(202);
		const res = await app.fetch(
			new Request("https://example.com/api/auth/signup/verify", {
				method: "POST",
				headers: {
					origin: "https://example.com",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					email,
					code: await signupCode(email),
					password: PASSWORD,
				}),
			}),
			{ ...env, SIGNUPS_OPEN: "false" },
			createExecutionContext(),
		);
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "signups_closed" });
		expect(await userCount(email)).toBe(0);
	});

	it("needs a 6-digit code", async () => {
		const res = await verify(uniqueEmail(), "12ab");
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
