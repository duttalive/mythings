// Life Buckets (2.2.0, SPEC §5.2). Before them, an area could hold projects
// and its own to-dos. Now a Life Bucket holds areas and projects, and an area
// holds only to-dos. This turns rows in the old shape into the new one without
// losing anything:
//
// - An area that holds projects becomes a Life Bucket (same id, title and
//   tags, so its projects stay put). If it also had its own to-dos, they move
//   into a new area of the same name inside it.
// - Any other area, and any project outside an area, goes into a "Personal"
//   bucket (created only when needed; a new account gets one with its first
//   area or project).
//
// Titles are copied as they are, so encrypted ones stay readable: an area's
// title and a new area's title are encrypted for the same field.

import { generateKeyBetween } from "fractional-indexing";

export const DEFAULT_BUCKET_TITLE = "Personal";

type Row = Record<string, unknown> & { id: string };

export type RestructureInput = {
	areas: Row[];
	projects: Row[];
	todos: Row[];
};

export type Restructure = {
	/** Field changes for existing rows, by id. */
	areas: Map<string, Record<string, unknown>>;
	projects: Map<string, Record<string, unknown>>;
	todos: Map<string, Record<string, unknown>>;
	/** New area rows (buckets and areas) to create, with every field set. */
	created: Row[];
};

const str = (value: unknown) => (typeof value === "string" ? value : null);

function keyAfter(keys: unknown[]): string {
	const valid = keys
		.filter((k): k is string => typeof k === "string")
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	try {
		return generateKeyBetween(valid.at(-1) ?? null, null);
	} catch {
		return "a0";
	}
}

/** A "Personal" Life Bucket, for areas and projects that have no other. */
export function defaultBucket(id: string, now: number, sortKey = "a0") {
	return {
		id,
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
		rev: 0,
		title: DEFAULT_BUCKET_TITLE,
		sortKey,
		tagIds: [] as string[],
		collapsed: false,
		kind: "bucket" as const,
		bucketId: null,
	};
}

/**
 * Plans the change from the old shape. Every input row is treated as old
 * (whatever its `kind`), so run it once per account, or on an old export.
 * With `createDefault` false, rows that need a bucket keep none (the server
 * then puts them into the first one).
 */
export function restructure(
	input: RestructureInput,
	options: { newId: () => string; now: number; createDefault: boolean },
): Restructure {
	const out: Restructure = {
		areas: new Map(),
		projects: new Map(),
		todos: new Map(),
		created: [],
	};
	const areaIds = new Set(input.areas.map((a) => a.id));
	const holders = new Set(
		input.projects
			.map((p) => str(p.areaId))
			.filter((id): id is string => id !== null && areaIds.has(id)),
	);
	const buckets = input.areas.filter((a) => holders.has(a.id));
	const plain = input.areas.filter((a) => !holders.has(a.id));
	const orphans = input.projects.filter((p) => {
		const areaId = str(p.areaId);
		return areaId === null || !areaIds.has(areaId);
	});

	for (const bucket of buckets) {
		out.areas.set(bucket.id, { kind: "bucket", bucketId: null });
		const own = input.todos.filter(
			(t) => t.areaId === bucket.id && t.projectId == null,
		);
		if (own.length === 0) continue;
		const area: Row = {
			id: options.newId(),
			createdAt: options.now,
			updatedAt: options.now,
			deletedAt: bucket.deletedAt ?? null,
			rev: 0,
			title: bucket.title ?? "",
			sortKey: "a0",
			tagIds: [],
			collapsed: false,
			kind: "area",
			bucketId: bucket.id,
		};
		out.created.push(area);
		for (const todo of own) out.todos.set(todo.id, { areaId: area.id });
	}

	let defaultId: string | null = null;
	if ((plain.length > 0 || orphans.length > 0) && options.createDefault) {
		// After the buckets made from areas, which keep their order.
		const bucket = defaultBucket(
			options.newId(),
			options.now,
			keyAfter(buckets.map((b) => b.sortKey)),
		);
		defaultId = bucket.id;
		out.created.push(bucket);
	}
	for (const area of plain)
		out.areas.set(area.id, { kind: "area", bucketId: defaultId });
	for (const project of orphans)
		out.projects.set(project.id, { areaId: defaultId });
	return out;
}
