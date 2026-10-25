// Export and import (SPEC §8, §10.9). An export is every row the user has,
// grouped by entity. Importing adds copies with fresh ids, so importing into
// the same account (or twice) never overwrites anything; tags are matched by
// title instead of duplicated. Trashed rows aren't imported.

import { z } from "zod";
import type { EntityName, EntityRowMap, Op } from "./schema";

export const EXPORT_FORMAT = "mythings-export";
export const EXPORT_VERSION = 1;

/** Entity names in the order an import must create them (referenced rows first). */
export const IMPORT_ORDER = [
	"tag",
	"area",
	"project",
	"heading",
	"todo",
	"checklist",
] as const satisfies readonly EntityName[];

export type ExportFile = {
	format: typeof EXPORT_FORMAT;
	version: typeof EXPORT_VERSION;
	exportedAt: string;
	data: { [E in EntityName]: EntityRowMap[E][] };
};

const rows = z.array(z.record(z.string(), z.unknown())).default([]);

/** The envelope only; each row is validated as an op when it's applied. */
export const exportFileSchema = z.object({
	format: z.literal(EXPORT_FORMAT),
	version: z.literal(EXPORT_VERSION),
	exportedAt: z.string().optional(),
	data: z.object({
		tag: rows,
		area: rows,
		project: rows,
		heading: rows,
		todo: rows,
		checklist: rows,
	}),
});

export type ImportFile = z.infer<typeof exportFileSchema>;

type Row = Record<string, unknown>;

/** Fields the server sets itself (or that a copy shouldn't carry over). */
const DROPPED = new Set(["id", "rev", "updatedAt"]);

/** Single references to other rows, and whether a dangling one drops the row. */
const REFS: Record<EntityName, [field: string, required: boolean][]> = {
	tag: [["parentId", false]],
	area: [],
	project: [
		["areaId", false],
		["repeatTemplateId", false],
	],
	heading: [["projectId", true]],
	todo: [
		["projectId", false],
		["headingId", false],
		["areaId", false],
		["repeatTemplateId", false],
	],
	checklist: [["todoId", true]],
};

const str = (value: unknown) => (typeof value === "string" ? value : null);

/** Parents before children, so a row's references exist when it's created. */
function byDepth(rows: Row[], parentField: string): Row[] {
	const byId = new Map(rows.map((row) => [str(row.id), row]));
	const depth = (row: Row, seen = new Set<Row>()): number => {
		const parent = byId.get(str(row[parentField]));
		if (!parent || seen.has(parent)) return 0;
		seen.add(row);
		return 1 + depth(parent, seen);
	};
	return [...rows].sort((a, b) => depth(a) - depth(b));
}

export type ImportPlan = {
	ops: Op[];
	/** Rows left out: trashed, or pointing at a row that isn't in the file. */
	skipped: number;
};

/**
 * Turns an export into upsert ops that create copies of its rows.
 * `existingTags` maps lower-cased titles of the user's live top-level tags to their ids.
 */
export function planImport(
	file: ImportFile,
	existingTags: Map<string, string>,
	newId: () => string,
	now: number,
): ImportPlan {
	const ids = new Map<string, string>();
	const ops: Op[] = [];
	let skipped = 0;

	for (const entity of IMPORT_ORDER) {
		let rows = file.data[entity].filter((row) => {
			if (row.deletedAt != null || !str(row.id)) {
				skipped++;
				return false;
			}
			return true;
		});
		if (entity === "tag") rows = byDepth(rows, "parentId");
		// Repeating templates before the instances that point at them.
		if (entity === "project" || entity === "todo")
			rows = [...rows].sort(
				(a, b) => Number(b.repeat != null) - Number(a.repeat != null),
			);

		for (const row of rows) {
			const oldId = str(row.id) as string;
			if (entity === "tag" && row.parentId == null) {
				const existing = existingTags.get(
					String(row.title).trim().toLowerCase(),
				);
				if (existing) {
					ids.set(oldId, existing);
					continue;
				}
			}

			const patch: Row = {};
			for (const [key, value] of Object.entries(row))
				if (!DROPPED.has(key)) patch[key] = value;

			let dangling = false;
			for (const [field, required] of REFS[entity]) {
				const ref = str(row[field]);
				if (ref === null) continue;
				const mapped = ids.get(ref);
				if (mapped && ids.has(ref)) {
					patch[field] = mapped;
				} else if (required) {
					dangling = true;
				} else {
					patch[field] = null;
				}
			}
			// A heading belongs to a project; without the project the to-do can't keep it.
			if (entity === "todo" && patch.projectId == null) patch.headingId = null;
			if (dangling) {
				skipped++;
				continue;
			}
			if (Array.isArray(row.tagIds)) {
				patch.tagIds = row.tagIds
					.map((id) => ids.get(String(id)))
					.filter((id): id is string => id !== undefined);
			}

			const id = newId();
			ids.set(oldId, id);
			ops.push({
				opId: newId(),
				entityId: id,
				clientTs: now,
				entity,
				kind: "upsert",
				patch,
			} as Op);
		}
	}
	return { ops, skipped };
}
