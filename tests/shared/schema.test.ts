import { ulid } from "ulid";
import { describe, expect, it } from "vitest";
import {
	clientMessageSchema,
	entities,
	localDateSchema,
	MAX_OPS_PER_PUSH,
	opSchema,
	projectSchema,
	type Todo,
	todoSchema,
} from "../../shared/schema";
import {
	area,
	done,
	heading,
	project,
	rule,
	scheduled,
	tag,
	todo,
} from "./fixtures";

describe("fixtures", () => {
	it("are valid rows", () => {
		const p = project();
		expect(todoSchema.safeParse(todo()).success).toBe(true);
		expect(projectSchema.safeParse(p).success).toBe(true);
		expect(entities.area.row.safeParse(area()).success).toBe(true);
		expect(
			entities.heading.row.safeParse(heading({ projectId: p.id })).success,
		).toBe(true);
		expect(entities.tag.row.safeParse(tag()).success).toBe(true);
	});
});

describe("todo invariants", () => {
	const projectId = ulid();
	const invalid: [string, Partial<Todo>][] = [
		["scheduled without startDate", { when: "scheduled", startDate: null }],
		[
			"startDate without scheduled",
			{ when: "anytime", startDate: "2026-10-25" },
		],
		["evening when not scheduled", { evening: true }],
		["completed without completedAt", { status: "completed" }],
		["completedAt while open", { completedAt: 1 }],
		["heading without project", { headingId: ulid() }],
		["both project and area", { projectId, areaId: ulid() }],
		["inbox inside a project", { when: "inbox", projectId }],
		["completed repeat template", { repeat: rule(), ...done() }],
		[
			"template that is also an instance",
			{ repeat: rule(), repeatTemplateId: ulid() },
		],
		["impossible date", { deadline: "2026-02-30" }],
		["duplicate tags", { tagIds: [projectId, projectId] }],
		["non-ULID id", { id: "abc" }],
	];
	it.each(invalid)("rejects %s", (_, overrides) => {
		expect(todoSchema.safeParse(todo(overrides)).success).toBe(false);
	});

	it("accepts a scheduled evening to-do in a project heading", () => {
		const p = project();
		const h = heading({ projectId: p.id });
		expect(
			todoSchema.safeParse(
				todo({
					...scheduled("2026-10-25"),
					evening: true,
					projectId: p.id,
					headingId: h.id,
				}),
			).success,
		).toBe(true);
	});

	it("doesn't allow projects in the inbox", () => {
		expect(projectSchema.safeParse(project({ when: "inbox" })).success).toBe(
			false,
		);
	});

	it("rejects a tag that is its own parent", () => {
		const t = tag();
		expect(entities.tag.row.safeParse({ ...t, parentId: t.id }).success).toBe(
			false,
		);
	});
});

describe("patches", () => {
	it("accept partial fields", () => {
		expect(entities.todo.patch.safeParse({ title: "New title" }).success).toBe(
			true,
		);
		expect(entities.todo.patch.safeParse({ deletedAt: null }).success).toBe(
			true,
		);
	});

	it("reject server-owned and unknown fields", () => {
		for (const patch of [
			{ id: ulid() },
			{ rev: 3 },
			{ updatedAt: 1 },
			{ archived: true },
		]) {
			expect(entities.todo.patch.safeParse(patch).success).toBe(false);
		}
	});
});

describe("ops", () => {
	const op = { opId: ulid(), entityId: ulid(), clientTs: Date.now() };

	it("validate the patch against the op's entity", () => {
		expect(
			opSchema.safeParse({
				...op,
				entity: "todo",
				kind: "upsert",
				patch: { title: "x" },
			}).success,
		).toBe(true);
		expect(
			opSchema.safeParse({
				...op,
				entity: "heading",
				kind: "upsert",
				patch: { archived: true },
			}).success,
		).toBe(true);
		expect(
			opSchema.safeParse({
				...op,
				entity: "todo",
				kind: "upsert",
				patch: { archived: true },
			}).success,
		).toBe(false);
	});

	it("support delete and purge without a patch", () => {
		expect(
			opSchema.safeParse({ ...op, entity: "project", kind: "delete" }).success,
		).toBe(true);
		expect(
			opSchema.safeParse({ ...op, entity: "project", kind: "purge" }).success,
		).toBe(true);
		expect(
			opSchema.safeParse({ ...op, entity: "widget", kind: "delete" }).success,
		).toBe(false);
	});

	it("limit push batches", () => {
		const ops = Array.from({ length: MAX_OPS_PER_PUSH + 1 }, () => ({
			...op,
			opId: ulid(),
			entity: "todo",
			kind: "delete",
		}));
		expect(clientMessageSchema.safeParse({ type: "push", ops }).success).toBe(
			false,
		);
		expect(
			clientMessageSchema.safeParse({ type: "push", ops: ops.slice(1) })
				.success,
		).toBe(true);
		expect(
			clientMessageSchema.safeParse({
				type: "hello",
				lastRev: 0,
				tz: "Europe/Berlin",
			}).success,
		).toBe(true);
	});
});

describe("localDateSchema", () => {
	it("accepts real dates only", () => {
		expect(localDateSchema.safeParse("2024-02-29").success).toBe(true);
		expect(localDateSchema.safeParse("2026-02-29").success).toBe(false);
	});
});
