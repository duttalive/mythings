// Recurrence for repeat templates (SPEC §5.8). Everything works on local
// calendar dates, so DST can't move an occurrence to a different day; time
// zones only come in when turning a reminder time into an instant.

import {
	addDays,
	addMonths,
	addYears,
	clampDay,
	formatLocalDate,
	type LocalDate,
	parseLocalDate,
	startOfWeek,
	weekday,
	zonedTimeToEpoch,
} from "./dates";
import type { RepeatRule } from "./schema";

/** Safety cap on loop iterations (a daily rule missed for 270 years). */
const MAX_STEPS = 100_000;

function nthWeekdayOfMonth(
	year: number,
	month: number,
	n: number,
	wd: number,
): LocalDate {
	if (n === -1) {
		const last = formatLocalDate(year, month, clampDay(year, month, -1));
		return addDays(last, -((weekday(last) - wd + 7) % 7));
	}
	const first = formatLocalDate(year, month, 1);
	return addDays(first, ((wd - weekday(first) + 7) % 7) + 7 * (n - 1));
}

/** The occurrence of a fixed monthly rule within a given month. */
function monthlyDateIn(
	rule: RepeatRule,
	year: number,
	month: number,
): LocalDate {
	if (rule.byNth)
		return nthWeekdayOfMonth(year, month, rule.byNth.n, rule.byNth.weekday);
	return formatLocalDate(
		year,
		month,
		clampDay(year, month, rule.byMonthDay ?? 1),
	);
}

/** The occurrence of a fixed yearly rule within a given year (Feb 29 → Feb 28 in common years). */
function yearlyDateIn(rule: RepeatRule, year: number): LocalDate {
	const month = rule.byMonth ?? 1;
	return formatLocalDate(
		year,
		month,
		clampDay(year, month, rule.byMonthDay ?? 1),
	);
}

/** byWeekday as offsets from the start of the week, ascending. */
function weekOffsets(rule: RepeatRule, weekStart: number): number[] {
	return [...new Set(rule.byWeekday ?? [])]
		.map((w) => (w - weekStart + 7) % 7)
		.sort((a, b) => a - b);
}

function withinEnd(rule: RepeatRule, date: LocalDate): LocalDate | null {
	return rule.endsOn && date > rule.endsOn ? null : date;
}

/**
 * The next occurrence strictly after `date`, which is taken to be an
 * occurrence itself (it anchors intervals such as "every 2 weeks").
 *
 * For `afterCompletion` rules, pass the date the last instance was completed:
 * the result is that date plus the interval.
 */
export function nextAfter(
	rule: RepeatRule,
	date: LocalDate,
	weekStart = 1,
): LocalDate | null {
	const { interval } = rule;
	let next: LocalDate;

	if (rule.mode === "afterCompletion") {
		next =
			rule.freq === "daily"
				? addDays(date, interval)
				: rule.freq === "weekly"
					? addDays(date, 7 * interval)
					: rule.freq === "monthly"
						? addMonths(date, interval)
						: addYears(date, interval);
	} else if (rule.freq === "daily") {
		next = addDays(date, interval);
	} else if (rule.freq === "weekly") {
		const offsets = weekOffsets(rule, weekStart);
		const current = (weekday(date) - weekStart + 7) % 7;
		const laterThisWeek = offsets.find((o) => o > current);
		if (offsets.length === 0) next = addDays(date, 7 * interval);
		else if (laterThisWeek !== undefined)
			next = addDays(date, laterThisWeek - current);
		else
			next = addDays(
				startOfWeek(date, weekStart),
				7 * interval + (offsets[0] ?? 0),
			);
	} else if (rule.freq === "monthly") {
		const { year, month } = parseLocalDate(addMonths(date, interval, 1));
		next = monthlyDateIn(rule, year, month);
	} else {
		next = yearlyDateIn(rule, parseLocalDate(date).year + interval);
	}

	return withinEnd(rule, next);
}

/** The first occurrence on or after `from`; used to set `nextDate` when a rule is created or edited. */
export function firstOnOrAfter(
	rule: RepeatRule,
	from: LocalDate,
	weekStart = 1,
): LocalDate | null {
	if (rule.mode === "afterCompletion" || rule.freq === "daily")
		return withinEnd(rule, from);

	if (rule.freq === "weekly") {
		const offsets = weekOffsets(rule, weekStart);
		if (offsets.length === 0) return withinEnd(rule, from);
		const current = (weekday(from) - weekStart + 7) % 7;
		const offset = offsets.find((o) => o >= current);
		return withinEnd(
			rule,
			offset !== undefined
				? addDays(from, offset - current)
				: addDays(startOfWeek(from, weekStart), 7 + (offsets[0] ?? 0)),
		);
	}

	const { year, month } = parseLocalDate(from);
	if (rule.freq === "monthly") {
		const candidate = monthlyDateIn(rule, year, month);
		if (candidate >= from) return withinEnd(rule, candidate);
		const following = parseLocalDate(addMonths(from, 1, 1));
		return withinEnd(
			rule,
			monthlyDateIn(rule, following.year, following.month),
		);
	}

	const candidate = yearlyDateIn(rule, year);
	return withinEnd(
		rule,
		candidate >= from ? candidate : yearlyDateIn(rule, year + 1),
	);
}

/**
 * For a fixed-schedule template whose `nextDate` has arrived, returns the
 * single instance to create and the template's new `nextDate` (null when the
 * series has ended). If occurrences were missed, only the most recent one is
 * created. Returns null when nothing is due.
 */
export function materialize(
	rule: RepeatRule,
	today: LocalDate,
	weekStart = 1,
): { instanceDate: LocalDate; nextDate: LocalDate | null } | null {
	if (rule.mode !== "fixed" || rule.nextDate > today) return null;
	if (rule.endsOn && rule.nextDate > rule.endsOn) return null;

	let instanceDate = rule.nextDate;
	let nextDate = nextAfter(rule, instanceDate, weekStart);
	for (let steps = 0; nextDate !== null && nextDate <= today; steps++) {
		if (steps >= MAX_STEPS) throw new Error("Repeat rule did not advance");
		instanceDate = nextDate;
		nextDate = nextAfter(rule, instanceDate, weekStart);
	}
	return { instanceDate, nextDate };
}

/** Scheduling fields for an instance starting on `date`. */
export function instanceSchedule(
	rule: RepeatRule,
	date: LocalDate,
	tz: string,
): {
	startDate: LocalDate;
	deadline: LocalDate | null;
	reminderAt: number | null;
} {
	return {
		startDate: date,
		deadline:
			rule.deadlineOffsetDays === undefined
				? null
				: addDays(date, rule.deadlineOffsetDays),
		reminderAt: rule.reminderTime
			? zonedTimeToEpoch(date, rule.reminderTime, tz)
			: null,
	};
}

/** The next `count` occurrences starting with `rule.nextDate`, e.g. for previews in the repeat editor. */
export function previewOccurrences(
	rule: RepeatRule,
	count: number,
	weekStart = 1,
): LocalDate[] {
	const dates: LocalDate[] = [];
	let date: LocalDate | null = withinEnd(rule, rule.nextDate);
	while (date !== null && dates.length < count) {
		dates.push(date);
		date = rule.mode === "fixed" ? nextAfter(rule, date, weekStart) : null;
	}
	return dates;
}
