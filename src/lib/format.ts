// Display labels for local dates. Dates are "YYYY-MM-DD" strings; formatting
// goes through UTC so the viewer's own time zone never shifts the day.

import {
	addDays,
	diffDays,
	type LocalDate,
	parseLocalDate,
} from "../../shared/dates";

function utc(date: LocalDate): Date {
	const { year, month, day } = parseLocalDate(date);
	return new Date(Date.UTC(year, month - 1, day));
}

function fmt(
	date: LocalDate,
	options: Intl.DateTimeFormatOptions,
	locale?: string,
): string {
	return new Intl.DateTimeFormat(locale, {
		...options,
		timeZone: "UTC",
	}).format(utc(date));
}

const sameYear = (a: LocalDate, b: LocalDate) =>
	a.slice(0, 4) === b.slice(0, 4);

/** "Oct 30", with the year when it isn't this year. */
export function shortDate(
	date: LocalDate,
	today: LocalDate,
	locale?: string,
): string {
	return fmt(
		date,
		{
			month: "short",
			day: "numeric",
			year: sameYear(date, today) ? undefined : "numeric",
		},
		locale,
	);
}

/** "Today", "Tomorrow", "Yesterday", else "Fri, Oct 30". */
export function dayLabel(
	date: LocalDate,
	today: LocalDate,
	locale?: string,
): string {
	if (date === today) return "Today";
	if (date === addDays(today, 1)) return "Tomorrow";
	if (date === addDays(today, -1)) return "Yesterday";
	return fmt(
		date,
		{
			weekday: "short",
			month: "short",
			day: "numeric",
			year: sameYear(date, today) ? undefined : "numeric",
		},
		locale,
	);
}

/** "Monday". */
export function weekdayName(date: LocalDate, locale?: string): string {
	return fmt(date, { weekday: "long" }, locale);
}

/** "December", or "January 2027" outside the current year. Takes "YYYY-MM". */
export function monthLabel(
	month: string,
	today: LocalDate,
	locale?: string,
): string {
	const date = `${month}-01`;
	return fmt(
		date,
		{
			month: "long",
			year: sameYear(date, today) ? undefined : "numeric",
		},
		locale,
	);
}

/** "Nov 2–30". */
export function rangeLabel(
	from: LocalDate,
	to: LocalDate,
	today: LocalDate,
	locale?: string,
): string {
	return `${shortDate(from, today, locale)}–${parseLocalDate(to).day}`;
}

/** Deadline text: "3 days ago", "today", "2 days left", or a date when far off. */
export function deadlineLabel(
	deadline: LocalDate,
	today: LocalDate,
	locale?: string,
): string {
	const days = diffDays(today, deadline);
	if (days < -1) return `${-days} days ago`;
	if (days === -1) return "yesterday";
	if (days === 0) return "today";
	if (days === 1) return "tomorrow";
	if (days <= 14) return `${days} days left`;
	return shortDate(deadline, today, locale);
}
