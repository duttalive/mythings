// What the delete confirmation says for each kind of thing: what goes with
// it, and whether it can come back from Trash.

import type { Area, Heading, Project, Tag, Todo } from "../../shared/schema";
import type { ViewData } from "../../shared/views";
import { count, type DeleteRequest, quoted } from "../components/ConfirmDelete";
import { tagDescendants } from "../dnd/tagMoves";

const TRASH = "You can restore it from Trash for 30 days.";
const TRASH_THEM = "You can restore them from Trash for 30 days.";

const live = <T extends { deletedAt: number | null }>(rows: T[]) =>
	rows.filter((r) => r.deletedAt === null);

/** "It moves to Trash with its 3 to-dos." or "It moves to Trash." */
/** "a", "a and b", "a, b and c". */
const list = (parts: string[]) =>
	parts.length > 2
		? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
		: parts.join(" and ");

const withContents = (parts: string[]) =>
	parts.length > 0
		? `It moves to Trash with its ${list(parts)}. ${TRASH_THEM}`
		: `It moves to Trash. ${TRASH}`;

export function todosRequest(todos: Todo[]): DeleteRequest {
	const [only] = todos;
	if (todos.length === 1 && only)
		return {
			title: `Delete ${quoted(only.title, "this task")}?`,
			body: `It moves to Trash. ${TRASH}`,
		};
	return {
		title: `Delete ${count(todos.length, "task")}?`,
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
		body: withContents(todos.length ? [count(todos.length, "task")] : []),
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
			...(todos.length ? [count(todos.length, "task")] : []),
			...(headings.length ? [count(headings.length, "heading")] : []),
		]),
	};
}

/** An area (with its to-dos) or a Life Bucket (with its areas, projects and their to-dos). */
export function areaRequest(area: Area, data: ViewData): DeleteRequest {
	const areas =
		area.kind === "bucket"
			? live(data.areas).filter((a) => a.bucketId === area.id)
			: [area];
	const projects =
		area.kind === "bucket"
			? live(data.projects).filter((p) => p.areaId === area.id)
			: [];
	const areaIds = new Set(areas.map((a) => a.id));
	const projectIds = new Set(projects.map((p) => p.id));
	const todos = live(data.todos).filter(
		(t) =>
			(t.areaId && areaIds.has(t.areaId)) ||
			(t.projectId && projectIds.has(t.projectId)),
	);
	const inner = area.kind === "bucket" ? areas.length : 0;
	return {
		title:
			area.kind === "bucket"
				? `Delete Life Bucket ${quoted(area.title, "“New Life Bucket”")}?`
				: `Delete area ${quoted(area.title, "“New Area”")}?`,
		body: withContents([
			...(inner ? [count(inner, "area")] : []),
			...(projects.length ? [count(projects.length, "project")] : []),
			...(todos.length ? [count(todos.length, "task")] : []),
		]),
	};
}

export function tagRequest(tag: Tag, data: ViewData): DeleteRequest {
	const tagged =
		live(data.todos).filter((t) => t.tagIds.includes(tag.id)).length +
		live(data.projects).filter((p) => p.tagIds.includes(tag.id)).length;
	const nested = tagDescendants(live(data.tags), tag.id).size - 1;
	return {
		title: `Delete tag ${quoted(tag.title, "this tag")}?`,
		body: `${nested ? `${count(nested, "tag")} inside it ${nested === 1 ? "goes" : "go"} too. ` : ""}${tagged ? `It comes off ${count(tagged, "task or project", "tasks and projects")}; they stay. ` : ""}Tags don't go to Trash, so you can only undo this straight away.`,
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
	kind: "todo" | "project" | "area" | "tag",
	id: string,
	data: ViewData,
): DeleteRequest | null {
	if (kind === "tag") {
		const tag = data.tags.find((t) => t.id === id);
		return tag ? tagRequest(tag, data) : null;
	}
	if (kind === "todo") {
		const todo = data.todos.find((t) => t.id === id);
		return todo ? todosRequest([todo]) : null;
	}
	if (kind === "project") {
		const project = data.projects.find((p) => p.id === id);
		return project ? projectRequest(project, data) : null;
	}
	const area = [...data.areas, ...data.buckets].find((a) => a.id === id);
	return area ? areaRequest(area, data) : null;
}
