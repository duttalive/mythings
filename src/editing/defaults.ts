// Where a new to-do goes depends on the list it's created in.

import { addDays, type LocalDate } from "../../shared/dates";
import type { Todo } from "../../shared/schema";
import { keyAfter, maxKey } from "../lib/order";

export type ListLocation =
	| {
			list:
				| "inbox"
				| "today"
				| "upcoming"
				| "anytime"
				| "someday"
				| "logbook"
				| "trash";
	  }
	| { list: "project"; projectId: string }
	| { list: "area"; areaId: string }
	| { list: "tag"; tagId: string }
	| { list: "other" };

/** Lists where creating a to-do makes no sense. */
export function canCreateIn(location: ListLocation): boolean {
	return location.list !== "logbook" && location.list !== "trash";
}

export function locationFromPath(pathname: string): ListLocation {
	const [, first, second] = pathname.split("/");
	switch (first) {
		case "inbox":
		case "today":
		case "upcoming":
		case "anytime":
		case "someday":
		case "logbook":
		case "trash":
			return { list: first };
		case "project":
			return second
				? { list: "project", projectId: second }
				: { list: "other" };
		case "area":
			return second ? { list: "area", areaId: second } : { list: "other" };
		case "tag":
			return second ? { list: "tag", tagId: second } : { list: "other" };
		default:
			return { list: "other" };
	}
}

/**
 * Fields for a to-do created in `location`, placed at the end of its list.
 * Tags selected in the tag bar are applied too, so the new to-do stays visible.
 */
export function newTodoFields(
	location: ListLocation,
	today: LocalDate,
	todos: Todo[],
	filterTagIds: string[] = [],
): Partial<Todo> {
	let fields: Partial<Todo>;
	switch (location.list) {
		case "today":
			fields = { when: "scheduled", startDate: today };
			break;
		case "upcoming":
			fields = { when: "scheduled", startDate: addDays(today, 1) };
			break;
		case "anytime":
			fields = { when: "anytime" };
			break;
		case "someday":
			fields = { when: "someday" };
			break;
		case "project":
			fields = { projectId: location.projectId, when: "anytime" };
			break;
		case "area":
			fields = { areaId: location.areaId, when: "anytime" };
			break;
		case "tag":
			fields = { when: "anytime", tagIds: [location.tagId] };
			break;
		default:
			fields = { when: "inbox" };
	}

	const tagIds = [...new Set([...(fields.tagIds ?? []), ...filterTagIds])];
	if (tagIds.length) fields.tagIds = tagIds;

	const siblings = todos.filter(
		(t) =>
			t.deletedAt === null &&
			(t.projectId ?? null) === (fields.projectId ?? null) &&
			(fields.projectId
				? t.headingId === null
				: (t.areaId ?? null) === (fields.areaId ?? null)),
	);
	fields.sortKey = keyAfter(maxKey(siblings.map((t) => t.sortKey)));
	if (location.list === "today") {
		fields.todaySortKey = keyAfter(maxKey(todos.map((t) => t.todaySortKey)));
	}
	return fields;
}
