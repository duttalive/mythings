// Where a to-do can be moved: the Inbox, then each Life Bucket's areas and
// projects (with a project's headings under it). Used by the Move picker.

import { bySortKey, type ViewData } from "../../shared/views";

export type ListChoice =
	| { type: "inbox" }
	| { type: "project"; id: string }
	| { type: "area"; id: string }
	| { type: "heading"; id: string; projectId: string };

export type ListOption = {
	choice: ListChoice;
	title: string;
	kind: ListChoice["type"];
	/** 0 for the Inbox, areas and projects; 1 for a heading under its project. */
	depth: 0 | 1;
	/** The Life Bucket it's in (null for the Inbox and anything without one). */
	bucketId: string | null;
	/** Where it is, for search results: "Work" or "Work › Launch website". */
	path: string;
};

export type ListGroup = {
	bucket: { id: string; title: string } | null;
	options: ListOption[];
};

/** Destinations grouped by Life Bucket, in sidebar order. */
export function listGroups(
	data: Pick<ViewData, "areas" | "buckets" | "projects" | "headings">,
	{ headings = true }: { headings?: boolean } = {},
): ListGroup[] {
	const buckets = data.buckets
		.filter((b) => b.deletedAt === null)
		.sort(bySortKey);
	const live = new Set(buckets.map((b) => b.id));
	const areas = data.areas.filter((a) => a.deletedAt === null).sort(bySortKey);
	const projects = data.projects
		.filter(
			(p) => p.deletedAt === null && p.status === "open" && p.repeat === null,
		)
		.sort(bySortKey);
	const headingsOf = (projectId: string) =>
		headings
			? data.headings
					.filter(
						(h) =>
							h.projectId === projectId && h.deletedAt === null && !h.archived,
					)
					.sort(bySortKey)
			: [];

	const options = (
		bucketId: string | null,
		bucketTitle: string | null,
	): ListOption[] => {
		const inBucket = (id: string | null) =>
			bucketId === null ? !id || !live.has(id) : id === bucketId;
		const where = (...parts: (string | null)[]) =>
			parts.filter((p): p is string => !!p).join(" › ");
		return [
			...areas
				.filter((a) => inBucket(a.bucketId))
				.map(
					(a): ListOption => ({
						choice: { type: "area", id: a.id },
						title: a.title || "New Area",
						kind: "area",
						depth: 0,
						bucketId,
						path: where(bucketTitle),
					}),
				),
			...projects
				.filter((p) => inBucket(p.areaId))
				.flatMap((p): ListOption[] => {
					const title = p.title || "New Project";
					return [
						{
							choice: { type: "project", id: p.id },
							title,
							kind: "project",
							depth: 0,
							bucketId,
							path: where(bucketTitle),
						},
						...headingsOf(p.id).map(
							(h): ListOption => ({
								choice: { type: "heading", id: h.id, projectId: p.id },
								title: h.title || "New Heading",
								kind: "heading",
								depth: 1,
								bucketId,
								path: where(bucketTitle, title),
							}),
						),
					];
				}),
		];
	};

	const groups: ListGroup[] = [
		{
			bucket: null,
			options: [
				{
					choice: { type: "inbox" },
					title: "Inbox",
					kind: "inbox",
					depth: 0,
					bucketId: null,
					path: "",
				},
			],
		},
		...buckets.map((b) => {
			const title = b.title || "New Life Bucket";
			return { bucket: { id: b.id, title }, options: options(b.id, title) };
		}),
	];
	// Anything not (yet) in a live Life Bucket goes last, without a header.
	const loose = options(null, null);
	if (loose.length) groups.push({ bucket: null, options: loose });
	return groups.filter((g) => g.options.length > 0);
}

export function sameChoice(a: ListChoice | null | undefined, b: ListChoice) {
	return (
		!!a &&
		a.type === b.type &&
		("id" in a ? a.id : null) === ("id" in b ? b.id : null)
	);
}

/** Where a to-do is now, as a ListChoice (null when it's in no list, e.g. Anytime). */
export function choiceForTodo(todo: {
	when: string;
	projectId: string | null;
	headingId: string | null;
	areaId: string | null;
}): ListChoice | null {
	if (todo.headingId && todo.projectId)
		return { type: "heading", id: todo.headingId, projectId: todo.projectId };
	if (todo.projectId) return { type: "project", id: todo.projectId };
	if (todo.areaId) return { type: "area", id: todo.areaId };
	if (todo.when === "inbox") return { type: "inbox" };
	return null;
}

/** A list's name for buttons and toasts: "Inbox", "Admin", "Launch website › Design". */
export function choiceTitle(
	choice: ListChoice,
	data: Pick<ViewData, "areas" | "projects" | "headings">,
): string {
	switch (choice.type) {
		case "inbox":
			return "Inbox";
		case "area":
			return data.areas.find((a) => a.id === choice.id)?.title || "New Area";
		case "project":
			return (
				data.projects.find((p) => p.id === choice.id)?.title || "New Project"
			);
		case "heading": {
			const project =
				data.projects.find((p) => p.id === choice.projectId)?.title ||
				"New Project";
			const heading =
				data.headings.find((h) => h.id === choice.id)?.title || "New Heading";
			return `${project} › ${heading}`;
		}
	}
}
