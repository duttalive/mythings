import { describe, expect, it } from "vitest";
import {
	APP_VERSION,
	compareVersions,
	parseChangelog,
	releases,
} from "../../src/changelog";

describe("changelog", () => {
	it("parses versions newest first, with paragraphs and lists", () => {
		const parsed = parseChangelog(`# Changelog

Intro text.

## Version 1.0.0 — 2026-10-25

First.

- a
- b

## Version 1.10.0 — 2026-11-01

- c
`);
		expect(parsed.map((r) => r.version)).toEqual(["1.10.0", "1.0.0"]);
		expect(parsed[1]).toEqual({
			version: "1.0.0",
			date: "2026-10-25",
			blocks: [
				{ kind: "text", text: "First." },
				{ kind: "list", items: ["a", "b"] },
			],
		});
	});

	it("takes the app version from CHANGELOG.md's newest entry", () => {
		expect(APP_VERSION).toBe(releases[0]?.version);
		expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});
});

describe("compareVersions", () => {
	it("compares each part as a number", () => {
		expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
		expect(compareVersions("1.0.1", "1.0.0")).toBeGreaterThan(0);
		expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
		expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
	});

	it("treats the old whole-number versions as X.0.0", () => {
		expect(compareVersions("1", "1.0.1")).toBeLessThan(0);
		expect(compareVersions("1", "1.0.0")).toBe(0);
	});
});
