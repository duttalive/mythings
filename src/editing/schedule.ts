import type { LocalDate } from "../../shared/dates";
import type { Todo } from "../../shared/schema";
import type { ParsedWhen } from "../lib/parseDate";

/** What can be chosen in the When picker (a past day can't). */
export type WhenChoice =
	| Exclude<ParsedWhen, { kind: "past" }>
	| { kind: "clear" };
export type WhenFields = Pick<Todo, "when" | "startDate" | "evening">;

/** The scheduling patch for a choice in the When picker. */
export function whenPatch(choice: WhenChoice, today: LocalDate): WhenFields {
	switch (choice.kind) {
		case "today":
			return { when: "scheduled", startDate: today, evening: false };
		case "date":
			return choice.date === today
				? { when: "scheduled", startDate: today, evening: false }
				: { when: "scheduled", startDate: choice.date, evening: false };
		case "someday":
			return { when: "someday", startDate: null, evening: false };
		case "anytime":
		case "clear":
			return { when: "anytime", startDate: null, evening: false };
	}
}

/** Shown when an overdue item can't be planned for today. */
export const OVERDUE_STAYS =
	"Overdue tasks stay in Overdue. Change the deadline to plan one for today.";
