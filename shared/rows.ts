// Building rows from patches. Used by both the server (authoritative apply) and
// the client (optimistic local apply), so the two always agree.

import type { EntityName, EntityRowMap } from "./schema";

/** Loosely-typed view of a row for generic field access. */
export type Fields = Record<string, unknown> & {
	id: string;
	deletedAt: number | null;
};

export const DEFAULTS: {
	[E in EntityName]: Omit<
		EntityRowMap[E],
		"id" | "createdAt" | "updatedAt" | "rev"
	>;
} = {
	area: { deletedAt: null, title: "", sortKey: "a0", tagIds: [] },
	project: {
		deletedAt: null,
		title: "",
		notes: "",
		areaId: null,
		status: "open",
		completedAt: null,
		when: "anytime",
		startDate: null,
		evening: false,
		deadline: null,
		sortKey: "a0",
		todaySortKey: null,
		tagIds: [],
		repeat: null,
		repeatTemplateId: null,
	},
	// projectId and todoId have no sensible default; validation rejects creates without them.
	heading: {
		deletedAt: null,
		projectId: "",
		title: "",
		sortKey: "a0",
		archived: false,
	},
	todo: {
		deletedAt: null,
		title: "",
		notes: "",
		status: "open",
		completedAt: null,
		projectId: null,
		headingId: null,
		areaId: null,
		when: "inbox",
		startDate: null,
		evening: false,
		deadline: null,
		reminderAt: null,
		sortKey: "a0",
		todaySortKey: null,
		tagIds: [],
		repeat: null,
		repeatTemplateId: null,
	},
	checklist: {
		deletedAt: null,
		todoId: "",
		title: "",
		done: false,
		sortKey: "a0",
	},
	tag: {
		deletedAt: null,
		title: "",
		parentId: null,
		shortcut: null,
		sortKey: "a0",
	},
};

/**
 * Merges a patch onto the existing row (or defaults, for a create) and
 * normalizes it. The result still needs validating against the row schema.
 *
 * `headingProject` looks up a heading's projectId; it's only consulted for
 * to-dos whose heading is set or changes.
 */
export function buildRow(
	entity: EntityName,
	id: string,
	existing: Fields | null,
	patch: Record<string, unknown>,
	clientTs: number,
	now: number,
	headingProject: (headingId: string) => string | undefined,
): Fields {
	const row: Fields = existing
		? { ...existing, ...patch }
		: { ...DEFAULTS[entity], createdAt: clientTs, ...patch, id, rev: 0 };
	row.updatedAt = now;
	if (entity === "todo" || entity === "project")
		normalizeSchedule(row, patch, clientTs);
	if (entity === "todo")
		normalizeTodoContainer(row, existing, patch, headingProject);
	return row;
}

/** Keeps when/startDate/evening and status/completedAt consistent with what the patch changed. */
function normalizeSchedule(
	row: Fields,
	patch: Record<string, unknown>,
	clientTs: number,
) {
	if ("status" in patch) {
		if (row.status === "open") row.completedAt = null;
		else row.completedAt ??= clientTs;
	}
	if ("when" in patch && row.when !== "scheduled") {
		row.startDate = null;
		row.evening = false;
	} else if ("startDate" in patch && !("when" in patch)) {
		if (row.startDate !== null) row.when = "scheduled";
		else if (row.when === "scheduled") {
			row.when = "anytime";
			row.evening = false;
		}
	}
}

/** Moving a to-do between Inbox, areas, projects and headings clears the containers it left. */
function normalizeTodoContainer(
	row: Fields,
	existing: Fields | null,
	patch: Record<string, unknown>,
	headingProject: (headingId: string) => string | undefined,
) {
	const sets = (field: string) => field in patch && patch[field] !== null;
	const movesContainer =
		sets("projectId") || sets("areaId") || sets("headingId");

	if (patch.when === "inbox" && !movesContainer) {
		row.projectId = null;
		row.headingId = null;
		row.areaId = null;
	}
	if (sets("headingId") && !("projectId" in patch)) {
		const projectId = headingProject(patch.headingId as string);
		if (projectId) row.projectId = projectId;
	}
	if ((sets("projectId") || sets("headingId")) && !("areaId" in patch)) {
		row.areaId = null;
	}
	if (sets("areaId") && !("projectId" in patch)) {
		row.projectId = null;
		row.headingId = null;
	}
	if (
		row.headingId &&
		existing?.projectId !== row.projectId &&
		!("headingId" in patch)
	) {
		if (headingProject(row.headingId as string) !== row.projectId)
			row.headingId = null;
	}
	if (
		(row.projectId || row.areaId) &&
		row.when === "inbox" &&
		!("when" in patch)
	) {
		row.when = "anytime";
	}
}
