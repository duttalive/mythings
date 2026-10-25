import { describe, expect, it } from "vitest";
import {
	addDays,
	addMonths,
	addYears,
	diffDays,
	isValidLocalDate,
	lastDayOfMonth,
	localDateOf,
	nextLocalMidnight,
	startOfWeek,
	todayIn,
	tzOffsetMs,
	weekday,
	zonedTimeToEpoch,
} from "../../shared/dates";

const HOUR = 60 * 60 * 1000;

describe("calendar dates", () => {
	it("validates YYYY-MM-DD strings", () => {
		expect(isValidLocalDate("2024-02-29")).toBe(true);
		expect(isValidLocalDate("2025-02-29")).toBe(false);
		expect(isValidLocalDate("2026-13-01")).toBe(false);
		expect(isValidLocalDate("2026-04-31")).toBe(false);
		expect(isValidLocalDate("2026-1-01")).toBe(false);
		expect(isValidLocalDate("2026-10-25T00:00")).toBe(false);
	});

	it("adds and diffs days across months, years and leap days", () => {
		expect(addDays("2026-10-25", 7)).toBe("2026-11-01");
		expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
		expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
		expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
		expect(diffDays("2026-10-25", "2026-11-01")).toBe(7);
		expect(diffDays("2026-11-01", "2026-10-25")).toBe(-7);
		expect(diffDays("2026-01-01", "2027-01-01")).toBe(365);
	});

	it("is unaffected by DST transitions", () => {
		expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
		expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
		expect(diffDays("2026-03-01", "2026-03-15")).toBe(14);
	});

	it("knows weekdays", () => {
		expect(weekday("2026-10-25")).toBe(0);
		expect(weekday("2026-10-31")).toBe(6);
		expect(weekday("2024-02-29")).toBe(4);
	});

	it("adds months with clamping, without drifting when a day is given", () => {
		expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
		expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
		expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
		expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
		expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
		expect(addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
		expect(addMonths("2026-01-10", 1, -1)).toBe("2026-02-28");
		expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
	});

	it("finds the start of the week and the end of the month", () => {
		expect(startOfWeek("2026-10-25", 1)).toBe("2026-10-19");
		expect(startOfWeek("2026-10-25", 0)).toBe("2026-10-25");
		expect(startOfWeek("2026-10-25", 6)).toBe("2026-10-24");
		expect(lastDayOfMonth("2024-02-10")).toBe("2024-02-29");
	});
});

describe("time zones", () => {
	it("gives the local date of an instant", () => {
		const instant = Date.UTC(2026, 9, 25, 20, 0);
		expect(localDateOf(instant, "UTC")).toBe("2026-10-25");
		expect(localDateOf(instant, "Asia/Kolkata")).toBe("2026-10-26");
		expect(localDateOf(instant, "America/Los_Angeles")).toBe("2026-10-25");
		expect(todayIn("Pacific/Kiritimati", instant)).toBe("2026-10-26");
	});

	it("reports UTC offsets, including half-hour zones", () => {
		expect(tzOffsetMs(Date.UTC(2026, 6, 1), "America/New_York")).toBe(
			-4 * HOUR,
		);
		expect(tzOffsetMs(Date.UTC(2026, 0, 1), "America/New_York")).toBe(
			-5 * HOUR,
		);
		expect(tzOffsetMs(Date.UTC(2026, 0, 1), "Asia/Kolkata")).toBe(5.5 * HOUR);
	});

	it("converts local wall time to an instant on both sides of New York DST", () => {
		expect(zonedTimeToEpoch("2026-01-15", "09:00", "America/New_York")).toBe(
			Date.UTC(2026, 0, 15, 14),
		);
		expect(zonedTimeToEpoch("2026-07-01", "09:00", "America/New_York")).toBe(
			Date.UTC(2026, 6, 1, 13),
		);
	});

	it("moves a time skipped by spring-forward past the gap", () => {
		// 02:30 doesn't exist on 2026-03-08 in New York; it becomes 03:30 EDT.
		expect(zonedTimeToEpoch("2026-03-08", "02:30", "America/New_York")).toBe(
			Date.UTC(2026, 2, 8, 7, 30),
		);
		// Sydney skips 02:00–03:00 on 2026-10-04; 02:30 becomes 03:30 AEDT.
		expect(zonedTimeToEpoch("2026-10-04", "02:30", "Australia/Sydney")).toBe(
			Date.UTC(2026, 9, 3, 16, 30),
		);
	});

	it("picks the earlier instant for a time repeated by fall-back", () => {
		// 01:30 happens twice on 2026-11-01 in New York; take the EDT one.
		expect(zonedTimeToEpoch("2026-11-01", "01:30", "America/New_York")).toBe(
			Date.UTC(2026, 10, 1, 5, 30),
		);
		// 02:30 happens twice on 2026-04-05 in Sydney; take the AEDT one.
		expect(zonedTimeToEpoch("2026-04-05", "02:30", "Australia/Sydney")).toBe(
			Date.UTC(2026, 3, 4, 15, 30),
		);
	});

	it("finds the next local midnight across DST changes", () => {
		// Noon on the day before spring-forward: midnight is still EST.
		expect(
			nextLocalMidnight("America/New_York", Date.UTC(2026, 2, 7, 17)),
		).toBe(Date.UTC(2026, 2, 8, 5));
		// Noon on the spring-forward day: the next midnight is EDT.
		expect(
			nextLocalMidnight("America/New_York", Date.UTC(2026, 2, 8, 16)),
		).toBe(Date.UTC(2026, 2, 9, 4));
		expect(nextLocalMidnight("Australia/Sydney", Date.UTC(2026, 9, 4, 1))).toBe(
			Date.UTC(2026, 9, 4, 13),
		);
		expect(nextLocalMidnight("Asia/Kolkata", Date.UTC(2026, 9, 25, 20))).toBe(
			Date.UTC(2026, 9, 26, 18, 30),
		);
	});

	it("rejects malformed times", () => {
		expect(() => zonedTimeToEpoch("2026-10-25", "24:00", "UTC")).toThrow();
		expect(() => zonedTimeToEpoch("2026-10-25", "9:00", "UTC")).toThrow();
	});
});
