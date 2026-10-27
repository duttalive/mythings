// What the delete confirmation says for each kind of thing: what goes with
// it, and whether it can come back from Trash.

import type { Area, Heading, Project, Tag, Todo } from "../../shared/schema";
import type { ViewData } from "../../shared/views";
import { count, type DeleteRequest, quoted } from "../components/ConfirmDelete";

const TRASH = "You can restore it from Trash for 30 days.";
const TRASH_THEM = "You can restore them from Trash for 30 days.";

const live = <T extends { deletedAt: number | null }>(rows: T[]) =>
	rows.filter((r) => r.deletedAt === null);

/** "It moves to Trash with its 3 to-dos." or "It moves to Trash." */
const withContents = (parts: string[]) =>
	parts.length > 0
		? `It moves to Trash with its ${parts.join(" and ")}. ${TRASH_THEM}`
		: `It moves to Trash. ${TRASH}`;

export function todosRequest(todos: Todo[]): DeleteRequest {
	const [only] = todos;
	if (todos.length === 1 && only)
		return {
			title: `Delete ${quoted(only.title, "this to-do")}?`,
			body: `It moves to Trash. ${TRASH}`,
		};
	return {
		title: `Delete ${count(todos.length, "to-do")}?`,
		body: `They move to Trash. ${TRASH_THEM}`,
	};
}

export function headingRequest(
	heading: Heading,
	data: ViewData,
): DeleteRequest {
	const todos = live(data.todos).filter((t) => t.headingId === heading.id);
	return {
		title: `Delete heading ${quoted(heading.title, "“New Heading”")}?`,
		body: withContents(todos.length ? [count(todos.length, "to-do")] : []),
	};
}

export function projectRequest(
	project: Project,
	data: ViewData,
): DeleteRequest {
	const todos = live(data.todos).filter((t) => t.projectId === project.id);
	const headings = live(data.headings).filter(
		(h) => h.projectId === project.id,
	);
	return {
		title: `Delete project ${quoted(project.title, "“New Project”")}?`,
		body: withContents([
			...(todos.length ? [count(todos.length, "to-do")] : []),
			...(headings.length ? [count(headings.length, "heading")] : []),
		]),
	};
}

export function areaRequest(area: Area, data: ViewData): DeleteRequest {
	const projects = live(data.projects).filter((p) => p.areaId === area.id);
	const projectIds = new Set(projects.map((p) => p.id));
	const todos = live(data.todos).filter(
		(t) => t.areaId === area.id || (t.projectId && projectIds.has(t.projectId)),
	);
	return {
		title: `Delete area ${quoted(area.title, "“New Area”")}?`,
		body: withContents([
			...(projects.length ? [count(projects.length, "project")] : []),
			...(todos.length ? [count(todos.length, "to-do")] : []),
		]),
	};
}

export function tagRequest(tag: Tag, data: ViewData): DeleteRequest {
	const tagged =
		live(data.todos).filter((t) => t.tagIds.includes(tag.id)).length +
		live(data.projects).filter((p) => p.tagIds.includes(tag.id)).length;
	return {
		title: `Delete tag ${quoted(tag.title, "this tag")}?`,
		body: `${tagged ? `It comes off ${count(tagged, "to-do or project", "to-dos and projects")}; they stay. ` : ""}Tags don't go to Trash, so you can only undo this straight away.`,
		confirmLabel: "Delete Tag",
	};
}

export function emptyTrashRequest(items: number): DeleteRequest {
	return {
		title: `Empty Trash?`,
		body: `${count(items, "item")} and everything inside ${items === 1 ? "it" : "them"} will be deleted permanently, on all your devices.`,
		permanent: true,
		confirmLabel: "Empty Trash",
	};
}

/** For something dragged onto Trash in the sidebar. */
export function dragToTrashRequest(
	kind: "todo" | "project" | "area",
	id: string,
	data: ViewData,
): DeleteRequest | null {
	if (kind === "todo") {
		const todo = data.todos.find((t) => t.id === id);
		return todo ? todosRequest([todo]) : null;
	}
	if (kind === "project") {
		const project = data.projects.find((p) => p.id === id);
		return project ? projectRequest(project, data) : null;
	}
	const area = data.areas.find((a) => a.id === id);
	return area ? areaRequest(area, data) : null;
}
