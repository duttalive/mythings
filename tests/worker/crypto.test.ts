import { describe, expect, it } from "vitest";
import {
	hashPassword,
	PBKDF2_ITERATIONS,
	randomToken,
	verifyPassword,
} from "../../worker/crypto";

describe("password hashing", () => {
	it("round-trips and rejects wrong passwords", async () => {
		const hash = await hashPassword("hunter2hunter2");
		expect(hash).toMatch(
			new RegExp(`^pbkdf2_sha256\\$${PBKDF2_ITERATIONS}\\$[^$]+\\$[^$]+$`),
		);
		expect(await verifyPassword("hunter2hunter2", hash)).toEqual({
			ok: true,
			needsRehash: false,
		});
		expect((await verifyPassword("hunter3hunter3", hash)).ok).toBe(false);
	});

	it("salts each hash", async () => {
		expect(await hashPassword("same password")).not.toBe(
			await hashPassword("same password"),
		);
	});

	it("flags hashes below the current iteration count for rehash", async () => {
		const [scheme, , salt] = (await hashPassword("pw")).split("$");
		const key = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode("weakhash"),
			"PBKDF2",
			false,
			["deriveBits"],
		);
		const bits = await crypto.subtle.deriveBits(
			{
				name: "PBKDF2",
				hash: "SHA-256",
				salt: Uint8Array.from(atob(salt ?? ""), (ch) => ch.charCodeAt(0)),
				iterations: 1000,
			},
			key,
			256,
		);
		const old = `${scheme}$1000$${salt}$${btoa(String.fromCharCode(...new Uint8Array(bits)))}`;
		expect(await verifyPassword("weakhash", old)).toEqual({
			ok: true,
			needsRehash: true,
		});
	});

	it("rejects malformed and password-less hashes", async () => {
		expect((await verifyPassword("x", "!")).ok).toBe(false);
		expect((await verifyPassword("x", "md5$abc")).ok).toBe(false);
	});

	it("generates unique url-safe tokens", () => {
		const a = randomToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(randomToken()).not.toBe(a);
	});
});
