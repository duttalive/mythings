import { ulid } from "ulid";
import { describe, expect, it } from "vitest";
import type { Todo } from "../../shared/schema";
import { locationFromPath, newTodoFields } from "../../src/editing/defaults";
import { whenPatch } from "../../src/editing/schedule";
import { keyAfter, keyBefore, keyBetween, maxKey } from "../../src/lib/order";
import { parseDate, parseWhen } from "../../src/lib/parseDate";

const TODAY = "2026-10-25"; // a Sunday

describe("parseDate", () => {
	it.each([
		["today", "2026-10-25"],
		["tomorrow", "2026-10-26"],
		["tmrw", "2026-10-26"],
		["in 3 days", "2026-10-28"],
		["in 2 weeks", "2026-11-08"],
		["friday", "2026-10-30"],
		["dec 3", "2026-12-03"],
		["3 december 2027", "2027-12-03"],
		["2026-11-15", "2026-11-15"],
	])("%s → %s", (text, expected) => {
		expect(parseDate(text, TODAY)).toBe(expected);
	});

	it("rolls month-day phrases in the past to next year", () => {
		expect(parseDate("oct 1", TODAY)).toBe("2027-10-01");
	});

	it("returns null for nonsense", () => {
		expect(parseDate("", TODAY)).toBeNull();
		expect(parseDate("banana", TODAY)).toBeNull();
	});
});

describe("parseWhen", () => {
	it("understands keywords", () => {
		expect(parseWhen("Today", TODAY)).toEqual({ kind: "today" });
		expect(parseWhen("tonight", TODAY)).toEqual({ kind: "evening" });
		expect(parseWhen("this evening", TODAY)).toEqual({ kind: "evening" });
		expect(parseWhen("someday", TODAY)).toEqual({ kind: "someday" });
		expect(parseWhen("anytime", TODAY)).toEqual({ kind: "anytime" });
	});

	it("turns phrases into dates, and today's date into Today", () => {
		expect(parseWhen("next week", TODAY)).toMatchObject({ kind: "date" });
		expect(parseWhen("2026-10-25", TODAY)).toEqual({ kind: "today" });
		expect(parseWhen("tmrw", TODAY)).toEqual({
			kind: "date",
			date: "2026-10-26",
		});
		expect(parseWhen("blorp", TODAY)).toBeNull();
	});
});

describe("sort keys", () => {
	it("orders new keys around existing ones", () => {
		const a = keyAfter(null);
		const b = keyAfter(a);
		const mid = keyBetween(a, b);
		const first = keyBefore(a);
		expect([first, a, mid, b]).toEqual([first, a, mid, b].sort());
		expect(new Set([first, a, mid, b]).size).toBe(4);
	});

	it("still sorts correctly after keys that aren't fractional-index keys", () => {
		expect(keyAfter("b") > "b").toBe(true);
		expect(keyBetween("b", "c") > "b").toBe(true);
	});

	it("finds the max key", () => {
		expect(maxKey(["a1", null, "a3", "a2"])).toBe("a3");
		expect(maxKey([])).toBeNull();
	});
});

function todo(overrides: Partial<Todo>): Todo {
	return {
		id: ulid(),
		createdAt: 0,
		updatedAt: 0,
		deletedAt: null,
		rev: 0,
		title: "",
		notes: "",
		status: "open",
		completedAt: null,
		projectId: null,
		headingId: null,
		areaId: null,
		when: "anytime",
		startDate: null,
		evening: false,
		deadline: null,
		reminderAt: null,
		sortKey: "a0",
		todaySortKey: null,
		tagIds: [],
		repeat: null,
		repeatTemplateId: null,
		...overrides,
	};
}

describe("new to-do placement", () => {
	it("reads the list from the path", () => {
		expect(locationFromPath("/today")).toEqual({ list: "today" });
		expect(locationFromPath("/project/P1")).toEqual({
			list: "project",
			projectId: "P1",
		});
		expect(locationFromPath("/somewhere")).toEqual({ list: "other" });
	});

	it("schedules by list", () => {
		expect(newTodoFields({ list: "inbox" }, TODAY, [])).toMatchObject({
			when: "inbox",
		});
		expect(newTodoFields({ list: "today" }, TODAY, [])).toMatchObject({
			when: "scheduled",
			startDate: TODAY,
		});
		expect(newTodoFields({ list: "upcoming" }, TODAY, [])).toMatchObject({
			startDate: "2026-10-26",
		});
		expect(newTodoFields({ list: "someday" }, TODAY, [])).toMatchObject({
			when: "someday",
		});
		expect(
			newTodoFields({ list: "area", areaId: "A" }, TODAY, []),
		).toMatchObject({ areaId: "A", when: "anytime" });
		expect(
			newTodoFields({ list: "tag", tagId: "T" }, TODAY, [], ["U"]),
		).toMatchObject({ tagIds: ["T", "U"] });
	});

	it("goes to the end of its container", () => {
		const fields = newTodoFields({ list: "project", projectId: "P" }, TODAY, [
			todo({ projectId: "P", sortKey: "a5" }),
			todo({ projectId: "P", sortKey: "a9" }),
			todo({ projectId: "Q", sortKey: "z0" }),
			todo({ projectId: "P", headingId: "H", sortKey: "y0" }),
		]);
		expect(
			fields.sortKey && fields.sortKey > "a9" && fields.sortKey < "y0",
		).toBe(true);
	});

	it("goes to the end of Today", () => {
		const fields = newTodoFields({ list: "today" }, TODAY, [
			todo({ todaySortKey: "a4" }),
		]);
		expect((fields.todaySortKey ?? "") > "a4").toBe(true);
	});
});

describe("whenPatch", () => {
	it("maps picker choices to scheduling fields", () => {
		expect(whenPatch({ kind: "today" }, TODAY)).toEqual({
			when: "scheduled",
			startDate: TODAY,
			evening: false,
		});
		expect(whenPatch({ kind: "evening" }, TODAY)).toEqual({
			when: "scheduled",
			startDate: TODAY,
			evening: true,
		});
		expect(whenPatch({ kind: "date", date: "2026-11-02" }, TODAY)).toEqual({
			when: "scheduled",
			startDate: "2026-11-02",
			evening: false,
		});
		expect(whenPatch({ kind: "someday" }, TODAY)).toEqual({
			when: "someday",
			startDate: null,
			evening: false,
		});
		expect(whenPatch({ kind: "clear" }, TODAY)).toEqual({
			when: "anytime",
			startDate: null,
			evening: false,
		});
	});
});
