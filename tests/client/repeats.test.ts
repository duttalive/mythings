import { describe, expect, it } from "vitest";
import type { RepeatRule } from "../../shared/schema";
import {
	describeRule,
	formFromRule,
	ordinal,
	ruleFromForm,
} from "../../src/editing/repeatForm";
import {
	formatTime,
	moveReminder,
	reminderAt,
	reminderTime,
} from "../../src/lib/reminders";

const TODAY = "2026-10-25"; // a Sunday

describe("repeat form", () => {
	it("defaults from the start date", () => {
		const form = formFromRule(null, "2026-10-30"); // Friday, 5th Friday → "last"
		expect(form).toMatchObject({
			mode: "fixed",
			freq: "weekly",
			interval: 1,
			weekdays: [5],
			monthDay: 30,
			nth: -1,
			nthWeekday: 5,
			yearMonth: 10,
			yearDay: 30,
			start: "2026-10-30",
		});
	});

	it("builds a weekly rule whose first date is on or after the start", () => {
		const form = {
			...formFromRule(null, TODAY),
			weekdays: [1, 4],
			interval: 2,
		};
		const result = ruleFromForm(form, 1);
		expect(result).toEqual({
			rule: {
				mode: "fixed",
				freq: "weekly",
				interval: 2,
				byWeekday: [1, 4],
				nextDate: "2026-10-26",
			},
		});
	});

	it("builds monthly-by-nth and yearly rules", () => {
		const monthly = ruleFromForm(
			{
				...formFromRule(null, TODAY),
				freq: "monthly",
				monthlyBy: "nth",
				nth: -1,
				nthWeekday: 5,
			},
			1,
		);
		expect(monthly).toMatchObject({
			rule: { byNth: { n: -1, weekday: 5 }, nextDate: "2026-10-30" },
		});
		const yearly = ruleFromForm(
			{
				...formFromRule(null, TODAY),
				freq: "yearly",
				yearMonth: 2,
				yearDay: 29,
			},
			1,
		);
		expect(yearly).toMatchObject({
			rule: { byMonth: 2, byMonthDay: 29, nextDate: "2027-02-28" },
		});
	});

	it("drops by-fields for after-completion rules and keeps extras", () => {
		const result = ruleFromForm(
			{
				...formFromRule(null, TODAY),
				mode: "afterCompletion",
				freq: "daily",
				interval: 3,
				deadlineOffset: 1,
				reminderTime: "09:30",
				endsOn: "2027-01-01",
			},
			1,
		);
		expect(result).toEqual({
			rule: {
				mode: "afterCompletion",
				freq: "daily",
				interval: 3,
				nextDate: TODAY,
				deadlineOffsetDays: 1,
				reminderTime: "09:30",
				endsOn: "2027-01-01",
			},
		});
	});

	it("explains invalid forms", () => {
		expect(
			ruleFromForm(
				{ ...formFromRule(null, TODAY), freq: "daily", endsOn: "2026-10-01" },
				1,
			),
		).toEqual({
			error: "The repeat ends before it starts.",
		});
		expect(
			"error" in
				ruleFromForm(
					{
						...formFromRule(null, TODAY),
						freq: "yearly",
						yearMonth: 2,
						yearDay: 30,
					},
					1,
				),
		).toBe(true);
	});

	it("round-trips an existing rule", () => {
		const rule = {
			mode: "fixed",
			freq: "monthly",
			interval: 3,
			byMonthDay: 15,
			nextDate: "2026-11-15",
		} as const;
		expect(ruleFromForm(formFromRule(rule, TODAY), 1)).toEqual({ rule });
	});
});

describe("describeRule", () => {
	it.each([
		[
			{ mode: "fixed", freq: "daily", interval: 1, nextDate: TODAY },
			"Every day",
		],
		[
			{ mode: "fixed", freq: "daily", interval: 3, nextDate: TODAY },
			"Every 3 days",
		],
		[
			{
				mode: "fixed",
				freq: "weekly",
				interval: 2,
				byWeekday: [1, 4],
				nextDate: TODAY,
			},
			"Every 2 weeks on Mon, Thu",
		],
		[
			{
				mode: "fixed",
				freq: "monthly",
				interval: 1,
				byNth: { n: 2, weekday: 2 },
				nextDate: TODAY,
			},
			"Every month on the 2nd Tuesday",
		],
		[
			{
				mode: "fixed",
				freq: "monthly",
				interval: 1,
				byMonthDay: -1,
				nextDate: TODAY,
			},
			"Every month on the last day",
		],
		[
			{
				mode: "fixed",
				freq: "yearly",
				interval: 1,
				byMonth: 2,
				byMonthDay: 29,
				nextDate: TODAY,
			},
			"Every year on Feb 29",
		],
		[
			{ mode: "afterCompletion", freq: "weekly", interval: 1, nextDate: TODAY },
			"1 week after completion",
		],
		[
			{
				mode: "fixed",
				freq: "daily",
				interval: 1,
				nextDate: TODAY,
				endsOn: "2026-12-01",
			},
			"Every day until 2026-12-01",
		],
	] as [RepeatRule, string][])("%o → %s", (rule, text) => {
		expect(describeRule(rule)).toBe(text);
	});

	it("writes ordinals", () => {
		expect([1, 2, 3, 4, 11, 12, 13, 21, 22, -1].map(ordinal)).toEqual([
			"1st",
			"2nd",
			"3rd",
			"4th",
			"11th",
			"12th",
			"13th",
			"21st",
			"22nd",
			"last",
		]);
	});
});

describe("reminders", () => {
	it("round-trips local times across time zones", () => {
		const at = reminderAt("2026-03-09", "09:00", "America/New_York");
		expect(at).toBe(Date.UTC(2026, 2, 9, 13));
		expect(reminderTime(at, "America/New_York")).toBe("09:00");
	});

	it("moves with the to-do's date, keeping the time of day, even across DST", () => {
		const before = reminderAt("2026-03-02", "09:00", "America/New_York");
		expect(moveReminder(before, "2026-03-09", "America/New_York")).toBe(
			Date.UTC(2026, 2, 9, 13),
		);
		expect(moveReminder(before, null, "America/New_York")).toBeNull();
		expect(moveReminder(null, "2026-03-09", "America/New_York")).toBeNull();
	});

	it("formats times", () => {
		expect(formatTime("09:05", "en-GB")).toBe("9:05");
		expect(formatTime("21:30", "en-US")).toBe("9:30 PM");
	});
});
