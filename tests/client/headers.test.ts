import { describe, expect, it } from "vitest";
import indexHtml from "../../index.html?raw";
import headers from "../../public/_headers?raw";

const sha256Base64 = async (text: string) =>
	btoa(
		String.fromCharCode(
			...new Uint8Array(
				await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
			),
		),
	);

describe("public/_headers", () => {
	const csp = headers.match(/Content-Security-Policy: (.*)/)?.[1] ?? "";

	it("allows exactly the inline script in index.html", async () => {
		const scripts = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)];
		expect(scripts).toHaveLength(1);
		const hash = await sha256Base64(scripts[0]?.[1] ?? "");
		expect(csp).toContain(`'sha256-${hash}'`);
		expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
	});

	it("can't be framed and sends no referrer", () => {
		expect(csp).toContain("frame-ancestors 'none'");
		expect(headers).toContain("X-Frame-Options: DENY");
		expect(headers).toContain("Referrer-Policy: no-referrer");
	});
});
