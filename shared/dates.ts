// Calendar dates are plain "YYYY-MM-DD" strings in the user's local time zone.
// They compare correctly as strings, and all arithmetic on them is done in UTC
// so DST never shifts a day. Time zones only matter when converting between a
// local date/time and an instant (epoch ms), e.g. for "today" or reminders.

export type LocalDate = string;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type DateParts = { year: number; month: number; day: number };

export function parseLocalDate(date: LocalDate): DateParts {
	const m = DATE_RE.exec(date);
	if (!m) throw new Error(`Invalid local date: ${date}`);
	return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function isValidLocalDate(value: string): boolean {
	const m = DATE_RE.exec(value);
	if (!m) return false;
	const year = Number(m[1]);
	const month = Number(m[2]);
	const day = Number(m[3]);
	return (
		month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
	);
}

export function formatLocalDate(
	year: number,
	month: number,
	day: number,
): LocalDate {
	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** `month` is 1-based. */
export function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toUtcMs(date: LocalDate): number {
	const { year, month, day } = parseLocalDate(date);
	return Date.UTC(year, month - 1, day);
}

function fromUtcMs(ms: number): LocalDate {
	const d = new Date(ms);
	return formatLocalDate(
		d.getUTCFullYear(),
		d.getUTCMonth() + 1,
		d.getUTCDate(),
	);
}

export function addDays(date: LocalDate, days: number): LocalDate {
	return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function diffDays(from: LocalDate, to: LocalDate): number {
	return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: LocalDate): number {
	return new Date(toUtcMs(date)).getUTCDay();
}

/**
 * Adds calendar months. The day is `day` if given (-1 = last day of the month),
 * otherwise the date's own day; either way it is clamped to the month's length.
 */
export function addMonths(
	date: LocalDate,
	months: number,
	day?: number,
): LocalDate {
	const parts = parseLocalDate(date);
	const total = parts.year * 12 + (parts.month - 1) + months;
	const year = Math.floor(total / 12);
	const month = (total % 12) + 1;
	return formatLocalDate(year, month, clampDay(year, month, day ?? parts.day));
}

export function addYears(date: LocalDate, years: number): LocalDate {
	return addMonths(date, years * 12);
}

/** Day-of-month for `day` (-1 = last), clamped to the month's length. */
export function clampDay(year: number, month: number, day: number): number {
	const last = daysInMonth(year, month);
	return day === -1 ? last : Math.min(day, last);
}

export function startOfWeek(date: LocalDate, weekStart = 1): LocalDate {
	return addDays(date, -((weekday(date) - weekStart + 7) % 7));
}

export function lastDayOfMonth(date: LocalDate): LocalDate {
	const { year, month } = parseLocalDate(date);
	return formatLocalDate(year, month, daysInMonth(year, month));
}

/** "YYYY-MM" */
export function monthOf(date: LocalDate): string {
	return date.slice(0, 7);
}

// ---------------------------------------------------------------------------
// Time zones

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
	let fmt = formatters.get(tz);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat("en-US", {
			timeZone: tz,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});
		formatters.set(tz, fmt);
	}
	return fmt;
}

function zonedParts(epochMs: number, tz: string) {
	const parts: Record<string, number> = {};
	for (const p of formatterFor(tz).formatToParts(epochMs)) {
		if (p.type !== "literal") parts[p.type] = Number(p.value);
	}
	return parts as Record<
		"year" | "month" | "day" | "hour" | "minute" | "second",
		number
	>;
}

/** The local calendar date of an instant in `tz`. */
export function localDateOf(epochMs: number, tz: string): LocalDate {
	const p = zonedParts(epochMs, tz);
	return formatLocalDate(p.year, p.month, p.day);
}

/** The local wall-clock time of an instant in `tz`, as "HH:mm". */
export function localTimeOf(epochMs: number, tz: string): string {
	const p = zonedParts(epochMs, tz);
	return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function todayIn(tz: string, now: number = Date.now()): LocalDate {
	return localDateOf(now, tz);
}

/** Offset of `tz` from UTC at an instant, in ms (e.g. -4h for New York in summer). */
export function tzOffsetMs(epochMs: number, tz: string): number {
	const p = zonedParts(epochMs, tz);
	const asUtc = Date.UTC(
		p.year,
		p.month - 1,
		p.day,
		p.hour,
		p.minute,
		p.second,
	);
	return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/**
 * The instant at which the wall clock in `tz` reads `date` `time` ("HH:mm").
 * Matches Temporal's "compatible" disambiguation: a time repeated by a DST
 * fall-back resolves to the earlier instant, and a time skipped by a
 * spring-forward resolves to the same distance past the gap (02:30 → 03:30).
 */
export function zonedTimeToEpoch(
	date: LocalDate,
	time: string,
	tz: string,
): number {
	const t = TIME_RE.exec(time);
	if (!t) throw new Error(`Invalid time: ${time}`);
	const { year, month, day } = parseLocalDate(date);
	const wall = Date.UTC(year, month - 1, day, Number(t[1]), Number(t[2]));

	const offsetBefore = tzOffsetMs(wall - DAY_MS, tz);
	const offsetAfter = tzOffsetMs(wall + DAY_MS, tz);
	const valid = [...new Set([offsetBefore, offsetAfter])]
		.map((offset) => wall - offset)
		.filter((epoch) => epoch + tzOffsetMs(epoch, tz) === wall);

	if (valid.length > 0) return Math.min(...valid);
	return wall - offsetBefore;
}

/** The next instant after `now` at which the local date in `tz` changes. */
export function nextLocalMidnight(
	tz: string,
	now: number = Date.now(),
): number {
	return zonedTimeToEpoch(addDays(localDateOf(now, tz), 1), "00:00", tz);
}
