// The repeat editor's form, and turning it into a RepeatRule (SPEC §5.8).

import { type LocalDate, parseLocalDate, weekday } from "../../shared/dates";
import { firstOnOrAfter } from "../../shared/repeat";
import { type RepeatRule, repeatRuleSchema } from "../../shared/schema";

export type Freq = RepeatRule["freq"];
export type Nth = 1 | 2 | 3 | 4 | -1;

export type RepeatForm = {
	mode: RepeatRule["mode"];
	freq: Freq;
	interval: number;
	/** weekly: weekdays (0 = Sunday). */
	weekdays: number[];
	/** monthly: by day of month, or by "2nd Tuesday". */
	monthlyBy: "day" | "nth";
	/** -1 = last day. */
	monthDay: number;
	nth: Nth;
	nthWeekday: number;
	/** yearly: 1–12. */
	yearMonth: number;
	yearDay: number;
	/** The first occurrence is on or after this date. */
	start: LocalDate;
	deadlineOffset: number | null;
	reminderTime: string | null;
	endsOn: LocalDate | null;
};

/** A form for an existing rule, or sensible defaults based on `start`. */
export function formFromRule(
	rule: RepeatRule | null,
	start: LocalDate,
): RepeatForm {
	const from = rule?.nextDate ?? start;
	const { month, day } = parseLocalDate(from);
	const nthOfMonth = Math.ceil(day / 7);
	return {
		mode: rule?.mode ?? "fixed",
		freq: rule?.freq ?? "weekly",
		interval: rule?.interval ?? 1,
		weekdays: rule?.byWeekday ?? [weekday(from)],
		monthlyBy: rule?.byNth ? "nth" : "day",
		monthDay: rule?.byMonthDay ?? day,
		nth: rule?.byNth?.n ?? (nthOfMonth > 4 ? -1 : (nthOfMonth as Nth)),
		nthWeekday: rule?.byNth?.weekday ?? weekday(from),
		yearMonth: rule?.byMonth ?? month,
		yearDay: rule?.freq === "yearly" ? (rule.byMonthDay ?? day) : day,
		start: from,
		deadlineOffset: rule?.deadlineOffsetDays ?? null,
		reminderTime: rule?.reminderTime ?? null,
		endsOn: rule?.endsOn ?? null,
	};
}

/** The rule the form describes, with nextDate set to its first occurrence; or why it's invalid. */
export function ruleFromForm(
	form: RepeatForm,
	weekStart: number,
): { rule: RepeatRule } | { error: string } {
	const fixed = form.mode === "fixed";
	const candidate: RepeatRule = {
		mode: form.mode,
		freq: form.freq,
		interval: Math.max(1, Math.floor(form.interval) || 1),
		nextDate: form.start,
		...(fixed &&
			form.freq === "weekly" &&
			form.weekdays.length > 0 && { byWeekday: [...form.weekdays].sort() }),
		...(fixed &&
			form.freq === "monthly" &&
			form.monthlyBy === "day" && { byMonthDay: form.monthDay }),
		...(fixed &&
			form.freq === "monthly" &&
			form.monthlyBy === "nth" && {
				byNth: { n: form.nth, weekday: form.nthWeekday },
			}),
		...(fixed &&
			form.freq === "yearly" && {
				byMonth: form.yearMonth,
				byMonthDay: form.yearDay,
			}),
		...(form.deadlineOffset !== null && {
			deadlineOffsetDays: form.deadlineOffset,
		}),
		...(form.reminderTime && { reminderTime: form.reminderTime }),
		...(form.endsOn && { endsOn: form.endsOn }),
	};
	const first = firstOnOrAfter(candidate, form.start, weekStart);
	if (!first) return { error: "The repeat ends before it starts." };
	const parsed = repeatRuleSchema.safeParse({ ...candidate, nextDate: first });
	if (!parsed.success)
		return {
			error: parsed.error.issues[0]?.message ?? "That repeat isn't valid.",
		};
	return { rule: parsed.data };
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_DAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
const MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];
const UNITS: Record<Freq, [string, string]> = {
	daily: ["day", "days"],
	weekly: ["week", "weeks"],
	monthly: ["month", "months"],
	yearly: ["year", "years"],
};

export function ordinal(n: number): string {
	if (n === -1) return "last";
	const suffix =
		n % 100 >= 11 && n % 100 <= 13
			? "th"
			: (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ??
				"th");
	return `${n}${suffix}`;
}

/** "Every 2 weeks on Mon, Thu", "Every month on the last Friday", "3 days after completion". */
export function describeRule(rule: RepeatRule): string {
	const [one, many] = UNITS[rule.freq];
	const every =
		rule.interval === 1 ? `Every ${one}` : `Every ${rule.interval} ${many}`;
	let text: string;
	if (rule.mode === "afterCompletion") {
		text = `${rule.interval} ${rule.interval === 1 ? one : many} after completion`;
	} else if (rule.freq === "weekly" && rule.byWeekday?.length) {
		text = `${every} on ${rule.byWeekday.map((d) => DAY_NAMES[d]).join(", ")}`;
	} else if (rule.freq === "monthly" && rule.byNth) {
		text = `${every} on the ${ordinal(rule.byNth.n)} ${LONG_DAY_NAMES[rule.byNth.weekday]}`;
	} else if (rule.freq === "monthly" && rule.byMonthDay !== undefined) {
		text = `${every} on the ${rule.byMonthDay === -1 ? "last day" : ordinal(rule.byMonthDay)}`;
	} else if (rule.freq === "yearly" && rule.byMonth && rule.byMonthDay) {
		text = `${every} on ${MONTH_NAMES[rule.byMonth - 1]} ${rule.byMonthDay === -1 ? "(last day)" : rule.byMonthDay}`;
	} else {
		text = every;
	}
	return rule.endsOn ? `${text} until ${rule.endsOn}` : text;
}
