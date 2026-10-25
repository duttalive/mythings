import { describe, expect, it } from "vitest";
import {
	dayLabel,
	deadlineLabel,
	monthLabel,
	rangeLabel,
	shortDate,
	weekdayName,
} from "../../src/lib/format";

const TODAY = "2026-10-25"; // a Sunday
const en = "en-US";

describe("date labels", () => {
	it("names nearby days and formats the rest", () => {
		expect(dayLabel(TODAY, TODAY, en)).toBe("Today");
		expect(dayLabel("2026-10-26", TODAY, en)).toBe("Tomorrow");
		expect(dayLabel("2026-10-24", TODAY, en)).toBe("Yesterday");
		expect(dayLabel("2026-10-30", TODAY, en)).toBe("Fri, Oct 30");
		expect(dayLabel("2027-01-04", TODAY, en)).toBe("Mon, Jan 4, 2027");
	});

	it("shows the year only outside the current year", () => {
		expect(shortDate("2026-12-03", TODAY, en)).toBe("Dec 3");
		expect(shortDate("2027-12-03", TODAY, en)).toBe("Dec 3, 2027");
		expect(monthLabel("2026-12", TODAY, en)).toBe("December");
		expect(monthLabel("2027-01", TODAY, en)).toBe("January 2027");
	});

	it("formats weekdays and ranges without shifting the day", () => {
		expect(weekdayName("2026-10-26", en)).toBe("Monday");
		expect(rangeLabel("2026-11-02", "2026-11-30", TODAY, en)).toBe("Nov 2–30");
	});

	it("describes deadlines relative to today", () => {
		expect(deadlineLabel("2026-10-22", TODAY, en)).toBe("3 days ago");
		expect(deadlineLabel("2026-10-24", TODAY, en)).toBe("yesterday");
		expect(deadlineLabel(TODAY, TODAY, en)).toBe("today");
		expect(deadlineLabel("2026-10-26", TODAY, en)).toBe("tomorrow");
		expect(deadlineLabel("2026-11-01", TODAY, en)).toBe("7 days left");
		expect(deadlineLabel("2026-12-01", TODAY, en)).toBe("Dec 1");
	});
});
