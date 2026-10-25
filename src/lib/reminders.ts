import {
	type LocalDate,
	localTimeOf,
	zonedTimeToEpoch,
} from "../../shared/dates";

/** "HH:mm" of a reminder in the user's time zone. */
export function reminderTime(reminderAt: number, tz: string): string {
	return localTimeOf(reminderAt, tz);
}

export function reminderAt(date: LocalDate, time: string, tz: string): number {
	return zonedTimeToEpoch(date, time, tz);
}

/**
 * Keeps a reminder at the same time of day when its to-do moves to another
 * date; drops it when the to-do loses its date.
 */
export function moveReminder(
	current: number | null,
	startDate: LocalDate | null,
	tz: string,
): number | null {
	if (current === null) return null;
	if (startDate === null) return null;
	return reminderAt(startDate, reminderTime(current, tz), tz);
}

/** "9:00", or "9:00 AM" in 12-hour locales. */
export function formatTime(time: string, locale?: string): string {
	const [h = 0, m = 0] = time.split(":").map(Number);
	return new Intl.DateTimeFormat(locale, {
		hour: "numeric",
		minute: "2-digit",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}
