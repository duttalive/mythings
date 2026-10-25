// Natural-language dates for the When and Deadline pickers ("tmrw", "next fri",
// "in 2 weeks", "dec 3"). Built on chrono, plus Things-style keywords.

import * as chrono from "chrono-node";
import {
	formatLocalDate,
	type LocalDate,
	parseLocalDate,
} from "../../shared/dates";

export type ParsedWhen =
	| { kind: "today" }
	| { kind: "evening" }
	| { kind: "someday" }
	| { kind: "anytime" }
	| { kind: "date"; date: LocalDate };

const KEYWORDS: Record<string, ParsedWhen["kind"]> = {
	today: "today",
	tod: "today",
	now: "today",
	tonight: "evening",
	evening: "evening",
	"this evening": "evening",
	someday: "someday",
	later: "someday",
	anytime: "anytime",
};

const ALIASES: [RegExp, string][] = [
	[/\b(tmrw|tmr|tom|tmw)\b/g, "tomorrow"],
	[/\bnxt\b/g, "next"],
];

/**
 * Parses a date phrase relative to the user's `today`. Past dates without a
 * year roll forward ("oct 1" in late October means next October).
 */
export function parseDate(text: string, today: LocalDate): LocalDate | null {
	let phrase = text.trim().toLowerCase();
	if (!phrase) return null;
	for (const [pattern, replacement] of ALIASES)
		phrase = phrase.replace(pattern, replacement);

	// chrono works in the runtime's local time; anchor at local noon on the user's today.
	const { year, month, day } = parseLocalDate(today);
	const ref = new Date(year, month - 1, day, 12);
	const result = chrono.parseDate(phrase, ref, { forwardDate: true });
	if (!result || Number.isNaN(result.getTime())) return null;
	return formatLocalDate(
		result.getFullYear(),
		result.getMonth() + 1,
		result.getDate(),
	);
}

/** Parses the When field: keywords like "today", "tonight", "someday", or any date phrase. */
export function parseWhen(text: string, today: LocalDate): ParsedWhen | null {
	const phrase = text.trim().toLowerCase();
	const keyword = KEYWORDS[phrase];
	if (
		keyword === "today" ||
		keyword === "evening" ||
		keyword === "someday" ||
		keyword === "anytime"
	) {
		return { kind: keyword };
	}
	const date = parseDate(phrase, today);
	if (!date) return null;
	return date === today ? { kind: "today" } : { kind: "date", date };
}
