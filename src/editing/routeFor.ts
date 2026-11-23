// Where a to-do shows up, to open it there.

import type { Todo } from "../../shared/schema";
import { isInToday, isOverdue } from "../../shared/views";

/** The list a to-do shows up in, to open it there. */
export function routeFor(
	todo: Todo,
	today: string,
): { to: string; params?: Record<string, string> } {
	if (todo.deletedAt !== null) return { to: "/trash" };
	if (todo.status !== "open") return { to: "/logbook" };
	if (todo.projectId)
		return { to: "/project/$projectId", params: { projectId: todo.projectId } };
	if (todo.areaId)
		return { to: "/area/$areaId", params: { areaId: todo.areaId } };
	if (todo.when === "inbox") return { to: "/inbox" };
	if (isInToday(todo, today)) return { to: "/today" };
	if (isOverdue(todo, today)) return { to: "/overdue" };
	if (todo.when === "scheduled") return { to: "/upcoming" };
	if (todo.when === "someday") return { to: "/someday" };
	return { to: "/anytime" };
}
