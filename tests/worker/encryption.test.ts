import { env } from "cloudflare:test";
import { ulid } from "ulid";
import { describe, expect, it } from "vitest";
import {
	encryptText,
	generateDataKey,
	toBase64,
} from "../../shared/crypto/envelope";
import { deriveAccountKeys } from "../../shared/crypto/password";
import type { Me, PushResult } from "../../shared/schema";
import { hashPassword } from "../../worker/crypto";
import { api, PASSWORD, sessionCookie, signup, uniqueEmail } from "./helpers";

// Fewer iterations: the derivation itself isn't what's tested here.
const keysFor = (email: string, password = PASSWORD) =>
	deriveAccountKeys(email, password, 1000);

const wrapped = () => toBase64(crypto.getRandomValues(new Uint8Array(60)));

function upsertTodo(title: string) {
	return {
		opId: ulid(),
		entity: "todo",
		entityId: ulid(),
		kind: "upsert",
		patch: { title },
		clientTs: Date.now(),
	};
}

async function push(cookie: string, ...ops: unknown[]): Promise<PushResult> {
	const res = await api("/sync/push", {
		method: "POST",
		cookie,
		body: { ops },
	});
	expect(res.status).toBe(200);
	return res.json();
}

describe("password keys", () => {
	it("upgrade an account that still has a hash of the password itself", async () => {
		const { email } = await signup();
		// As if the account was last used before 2.0.0.
		await env.DB.prepare("UPDATE users SET password_hash = ? WHERE email = ?")
			.bind(await hashPassword("old password 1"), email)
			.run();
		const keys = await keysFor(email, "old password 1");

		const without = await api("/auth/login", {
			method: "POST",
			body: { email, password: keys.authKey },
		});
		expect(without.status).toBe(401);

		const upgraded = await api("/auth/login", {
			method: "POST",
			body: { email, password: keys.authKey, legacyPassword: "old password 1" },
		});
		expect(upgraded.status).toBe(200);

		// From now on the key alone works, and the password itself no longer does.
		const after = await api("/auth/login", {
			method: "POST",
			body: { email, password: keys.authKey },
		});
		expect(after.status).toBe(200);
		const old = await api("/auth/login", {
			method: "POST",
			body: { email, password: "old password 1" },
		});
		expect(old.status).toBe(401);
	});

	it("answer an unknown email the same way", async () => {
		const res = await api("/auth/login", {
			method: "POST",
			body: {
				email: uniqueEmail(),
				password: "x".repeat(44),
				legacyPassword: "anything",
			},
		});
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "invalid_credentials" });
	});

	it("tell the reset page whose account a link is for", async () => {
		const { email } = await signup();
		await api("/auth/forgot", { method: "POST", body: { email } });
		const bad = await api("/auth/reset/link", {
			method: "POST",
			body: { token: "x".repeat(40) },
		});
		expect(bad.status).toBe(400);
	});
});

describe("encryption keys", () => {
	async function encryptedAccount() {
		const account = await signup();
		const res = await api("/keys", {
			method: "PUT",
			cookie: account.cookie,
			body: {
				password: PASSWORD,
				version: 1,
				wrappedByPassword: wrapped(),
				wrappedByRecovery: wrapped(),
			},
		});
		expect(res.status).toBe(200);
		expect(((await res.json()) as Me).encrypted).toBe(true);
		return account;
	}

	it("need the password to turn encryption on", async () => {
		const { cookie } = await signup();
		const res = await api("/keys", {
			method: "PUT",
			cookie,
			body: {
				password: "wrong password",
				version: 1,
				wrappedByPassword: wrapped(),
				wrappedByRecovery: wrapped(),
			},
		});
		expect(res.status).toBe(403);
		expect((await api("/keys", { cookie })).status).toBe(404);
	});

	it("are stored sealed and returned to the account's devices", async () => {
		const { cookie } = await encryptedAccount();
		const res = await api("/keys", { cookie });
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ version: 1 });
		const me = (await (await api("/me", { cookie })).json()) as Me;
		expect(me.encrypted).toBe(true);
	});

	it("make the server refuse plain text and keep encrypted text", async () => {
		const { cookie } = await encryptedAccount();
		const plain = await push(cookie, upsertTodo("Buy milk"));
		expect(plain.errors[0]?.code).toBe("encryption_required");

		const key = await generateDataKey();
		const sealed = await encryptText(key, "Buy milk", "todo.title");
		const ok = await push(cookie, upsertTodo(sealed));
		expect(ok.errors).toEqual([]);
		expect(ok.rows[0]?.row).toMatchObject({ title: sealed });
		expect(JSON.stringify(ok)).not.toContain("Buy milk");
	});

	it("must move with the password when it changes", async () => {
		const { cookie } = await encryptedAccount();
		const missing = await api("/auth/password", {
			method: "POST",
			cookie,
			body: { currentPassword: PASSWORD, newPassword: "new password 1" },
		});
		expect(missing.status).toBe(400);
		const moved = await api("/auth/password", {
			method: "POST",
			cookie,
			body: {
				currentPassword: PASSWORD,
				newPassword: "new password 1",
				wrappedByPassword: wrapped(),
			},
		});
		expect(moved.status).toBe(200);
	});

	it("can be re-sealed after a reset, and encryption turned off", async () => {
		const { cookie } = await encryptedAccount();
		const rewrap = await api("/keys/rewrap", {
			method: "POST",
			cookie,
			body: { password: PASSWORD, wrappedByPassword: wrapped() },
		});
		expect(rewrap.status).toBe(200);

		const off = await api("/keys/disable", {
			method: "POST",
			cookie,
			body: { password: PASSWORD },
		});
		expect(off.status).toBe(200);
		expect(((await off.json()) as Me).encrypted).toBe(false);
		const plain = await push(cookie, upsertTodo("Plain again"));
		expect(plain.errors).toEqual([]);
	});

	it("sign in with the derived key on a new account", async () => {
		const email = uniqueEmail();
		const keys = await keysFor(email);
		const { cookie } = await signup(email, keys.authKey);
		expect(cookie).toBeTruthy();
		const login = await api("/auth/login", {
			method: "POST",
			body: { email, password: keys.authKey },
		});
		expect(login.status).toBe(200);
		expect(sessionCookie(login)).toBeTruthy();
	});
});
