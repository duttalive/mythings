import { ulid } from "ulid";
import { describe, expect, it } from "vitest";
import type { Op } from "../../shared/schema";
import {
	EXPORT_FORMAT,
	EXPORT_VERSION,
	exportFileSchema,
	type ImportFile,
	planImport,
} from "../../shared/transfer";
import { area, heading, project, tag, todo } from "./fixtures";

function file(data: Partial<ImportFile["data"]>): ImportFile {
	return exportFileSchema.parse({
		format: EXPORT_FORMAT,
		version: EXPORT_VERSION,
		data,
	});
}

const patchOf = (ops: Op[], title: string) => {
	const op = ops.find(
		(o) =>
			o.kind === "upsert" && (o.patch as { title?: string }).title === title,
	);
	if (op?.kind !== "upsert") throw new Error(`no op for ${title}`);
	return { id: op.entityId, patch: op.patch as Record<string, unknown> };
};

describe("planImport", () => {
	it("gives every row a fresh id and points references at the copies", () => {
		const a = area({ title: "Home" });
		const p = project({ title: "Move", areaId: a.id });
		const h = heading({ title: "Packing", projectId: p.id });
		const t = tag({ title: "errands" });
		const td = todo({
			title: "Boxes",
			projectId: p.id,
			headingId: h.id,
			tagIds: [t.id],
		});
		const { ops, skipped } = planImport(
			file({ area: [a], project: [p], heading: [h], tag: [t], todo: [td] }),
			new Map(),
			ulid,
			1,
		);
		expect(skipped).toBe(0);
		expect(ops.map((o) => o.entity)).toEqual([
			"tag",
			"area",
			"project",
			"heading",
			"todo",
		]);
		const copies = Object.fromEntries(
			["Home", "Move", "Packing", "errands", "Boxes"].map((title) => [
				title,
				patchOf(ops, title),
			]),
		);
		for (const { id } of Object.values(copies))
			expect([a.id, p.id, h.id, t.id, td.id]).not.toContain(id);
		expect(copies.Move?.patch.areaId).toBe(copies.Home?.id);
		expect(copies.Boxes?.patch).toMatchObject({
			projectId: copies.Move?.id,
			headingId: copies.Packing?.id,
			tagIds: [copies.errands?.id],
		});
		expect(copies.Boxes?.patch).not.toHaveProperty("rev");
		expect(copies.Boxes?.patch).not.toHaveProperty("id");
	});

	it("reuses existing top-level tags with the same title", () => {
		const t = tag({ title: "Errands " });
		const td = todo({ title: "Milk", tagIds: [t.id] });
		const { ops } = planImport(
			file({ tag: [t], todo: [td] }),
			new Map([["errands", "EXISTING"]]),
			ulid,
			1,
		);
		expect(ops.map((o) => o.entity)).toEqual(["todo"]);
		expect(patchOf(ops, "Milk").patch.tagIds).toEqual(["EXISTING"]);
	});

	it("creates parent tags before their children", () => {
		const parent = tag({ title: "work" });
		const child = tag({ title: "calls", parentId: parent.id });
		const { ops } = planImport(
			file({ tag: [child, parent] }),
			new Map(),
			ulid,
			1,
		);
		expect(patchOf(ops, "calls").patch.parentId).toBe(patchOf(ops, "work").id);
		expect(ops[0]?.entityId).toBe(patchOf(ops, "work").id);
	});

	it("leaves out trashed rows and what can't exist without them", () => {
		const p = project({ title: "Gone", deletedAt: 5 });
		const h = heading({ title: "Orphan heading", projectId: p.id });
		const td = todo({ title: "Kept", projectId: p.id, headingId: h.id });
		const trashed = todo({ title: "Trashed", deletedAt: 5 });
		const { ops, skipped } = planImport(
			file({ project: [p], heading: [h], todo: [td, trashed] }),
			new Map(),
			ulid,
			1,
		);
		expect(skipped).toBe(3);
		expect(
			ops.map((o) => (o.kind === "upsert" ? o.patch.title : null)),
		).toEqual(["Kept"]);
		// Without its project the to-do can't keep the heading either.
		expect(patchOf(ops, "Kept").patch).toMatchObject({
			projectId: null,
			headingId: null,
		});
	});

	it("creates repeat templates before their instances", () => {
		const template = todo({
			title: "Template",
			when: "anytime",
			repeat: {
				mode: "fixed",
				freq: "daily",
				interval: 1,
				nextDate: "2026-10-26",
			},
		});
		const instance = todo({ title: "Instance", repeatTemplateId: template.id });
		const { ops } = planImport(
			file({ todo: [instance, template] }),
			new Map(),
			ulid,
			1,
		);
		expect(patchOf(ops, "Instance").patch.repeatTemplateId).toBe(
			patchOf(ops, "Template").id,
		);
		expect(ops[0]?.entityId).toBe(patchOf(ops, "Template").id);
	});

	it("rejects other files", () => {
		expect(exportFileSchema.safeParse({ format: "things" }).success).toBe(
			false,
		);
	});
});
