import type { LocalDate } from "../../shared/dates";
import type { Todo } from "../../shared/schema";
import type { ParsedWhen } from "../lib/parseDate";

export type WhenChoice = ParsedWhen | { kind: "clear" };
export type WhenFields = Pick<Todo, "when" | "startDate" | "evening">;

/** The scheduling patch for a choice in the When picker. */
export function whenPatch(choice: WhenChoice, today: LocalDate): WhenFields {
	switch (choice.kind) {
		case "today":
			return { when: "scheduled", startDate: today, evening: false };
		case "evening":
			return { when: "scheduled", startDate: today, evening: true };
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
