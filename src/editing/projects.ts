// Pure helpers for areas, projects and headings (SPEC §5.1–5.3).

import type { Area, Heading, Project, Status, Todo } from "../../shared/schema";
import { keyAfter, maxKey } from "../lib/order";
import type { Mutation } from "../sync/engine";

const live = <T extends { deletedAt: number | null }>(rows: T[]) =>
	rows.filter((r) => r.deletedAt === null);

/** The project's to-dos that are still open (repeat templates aside, which always stay open). */
export function openTodosIn(projectId: string, todos: Todo[]): Todo[] {
	return live(todos).filter(
		(t) =>
			t.projectId === projectId && t.status === "open" && t.repeat === null,
	);
}

/**
 * Finishes a project as completed or canceled, marking its remaining open
 * to-dos the same way, in one batch.
 */
export function finishProjectMutations(
	project: Project,
	todos: Todo[],
	status: Exclude<Status, "open">,
): Mutation[] {
	return [
		...openTodosIn(project.id, todos).map(
			(todo): Mutation => ({
				type: "upsert",
				entity: "todo",
				id: todo.id,
				patch: { status },
			}),
		),
		{ type: "upsert", entity: "project", id: project.id, patch: { status } },
	];
}

/** A new project at the end of its area (or of the projects without one). */
export function newProjectFields(
	areaId: string | null,
	projects: Project[],
): Partial<Project> {
	const siblings = live(projects).filter((p) => p.areaId === areaId);
	return {
		title: "",
		areaId,
		when: "anytime",
		sortKey: keyAfter(maxKey(siblings.map((p) => p.sortKey))),
	};
}

export function newAreaFields(areas: Area[]): Partial<Area> {
	return {
		title: "",
		sortKey: keyAfter(maxKey(live(areas).map((a) => a.sortKey))),
	};
}

export function newHeadingFields(
	projectId: string,
	headings: Heading[],
): Partial<Heading> {
	const siblings = live(headings).filter((h) => h.projectId === projectId);
	return {
		projectId,
		title: "",
		sortKey: keyAfter(maxKey(siblings.map((h) => h.sortKey))),
	};
}

/** A new to-do at the end of a heading. */
export function newTodoUnderHeadingFields(
	heading: Heading,
	todos: Todo[],
): Partial<Todo> {
	const siblings = live(todos).filter((t) => t.headingId === heading.id);
	return {
		projectId: heading.projectId,
		headingId: heading.id,
		when: "anytime",
		sortKey: keyAfter(maxKey(siblings.map((t) => t.sortKey))),
	};
}

/** Headings can be archived once nothing under them is left to do. */
export function canArchiveHeading(headingId: string, todos: Todo[]): boolean {
	return !live(todos).some(
		(t) =>
			t.headingId === headingId && t.status === "open" && t.repeat === null,
	);
}
