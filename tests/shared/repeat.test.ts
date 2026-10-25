import { describe, expect, it } from "vitest";
import {
	firstOnOrAfter,
	instanceSchedule,
	materialize,
	nextAfter,
	previewOccurrences,
} from "../../shared/repeat";
import { type RepeatRule, repeatRuleSchema } from "../../shared/schema";
import { rule as baseRule } from "./fixtures";

/** Builds a rule and checks it against the schema, so tests only use valid rules. */
function rule(overrides: Partial<RepeatRule>): RepeatRule {
	return repeatRuleSchema.parse(baseRule(overrides));
}

function chain(
	r: RepeatRule,
	from: string,
	count: number,
	weekStart = 1,
): (string | null)[] {
	const dates: (string | null)[] = [];
	let date: string | null = from;
	for (let i = 0; i < count && date; i++) {
		date = nextAfter(r, date, weekStart);
		dates.push(date);
	}
	return dates;
}

describe("nextAfter (fixed)", () => {
	it("daily, every N days", () => {
		expect(nextAfter(rule({ freq: "daily" }), "2026-10-25")).toBe("2026-10-26");
		expect(nextAfter(rule({ freq: "daily", interval: 3 }), "2026-10-25")).toBe(
			"2026-10-28",
		);
	});

	it("weekly without weekdays repeats on the same weekday", () => {
		expect(nextAfter(rule({ freq: "weekly", interval: 2 }), "2026-10-25")).toBe(
			"2026-11-08",
		);
	});

	it("weekly on several weekdays", () => {
		const mwf = rule({ freq: "weekly", byWeekday: [1, 3, 5] });
		expect(chain(mwf, "2026-10-26", 4)).toEqual([
			"2026-10-28",
			"2026-10-30",
			"2026-11-02",
			"2026-11-04",
		]);
	});

	it("every 2 weeks on Mon and Thu skips the off week", () => {
		const r = rule({ freq: "weekly", interval: 2, byWeekday: [4, 1] });
		expect(chain(r, "2026-10-26", 3)).toEqual([
			"2026-10-29",
			"2026-11-09",
			"2026-11-12",
		]);
	});

	it("respects the week start when deciding what 'this week' is", () => {
		const weekend = rule({ freq: "weekly", interval: 2, byWeekday: [6, 0] });
		// Weeks start Monday: Sat 31 Oct and Sun 1 Nov are the same week.
		expect(nextAfter(weekend, "2026-10-31", 1)).toBe("2026-11-01");
		// Weeks start Sunday: Sat 31 Oct ends the week, so skip to the week of 8 Nov.
		expect(nextAfter(weekend, "2026-10-31", 0)).toBe("2026-11-08");
	});

	it("monthly on the 31st clamps short months without drifting", () => {
		const r = rule({ freq: "monthly", byMonthDay: 31 });
		expect(chain(r, "2026-01-31", 4)).toEqual([
			"2026-02-28",
			"2026-03-31",
			"2026-04-30",
			"2026-05-31",
		]);
		expect(nextAfter(r, "2028-01-31")).toBe("2028-02-29");
	});

	it("monthly on the last day", () => {
		expect(
			chain(rule({ freq: "monthly", byMonthDay: -1 }), "2026-01-31", 2),
		).toEqual(["2026-02-28", "2026-03-31"]);
	});

	it("every 3 months on the 15th", () => {
		expect(
			nextAfter(
				rule({ freq: "monthly", interval: 3, byMonthDay: 15 }),
				"2026-11-15",
			),
		).toBe("2027-02-15");
	});

	it("monthly on the 2nd Tuesday", () => {
		const r = rule({ freq: "monthly", byNth: { n: 2, weekday: 2 } });
		expect(chain(r, "2026-10-13", 2)).toEqual(["2026-11-10", "2026-12-08"]);
	});

	it("monthly on the last Friday", () => {
		const r = rule({ freq: "monthly", byNth: { n: -1, weekday: 5 } });
		expect(chain(r, "2026-10-30", 2)).toEqual(["2026-11-27", "2026-12-25"]);
	});

	it("yearly on Feb 29 falls back to Feb 28 and returns in leap years", () => {
		const r = rule({ freq: "yearly", byMonth: 2, byMonthDay: 29 });
		expect(chain(r, "2024-02-29", 4)).toEqual([
			"2025-02-28",
			"2026-02-28",
			"2027-02-28",
			"2028-02-29",
		]);
	});

	it("every 2 years", () => {
		expect(
			nextAfter(
				rule({ freq: "yearly", interval: 2, byMonth: 10, byMonthDay: 25 }),
				"2026-10-25",
			),
		).toBe("2028-10-25");
	});

	it("stops at endsOn", () => {
		const r = rule({ freq: "daily", endsOn: "2026-10-27" });
		expect(nextAfter(r, "2026-10-26")).toBe("2026-10-27");
		expect(nextAfter(r, "2026-10-27")).toBeNull();
	});
});

describe("nextAfter (afterCompletion)", () => {
	it("adds the interval to the completion date", () => {
		const nextFor = (
			freq: RepeatRule["freq"],
			interval: number,
			completed: string,
		) =>
			nextAfter(rule({ mode: "afterCompletion", freq, interval }), completed);
		expect(nextFor("daily", 3, "2026-10-25")).toBe("2026-10-28");
		expect(nextFor("weekly", 2, "2026-10-25")).toBe("2026-11-08");
		expect(nextFor("monthly", 1, "2026-01-31")).toBe("2026-02-28");
		expect(nextFor("yearly", 1, "2024-02-29")).toBe("2025-02-28");
	});
});

describe("firstOnOrAfter", () => {
	it("daily and afterCompletion start on the given date", () => {
		expect(firstOnOrAfter(rule({}), "2026-10-25")).toBe("2026-10-25");
		expect(
			firstOnOrAfter(rule({ mode: "afterCompletion" }), "2026-10-25"),
		).toBe("2026-10-25");
	});

	it("weekly picks the next matching weekday", () => {
		const r = rule({ freq: "weekly", byWeekday: [1, 3] });
		expect(firstOnOrAfter(r, "2026-10-25")).toBe("2026-10-26");
		expect(firstOnOrAfter(r, "2026-10-28")).toBe("2026-10-28");
		expect(firstOnOrAfter(r, "2026-10-29")).toBe("2026-11-02");
	});

	it("monthly uses this month's date if it hasn't passed", () => {
		const r = rule({ freq: "monthly", byMonthDay: 15 });
		expect(firstOnOrAfter(r, "2026-10-15")).toBe("2026-10-15");
		expect(firstOnOrAfter(r, "2026-10-20")).toBe("2026-11-15");
		expect(
			firstOnOrAfter(
				rule({ freq: "monthly", byNth: { n: -1, weekday: 5 } }),
				"2026-10-31",
			),
		).toBe("2026-11-27");
	});

	it("yearly rolls to next year once the date has passed", () => {
		expect(
			firstOnOrAfter(
				rule({ freq: "yearly", byMonth: 3, byMonthDay: 1 }),
				"2026-10-25",
			),
		).toBe("2027-03-01");
		expect(
			firstOnOrAfter(
				rule({ freq: "yearly", byMonth: 12, byMonthDay: 25 }),
				"2026-10-25",
			),
		).toBe("2026-12-25");
	});
});

describe("materialize", () => {
	it("creates today's instance and advances nextDate", () => {
		expect(materialize(rule({ nextDate: "2026-10-25" }), "2026-10-25")).toEqual(
			{
				instanceDate: "2026-10-25",
				nextDate: "2026-10-26",
			},
		);
	});

	it("creates only the most recent missed instance", () => {
		expect(materialize(rule({ nextDate: "2026-10-20" }), "2026-10-25")).toEqual(
			{
				instanceDate: "2026-10-25",
				nextDate: "2026-10-26",
			},
		);
		const mondays = rule({
			freq: "weekly",
			byWeekday: [1],
			nextDate: "2026-10-05",
		});
		expect(materialize(mondays, "2026-10-25")).toEqual({
			instanceDate: "2026-10-19",
			nextDate: "2026-10-26",
		});
	});

	it("handles a daily rule missed for years", () => {
		expect(materialize(rule({ nextDate: "2020-01-01" }), "2026-10-25")).toEqual(
			{
				instanceDate: "2026-10-25",
				nextDate: "2026-10-26",
			},
		);
	});

	it("ends the series at endsOn", () => {
		expect(
			materialize(
				rule({ nextDate: "2026-10-20", endsOn: "2026-10-22" }),
				"2026-10-25",
			),
		).toEqual({
			instanceDate: "2026-10-22",
			nextDate: null,
		});
	});

	it("does nothing when not due or not fixed", () => {
		expect(
			materialize(rule({ nextDate: "2026-10-26" }), "2026-10-25"),
		).toBeNull();
		expect(
			materialize(
				rule({ mode: "afterCompletion", nextDate: "2026-10-20" }),
				"2026-10-25",
			),
		).toBeNull();
	});
});

describe("instanceSchedule", () => {
	it("derives the deadline from the offset", () => {
		expect(
			instanceSchedule(rule({ deadlineOffsetDays: 2 }), "2026-10-25", "UTC"),
		).toEqual({
			startDate: "2026-10-25",
			deadline: "2026-10-27",
			reminderAt: null,
		});
	});

	it("keeps reminders at the same local time across New York DST", () => {
		const r = rule({ freq: "weekly", byWeekday: [1], reminderTime: "09:00" });
		expect(
			instanceSchedule(r, "2026-03-02", "America/New_York").reminderAt,
		).toBe(Date.UTC(2026, 2, 2, 14));
		expect(
			instanceSchedule(r, "2026-03-09", "America/New_York").reminderAt,
		).toBe(Date.UTC(2026, 2, 9, 13));
	});

	it("keeps reminders at the same local time across Sydney DST", () => {
		const r = rule({ freq: "weekly", byWeekday: [1], reminderTime: "09:00" });
		expect(
			instanceSchedule(r, "2026-09-28", "Australia/Sydney").reminderAt,
		).toBe(Date.UTC(2026, 8, 27, 23));
		expect(
			instanceSchedule(r, "2026-10-05", "Australia/Sydney").reminderAt,
		).toBe(Date.UTC(2026, 9, 4, 22));
	});
});

describe("previewOccurrences", () => {
	it("lists upcoming dates from nextDate", () => {
		const r = rule({
			freq: "monthly",
			byNth: { n: -1, weekday: 5 },
			nextDate: "2026-10-30",
		});
		expect(previewOccurrences(r, 3)).toEqual([
			"2026-10-30",
			"2026-11-27",
			"2026-12-25",
		]);
	});

	it("stops at endsOn", () => {
		expect(previewOccurrences(rule({ endsOn: "2026-10-26" }), 5)).toEqual([
			"2026-10-25",
			"2026-10-26",
		]);
	});
});

describe("rule validation", () => {
	const invalid: [string, Partial<RepeatRule>][] = [
		[
			"monthly with both byMonthDay and byNth",
			{ freq: "monthly", byMonthDay: 1, byNth: { n: 1, weekday: 1 } },
		],
		["monthly with neither", { freq: "monthly" }],
		["weekly with byMonthDay", { freq: "weekly", byMonthDay: 3 }],
		["daily with byWeekday", { freq: "daily", byWeekday: [1] }],
		[
			"afterCompletion with byWeekday",
			{ mode: "afterCompletion", freq: "weekly", byWeekday: [1] },
		],
		["yearly without byMonth", { freq: "yearly", byMonthDay: 1 }],
		["yearly on Feb 30", { freq: "yearly", byMonth: 2, byMonthDay: 30 }],
		["yearly on Apr 31", { freq: "yearly", byMonth: 4, byMonthDay: 31 }],
		["interval 0", { interval: 0 }],
		["byMonthDay 0", { freq: "monthly", byMonthDay: 0 }],
		["bad reminder time", { reminderTime: "25:00" }],
	];
	it.each(invalid)("rejects %s", (_, overrides) => {
		expect(repeatRuleSchema.safeParse(baseRule(overrides)).success).toBe(false);
	});

	it("accepts Feb 29 yearly", () => {
		expect(
			repeatRuleSchema.safeParse(
				baseRule({ freq: "yearly", byMonth: 2, byMonthDay: 29 }),
			).success,
		).toBe(true);
	});
});
