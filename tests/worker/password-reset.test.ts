import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../../worker/crypto";
import { sendMail } from "../../worker/mail";
import {
	api,
	mailTo,
	PASSWORD,
	sessionCookie,
	signup,
	uniqueEmail,
} from "./helpers";

const NEW_PASSWORD = "a fresh new passphrase";

const resetMails = async (email: string) =>
	(await mailTo(email)).filter((m) => m.subject.startsWith("Reset"));

/** The reset token from the link in the newest reset email to `email`. */
async function tokenFor(email: string) {
	const [mail] = await resetMails(email);
	return decodeURIComponent(mail?.text.match(/token=([^\s]+)/)?.[1] ?? "");
}

async function forgot(email: string) {
	return api("/auth/forgot", { method: "POST", body: { email } });
}

afterEach(() => vi.restoreAllMocks());

describe("sending", () => {
	it("sends from the configured address through the EMAIL binding", async () => {
		const send = vi.fn(async () => ({ messageId: "test" }));
		await sendMail(
			{
				...env,
				DEV_MAILBOX: "false",
				EMAIL: { send } as unknown as SendEmail,
			},
			{ to: "a@example.com", subject: "Hi", text: "t", html: "<p>h</p>" },
		);
		expect(send).toHaveBeenCalledWith({
			from: { email: env.MAIL_FROM, name: "mythings" },
			to: "a@example.com",
			subject: "Hi",
			text: "t",
			html: "<p>h</p>",
		});
	});
});

describe("forgot password", () => {
	it("emails a reset link", async () => {
		const { email } = await signup();
		const res = await forgot(email);
		expect(res.status).toBe(200);
		await vi.waitFor(async () =>
			expect(await resetMails(email)).toHaveLength(1),
		);
		const [mail] = await resetMails(email);
		expect(mail).toMatchObject({
			to: email,
			subject: "Reset your mythings password",
		});
		expect(mail?.text).toContain(`${env.APP_ORIGIN}/reset-password?token=`);
	});

	it("does its database work after answering, for known and unknown emails alike", async () => {
		const { email } = await signup();
		const res = await forgot(email);
		expect(await res.json()).toEqual({ ok: true });
		// The link is created in the background, after the response.
		await vi.waitFor(async () =>
			expect(await resetMails(email)).toHaveLength(1),
		);
	});

	it("answers the same for unknown emails, and sends nothing", async () => {
		const email = uniqueEmail();
		const res = await forgot(email);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		await new Promise((r) => setTimeout(r, 50));
		expect(await mailTo(email)).toHaveLength(0);
	});

	it("stores only a hash of the token", async () => {
		const { email } = await signup();
		await forgot(email);
		await vi.waitFor(async () =>
			expect(await resetMails(email)).toHaveLength(1),
		);
		const token = await tokenFor(email);
		const raw = await env.DB.prepare(
			"SELECT 1 FROM password_resets WHERE token_hash = ?",
		)
			.bind(token)
			.first();
		expect(raw).toBeNull();
		const hashed = await env.DB.prepare(
			"SELECT 1 FROM password_resets WHERE token_hash = ?",
		)
			.bind(await sha256Hex(token))
			.first();
		expect(hashed).not.toBeNull();
	});
});

describe("reset password", () => {
	async function resetLink() {
		const account = await signup();
		await forgot(account.email);
		await vi.waitFor(async () =>
			expect(await resetMails(account.email)).toHaveLength(1),
		);
		return { ...account, token: await tokenFor(account.email) };
	}

	it("sets the new password, signs out other sessions, and signs in", async () => {
		const { email, cookie, token } = await resetLink();
		const res = await api("/auth/reset", {
			method: "POST",
			body: { token, password: NEW_PASSWORD },
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ email });
		const fresh = sessionCookie(res);
		expect((await api("/me", { cookie: fresh })).status).toBe(200);
		expect((await api("/me", { cookie })).status).toBe(401);

		const old = await api("/auth/login", {
			method: "POST",
			body: { email, password: PASSWORD },
		});
		expect(old.status).toBe(401);
		const login = await api("/auth/login", {
			method: "POST",
			body: { email, password: NEW_PASSWORD },
		});
		expect(login.status).toBe(200);
	});

	it("works once", async () => {
		const { token } = await resetLink();
		const body = { token, password: NEW_PASSWORD };
		expect((await api("/auth/reset", { method: "POST", body })).status).toBe(
			200,
		);
		const again = await api("/auth/reset", { method: "POST", body });
		expect(again.status).toBe(400);
		expect(await again.json()).toEqual({ error: "invalid_token" });
	});

	it("only the newest link works", async () => {
		const { email, token } = await resetLink();
		await forgot(email);
		await vi.waitFor(async () =>
			expect(await resetMails(email)).toHaveLength(2),
		);
		const res = await api("/auth/reset", {
			method: "POST",
			body: { token, password: NEW_PASSWORD },
		});
		expect(res.status).toBe(400);
	});

	it("expires after an hour", async () => {
		const { token } = await resetLink();
		await env.DB.prepare(
			"UPDATE password_resets SET expires_at = ? WHERE token_hash = ?",
		)
			.bind(Date.now() - 1, await sha256Hex(token))
			.run();
		const res = await api("/auth/reset", {
			method: "POST",
			body: { token, password: NEW_PASSWORD },
		});
		expect(res.status).toBe(400);
	});

	it("still needs a valid password", async () => {
		const { token } = await resetLink();
		const res = await api("/auth/reset", {
			method: "POST",
			body: { token, password: "short" },
		});
		expect(res.status).toBe(400);
		expect(await res.json()).toMatchObject({ error: "invalid_input" });
	});
});

describe("rate limits", () => {
	it("limits sign-ups per IP", async () => {
		const headers = { "cf-connecting-ip": "203.0.113.50" };
		const statuses: number[] = [];
		for (let i = 0; i < 6; i++) {
			const res = await api("/auth/signup", {
				method: "POST",
				body: { name: "Test", email: uniqueEmail() },
				headers,
			});
			statuses.push(res.status);
		}
		expect(statuses.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
		expect(statuses[5]).toBe(429);
	});

	it("limits reset requests per IP and email", async () => {
		const headers = { "cf-connecting-ip": "203.0.113.51" };
		const email = uniqueEmail();
		const statuses: number[] = [];
		for (let i = 0; i < 4; i++) {
			const res = await api("/auth/forgot", {
				method: "POST",
				body: { email },
				headers,
			});
			statuses.push(res.status);
		}
		expect(statuses).toEqual([200, 200, 200, 429]);
	});

	it("limits reset requests per IP across emails", async () => {
		const headers = { "cf-connecting-ip": "203.0.113.52" };
		const statuses: number[] = [];
		for (let i = 0; i < 4; i++) {
			const res = await api("/auth/forgot", {
				method: "POST",
				body: { email: uniqueEmail() },
				headers,
			});
			statuses.push(res.status);
		}
		expect(statuses).toEqual([200, 200, 200, 429]);
	});

	it("limits sign-up and reset emails to one address from many IPs", async () => {
		const email = uniqueEmail();
		const forgot = await Promise.all(
			Array.from({ length: 4 }, () =>
				api("/auth/forgot", { method: "POST", body: { email } }),
			),
		);
		expect(forgot.map((r) => r.status).sort()).toEqual([200, 200, 200, 429]);
		const signups: number[] = [];
		for (let i = 0; i < 6; i++) {
			const res = await api("/auth/signup", {
				method: "POST",
				body: { name: "Test", email },
			});
			signups.push(res.status);
		}
		expect(signups.slice(0, 5)).toEqual([202, 202, 202, 202, 202]);
		expect(signups[5]).toBe(429);
	});
});
