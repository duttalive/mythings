import { ulid } from "ulid";
import { describe, expect, it } from "vitest";
import type { Area, Project, Tag } from "../../shared/schema";
import {
	comboFromEvent,
	formatCombo,
	printableChar,
} from "../../src/keyboard/keys";
import { fuzzyFilter, fuzzyScore } from "../../src/lib/fuzzy";
import { parseQuickEntry } from "../../src/lib/quickEntry";

const key = (
	code: string,
	mods: Partial<
		Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>
	> = {},
	k = "",
) => ({
	code,
	key: k || code.replace(/^Key|^Digit/, "").toLowerCase(),
	metaKey: false,
	ctrlKey: false,
	altKey: false,
	shiftKey: false,
	...mods,
});

describe("comboFromEvent", () => {
	it("maps ⌘ on Apple and Ctrl elsewhere to mod", () => {
		expect(comboFromEvent(key("KeyK", { metaKey: true }), true)).toBe("mod+k");
		expect(comboFromEvent(key("KeyK", { ctrlKey: true }), false)).toBe("mod+k");
		expect(comboFromEvent(key("KeyK", { ctrlKey: true }), true)).toBe("k");
	});

	it("uses the physical key so Alt combos survive macOS character mapping", () => {
		expect(comboFromEvent(key("KeyT", { altKey: true }, "†"), true)).toBe(
			"alt+t",
		);
		expect(
			comboFromEvent(key("KeyD", { metaKey: true, shiftKey: true }), true),
		).toBe("mod+shift+d");
		expect(
			comboFromEvent(key("ArrowUp", { metaKey: true }, "ArrowUp"), true),
		).toBe("mod+up");
		expect(comboFromEvent(key("Space", { altKey: true }, " "), true)).toBe(
			"alt+space",
		);
		expect(comboFromEvent(key("Digit3", { metaKey: true }), true)).toBe(
			"mod+3",
		);
	});

	it("treats ? as its own key", () => {
		expect(comboFromEvent(key("Slash", { shiftKey: true }, "?"), true)).toBe(
			"?",
		);
	});

	it("formats combos for each platform", () => {
		expect(formatCombo("mod+shift+d", true)).toBe("⌘⇧D");
		expect(formatCombo("mod+shift+d", false)).toBe("Ctrl+Shift+D");
		expect(formatCombo("alt+t", true)).toBe("⌥T");
	});

	it("finds printable characters", () => {
		expect(printableChar(key("KeyA", {}, "a"))).toBe("a");
		expect(printableChar(key("KeyA", { metaKey: true }, "a"))).toBeNull();
		expect(printableChar(key("Space", {}, " "))).toBeNull();
		expect(printableChar(key("Enter", {}, "Enter"))).toBeNull();
	});
});

describe("fuzzy", () => {
	it("ranks exact, prefix, word-prefix, substring, then in-order letters", () => {
		const titles = [
			"website relaunch",
			"web",
			"relaunch website",
			"cobweb",
			"w-e-b",
		];
		expect(fuzzyFilter("web", titles, (t) => t)).toEqual([
			"web",
			"website relaunch",
			"relaunch website",
			"cobweb",
			"w-e-b",
		]);
	});

	it("requires every query word", () => {
		expect(fuzzyScore("web launch", "website relaunch")).not.toBeNull();
		expect(fuzzyScore("web garden", "website relaunch")).toBeNull();
		expect(fuzzyScore("", "anything")).toBe(0);
	});
});

const base = () => ({
	id: ulid(),
	createdAt: 0,
	updatedAt: 0,
	deletedAt: null,
	rev: 0,
});
const tag = (title: string): Tag => ({
	...base(),
	title,
	parentId: null,
	shortcut: null,
	sortKey: "a0",
	collapsed: false,
});
const project = (title: string): Project => ({
	...base(),
	title,
	notes: "",
	areaId: null,
	status: "open",
	completedAt: null,
	when: "anytime",
	startDate: null,
	evening: false,
	deadline: null,
	sortKey: "a0",
	todaySortKey: null,
	tagIds: [],
	repeat: null,
	repeatTemplateId: null,
});
const area = (title: string): Area => ({
	...base(),
	title,
	sortKey: "a0",
	tagIds: [],
	collapsed: false,
});

describe("parseQuickEntry", () => {
	const errands = tag("Errands");
	const site = project("Website relaunch");
	const home = area("Home");
	const ctx = {
		today: "2026-10-25",
		tags: [errands],
		projects: [site],
		areas: [home],
	};

	it("leaves plain titles alone", () => {
		expect(parseQuickEntry("  Buy milk ", ctx)).toEqual({
			title: "Buy milk",
			tokens: [],
		});
	});

	it("parses tags, when, deadline and list", () => {
		const parsed = parseQuickEntry(
			"Buy milk #errands #urgent @tmrw !friday /web",
			ctx,
		);
		expect(parsed.title).toBe("Buy milk");
		expect(parsed.tokens).toEqual([
			{ kind: "tag", raw: "#errands", tagId: errands.id, title: "Errands" },
			{ kind: "tag", raw: "#urgent", tagId: null, title: "urgent" },
			{
				kind: "when",
				raw: "@tmrw",
				fields: { when: "scheduled", startDate: "2026-10-26", evening: false },
				label: "2026-10-26",
			},
			{ kind: "deadline", raw: "!friday", date: "2026-10-30" },
			{
				kind: "list",
				raw: "/web",
				projectId: site.id,
				areaId: null,
				title: "Website relaunch",
			},
		]);
	});

	it("takes multi-word phrases up to the next token", () => {
		const parsed = parseQuickEntry("Call mom @next friday #errands", ctx);
		expect(parsed.title).toBe("Call mom");
		expect(parsed.tokens.map((t) => t.kind)).toEqual(["when", "tag"]);
	});

	it("handles keywords and areas", () => {
		const parsed = parseQuickEntry("Water plants @tonight /home", ctx);
		expect(parsed.tokens).toMatchObject([
			{
				kind: "when",
				fields: { when: "scheduled", startDate: "2026-10-25", evening: true },
			},
			{ kind: "list", projectId: null, areaId: home.id },
		]);
	});

	it("keeps tokens that don't parse as title text, and ignores markers inside words", () => {
		const parsed = parseQuickEntry("Email a@b.com and/or @blorp /nowhere", ctx);
		expect(parsed.title).toBe("Email a@b.com and/or @blorp /nowhere");
		expect(parsed.tokens).toEqual([]);
	});

	it("returns words after a tag to the title", () => {
		expect(parseQuickEntry("#errands pick up parcel", ctx).title).toBe(
			"pick up parcel",
		);
	});
});
