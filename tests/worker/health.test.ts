import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api } from "./helpers";

describe("api", () => {
	it("GET /api/health reports ok with a working D1 binding", async () => {
		const res = await api("/health");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, db: true });
	});

	it("applies the initial D1 migration", async () => {
		const { results } = await env.DB.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('users', 'sessions', 'push_subscriptions') ORDER BY name",
		).all<{ name: string }>();
		expect(results.map((r) => r.name)).toEqual([
			"push_subscriptions",
			"sessions",
			"users",
		]);
	});

	it("sends security headers and no-store on API responses", async () => {
		for (const res of [await api("/health"), await api("/nope")]) {
			expect(res.headers.get("x-frame-options")).toBe("DENY");
			expect(res.headers.get("x-content-type-options")).toBe("nosniff");
			expect(res.headers.get("referrer-policy")).toBe("no-referrer");
			expect(res.headers.get("content-security-policy")).toContain(
				"frame-ancestors 'none'",
			);
			expect(res.headers.get("cache-control")).toBe("no-store");
		}
		// Rejected requests get them too.
		const blocked = await api("/auth/logout", {
			method: "POST",
			headers: { origin: "https://evil.example" },
		});
		expect(blocked.status).toBe(403);
		expect(blocked.headers.get("x-frame-options")).toBe("DENY");
	});

	it("returns JSON 404 for unknown API routes", async () => {
		const res = await api("/nope");
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "not_found" });
	});
});
