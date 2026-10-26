import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../worker/crypto";
import app from "../../worker/index";
import {
	api,
	PASSWORD,
	sessionCookie,
	signup,
	signupToken,
	skipEmailCooldown,
	uniqueEmail,
} from "./helpers";

const DAY = 24 * 60 * 60 * 1000;

async function sessionRow(cookie: string) {
	const token = cookie.split("=")[1] ?? "";
	return env.DB.prepare("SELECT * FROM sessions WHERE token_hash = ?")
		.bind(await sha256Hex(token))
		.first<{ user_id: string; expires_at: number }>();
}

describe("signup", () => {
	it("creates the user once the emailed link is opened, with a hardened session cookie", async () => {
		const email = uniqueEmail();
		const started = await api("/auth/signup", {
			method: "POST",
			body: {
				name: "  Ada Lovelace ",
				email: `  ${email.toUpperCase()} `,
				tz: "Australia/Sydney",
			},
		});
		expect(started.status).toBe(202);
		expect(await started.json()).toEqual({ pending: true, email });
		expect(started.headers.get("set-cookie")).toBeNull();
		const res = await api("/auth/signup/verify", {
			method: "POST",
			body: {
				token: await signupToken(email),
				name: "Ada Lovelace",
				password: PASSWORD,
			},
		});
		expect(res.status).toBe(201);
		const body = await res.json<{
			id: string;
			email: string;
			name: string;
			tz: string;
			settings: object;
		}>();
		expect(body).toEqual({
			id: expect.any(String),
			email,
			name: "Ada Lovelace",
			tz: "Australia/Sydney",
			settings: {},
		});

		const setCookie = res.headers.get("set-cookie") ?? "";
		expect(setCookie).toMatch(/HttpOnly/i);
		expect(setCookie).toMatch(/Secure/i);
		expect(setCookie).toMatch(/SameSite=Lax/i);
		expect(setCookie).toMatch(/Path=\//);
		expect(setCookie).toMatch(/Max-Age=2592000/);

		const me = await api("/me", { cookie: sessionCookie(res) });
		expect(await me.json()).toEqual(body);
	});

	it("stores only a hash of the session token", async () => {
		const { cookie } = await signup();
		const token = cookie.split("=")[1] ?? "";
		const raw = await env.DB.prepare(
			"SELECT 1 FROM sessions WHERE token_hash = ?",
		)
			.bind(token)
			.first();
		expect(raw).toBeNull();
		expect(await sessionRow(cookie)).not.toBeNull();
	});

	it("doesn't create a second account for an email, regardless of case", async () => {
		const { email } = await signup();
		await skipEmailCooldown(email);
		const res = await api("/auth/signup", {
			method: "POST",
			body: { name: "Someone", email: email.toUpperCase() },
		});
		expect(res.status).toBe(202);
		const pending = await env.DB.prepare(
			"SELECT 1 FROM signup_links WHERE email = ?",
		)
			.bind(email)
			.first();
		expect(pending).toBeNull();
	});

	it("validates input", async () => {
		const res = await api("/auth/signup", {
			method: "POST",
			body: { name: " ", email: "not-an-email", tz: "Mars/Olympus" },
		});
		expect(res.status).toBe(400);
		const body = await res.json<{
			error: string;
			issues: { path: string[] }[];
		}>();
		expect(body.error).toBe("invalid_input");
		expect(body.issues.map((i) => i.path[0]).sort()).toEqual([
			"email",
			"name",
			"tz",
		]);
	});

	it("rejects malformed JSON", async () => {
		const res = await api("/auth/signup", { method: "POST", rawBody: "{nope" });
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "invalid_json" });
	});

	it("is blocked when signups are closed", async () => {
		const res = await app.request(
			"/api/auth/signup",
			{
				method: "POST",
				headers: {
					origin: "http://localhost",
					"content-type": "application/json",
				},
				body: JSON.stringify({ name: "Test", email: uniqueEmail() }),
			},
			{ ...env, SIGNUPS_OPEN: "false" },
		);
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "signups_closed" });
	});
});

describe("login", () => {
	it("starts a new session with the right password", async () => {
		const { email, cookie: first } = await signup();
		const res = await api("/auth/login", {
			method: "POST",
			body: { email: email.toUpperCase(), password: PASSWORD },
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ email });
		const second = sessionCookie(res);
		expect(second).not.toBe(first);
		expect((await api("/me", { cookie: second })).status).toBe(200);
	});

	it("gives the same error for a wrong password and an unknown email", async () => {
		const { email } = await signup();
		const wrong = await api("/auth/login", {
			method: "POST",
			body: { email, password: "wrong password" },
		});
		const unknown = await api("/auth/login", {
			method: "POST",
			body: { email: uniqueEmail(), password: PASSWORD },
		});
		for (const res of [wrong, unknown]) {
			expect(res.status).toBe(401);
			expect(await res.json()).toEqual({ error: "invalid_credentials" });
			expect(res.headers.get("set-cookie")).toBeNull();
		}
	});

	it("rate-limits repeated attempts for the same IP and email", async () => {
		const { email } = await signup();
		const attempt = () =>
			api("/auth/login", {
				method: "POST",
				body: { email, password: "wrong password" },
				headers: { "cf-connecting-ip": "203.0.113.7" },
			});
		for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
		const blocked = await attempt();
		expect(blocked.status).toBe(429);
		expect(await blocked.json()).toEqual({ error: "too_many_attempts" });
	});

	it("rate-limits one IP trying passwords across many emails", async () => {
		const attempt = () =>
			api("/auth/login", {
				method: "POST",
				body: { email: uniqueEmail(), password: "wrong password" },
				headers: { "cf-connecting-ip": "203.0.113.8" },
			});
		for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
		expect((await attempt()).status).toBe(429);
	});

	it("rate-limits one email tried from many IPs", async () => {
		const { email } = await signup();
		// api() sends each request from a different IP.
		const attempt = () =>
			api("/auth/login", {
				method: "POST",
				body: { email, password: "wrong password" },
			});
		for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(401);
		expect((await attempt()).status).toBe(429);
	});
});

describe("sessions", () => {
	it("requires a valid session for /me", async () => {
		expect((await api("/me")).status).toBe(401);
		const res = await api("/me", { cookie: "mt_session=garbage" });
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "unauthorized" });
	});

	it("logout ends the session server-side", async () => {
		const { cookie } = await signup();
		const res = await api("/auth/logout", { method: "POST", cookie });
		expect(res.status).toBe(200);
		const cleared = res.headers.get("set-cookie") ?? "";
		expect(cleared).toMatch(/mt_session=;.*Max-Age=0/);
		// Cleared with the same attributes it was set with.
		expect(cleared).toMatch(/HttpOnly/i);
		expect(cleared).toMatch(/Secure/i);
		expect(cleared).toMatch(/SameSite=Lax/i);
		expect(await sessionRow(cookie)).toBeNull();
		expect((await api("/me", { cookie })).status).toBe(401);
	});

	it("rejects expired sessions", async () => {
		const { cookie } = await signup();
		const token = cookie.split("=")[1] ?? "";
		await env.DB.prepare(
			"UPDATE sessions SET expires_at = ? WHERE token_hash = ?",
		)
			.bind(Date.now() - 1, await sha256Hex(token))
			.run();
		expect((await api("/me", { cookie })).status).toBe(401);
	});

	it("slides the expiry forward once the session is a day old", async () => {
		const { cookie } = await signup();
		const fresh = await api("/me", { cookie });
		expect(fresh.headers.get("set-cookie")).toBeNull();

		const token = cookie.split("=")[1] ?? "";
		await env.DB.prepare(
			"UPDATE sessions SET expires_at = ? WHERE token_hash = ?",
		)
			.bind(Date.now() + 2 * DAY, await sha256Hex(token))
			.run();
		const res = await api("/me", { cookie });
		expect(res.status).toBe(200);
		expect(res.headers.get("set-cookie")).toMatch(/mt_session=/);
		const row = await sessionRow(cookie);
		expect(row?.expires_at).toBeGreaterThan(Date.now() + 29 * DAY);
	});
});

describe("PATCH /me", () => {
	it("updates the time zone and merges settings", async () => {
		const { cookie } = await signup();
		await api("/me", {
			method: "PATCH",
			cookie,
			body: { settings: { theme: "dark" } },
		});
		const res = await api("/me", {
			method: "PATCH",
			cookie,
			body: { tz: "America/New_York", settings: { weekStart: 1 } },
		});
		expect(res.status).toBe(200);
		const expected = {
			tz: "America/New_York",
			settings: { theme: "dark", weekStart: 1 },
		};
		expect(await res.json()).toMatchObject(expected);
		expect(await (await api("/me", { cookie })).json()).toMatchObject(expected);
	});

	it("sets, changes and clears the name", async () => {
		const { cookie } = await signup();
		const rename = (name: string) =>
			api("/me", { method: "PATCH", cookie, body: { name } });
		expect(await (await rename("  Grace Hopper ")).json()).toMatchObject({
			name: "Grace Hopper",
		});
		expect(await (await api("/me", { cookie })).json()).toMatchObject({
			name: "Grace Hopper",
		});
		// Other changes leave it alone.
		await api("/me", { method: "PATCH", cookie, body: { tz: "Asia/Tokyo" } });
		expect(await (await api("/me", { cookie })).json()).toMatchObject({
			name: "Grace Hopper",
		});
		expect(await (await rename("")).json()).toMatchObject({ name: null });
		expect((await rename("x".repeat(101))).status).toBe(400);
		expect((await rename("line\nbreak")).status).toBe(400);
	});

	it("keeps accounts from before names working: name is null until set", async () => {
		const { cookie, email } = await signup();
		await env.DB.prepare("UPDATE users SET name = NULL WHERE email = ?")
			.bind(email)
			.run();
		const me = await api("/me", { cookie });
		expect(me.status).toBe(200);
		expect(await me.json()).toMatchObject({ email, name: null });
	});

	it("rejects unknown settings and bad time zones", async () => {
		const { cookie } = await signup();
		for (const body of [
			{ settings: { fontSize: 20 } },
			{ tz: "Nowhere/Land" },
			{ email: "x@y.z" },
		]) {
			const res = await api("/me", { method: "PATCH", cookie, body });
			expect(res.status).toBe(400);
		}
	});
});

describe("origin check", () => {
	it("rejects state-changing requests without a matching Origin", async () => {
		const body = { name: "Test", email: uniqueEmail() };
		for (const origin of ["https://evil.example", ""]) {
			const res = await api("/auth/signup", {
				method: "POST",
				body,
				headers: { origin },
			});
			expect(res.status).toBe(403);
			expect(await res.json()).toEqual({ error: "bad_origin" });
		}
	});

	it("accepts the configured APP_ORIGIN", async () => {
		const res = await api("/auth/signup", {
			method: "POST",
			body: { name: "Test", email: uniqueEmail() },
			headers: { origin: env.APP_ORIGIN },
		});
		expect(res.status).toBe(202);
	});

	it("allows GET requests from anywhere", async () => {
		const res = await api("/health", {
			headers: { origin: "https://evil.example" },
		});
		expect(res.status).toBe(200);
	});
});

describe("auth config", () => {
	it("reports the auth mode and whether signups are open", async () => {
		expect(await (await api("/auth/config")).json()).toEqual({
			mode: "password",
			signupsOpen: true,
		});
	});
});

describe("failed sign-in lock", () => {
	const login = (email: string, password: string) =>
		api("/auth/login", { method: "POST", body: { email, password } });
	// The per-address rate limit allows 5 tries a minute, so start at 9 failures.
	const nineFailures = (email: string) =>
		env.DB.prepare("INSERT INTO login_failures (email, failures) VALUES (?, 9)")
			.bind(email)
			.run();

	it("locks an email for 15 minutes on the 10th failure in a row, known or not", async () => {
		const { email } = await signup();
		for (const address of [email, uniqueEmail()]) {
			await nineFailures(address);
			expect((await login(address, "wrong password")).status).toBe(401);
			const locked = await login(address, PASSWORD);
			expect(locked.status).toBe(429);
			expect(await locked.json()).toEqual({ error: "login_locked" });
		}
		const row = await env.DB.prepare(
			"SELECT locked_until FROM login_failures WHERE email = ?",
		)
			.bind(email)
			.first<{ locked_until: number }>();
		expect(row?.locked_until).toBeGreaterThan(Date.now() + 14 * 60 * 1000);
		expect(row?.locked_until).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);

		await env.DB.prepare(
			"UPDATE login_failures SET locked_until = ? WHERE email = ?",
		)
			.bind(Date.now() - 1, email)
			.run();
		expect((await login(email, PASSWORD)).status).toBe(200);
	});

	it("counts failures and starts over after a successful sign-in", async () => {
		const { email } = await signup();
		await login(email, "wrong password");
		await login(email, "wrong password");
		const failures = () =>
			env.DB.prepare("SELECT failures FROM login_failures WHERE email = ?")
				.bind(email)
				.first<{ failures: number }>();
		expect((await failures())?.failures).toBe(2);
		expect((await login(email, PASSWORD)).status).toBe(200);
		expect(await failures()).toBeNull();
	});
});

describe("session lifetime", () => {
	it("ends a session 180 days after sign-in, however active", async () => {
		const { cookie } = await signup();
		const hash = await sha256Hex(cookie.split("=")[1] ?? "");
		const created = Date.now() - 170 * DAY;
		await env.DB.prepare(
			"UPDATE sessions SET created_at = ?, expires_at = ? WHERE token_hash = ?",
		)
			.bind(created, Date.now() + 60 * 60 * 1000, hash)
			.run();
		// Near the end, sliding stops at the maximum age.
		expect((await api("/me", { cookie })).status).toBe(200);
		expect((await sessionRow(cookie))?.expires_at).toBe(created + 180 * DAY);

		await env.DB.prepare(
			"UPDATE sessions SET created_at = ? WHERE token_hash = ?",
		)
			.bind(Date.now() - 180 * DAY - 1, hash)
			.run();
		expect((await api("/me", { cookie })).status).toBe(401);
	});
});
