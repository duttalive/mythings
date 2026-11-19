import { describe, expect, it } from "vitest";
import guide from "../../Core_User_Guide.md?raw";
import { APP_VERSION } from "../../src/changelog";

// `pnpm release` stamps the guide with each new version (scripts/release.mjs).
describe("Core_User_Guide.md", () => {
	it("describes the current release", () => {
		expect(guide).toContain(`<!-- guide-version: ${APP_VERSION} -->`);
		expect(guide).toContain(`_Up to date with mythings **${APP_VERSION}**.`);
	});
});
