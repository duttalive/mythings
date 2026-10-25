import { ulid } from "ulid";
import { describe, expect, it } from "vitest";
import type { Area, Heading, Project, Todo } from "../../shared/schema";
import {
	canArchiveHeading,
	finishProjectMutations,
	newAreaFields,
	newHeadingFields,
	newProjectFields,
	newTodoUnderHeadingFields,
	openTodosIn,
} from "../../src/editing/projects";

const base = () => ({
	id: ulid(),
	createdAt: 0,
	updatedAt: 0,
	deletedAt: null,
	rev: 0,
});

function todo(overrides: Partial<Todo>): Todo {
	return {
		...base(),
		title: "",
		notes: "",
		status: "open",
		completedAt: null,
		projectId: null,
		headingId: null,
		areaId: null,
		when: "anytime",
		startDate: null,
		evening: false,
		deadline: null,
		reminderAt: null,
		sortKey: "a0",
		todaySortKey: null,
		tagIds: [],
		repeat: null,
		repeatTemplateId: null,
		...overrides,
	};
}

function project(overrides: Partial<Project> = {}): Project {
	return {
		...base(),
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
		...overrides,
	};
}

const heading = (
	overrides: Partial<Heading> & { projectId: string },
): Heading => ({
	...base(),
	title: "",
	sortKey: "a0",
	archived: false,
	...overrides,
});

const area = (overrides: Partial<Area> = {}): Area => ({
	...base(),
	title: "",
	sortKey: "a0",
	tagIds: [],
	...overrides,
});

const rule = {
	mode: "fixed",
	freq: "daily",
	interval: 1,
	nextDate: "2026-10-25",
} as const;

describe("finishing a project", () => {
	const p = project();
	const open = todo({ projectId: p.id });
	const done = todo({ projectId: p.id, status: "completed", completedAt: 1 });
	const deleted = todo({ projectId: p.id, deletedAt: 1 });
	const template = todo({ projectId: p.id, repeat: rule });
	const elsewhere = todo({});
	const todos = [open, done, deleted, template, elsewhere];

	it("finds only the open, live, non-template to-dos", () => {
		expect(openTodosIn(p.id, todos).map((t) => t.id)).toEqual([open.id]);
	});

	it("marks remaining to-dos the same way, then the project", () => {
		expect(finishProjectMutations(p, todos, "canceled")).toEqual([
			{
				type: "upsert",
				entity: "todo",
				id: open.id,
				patch: { status: "canceled" },
			},
			{
				type: "upsert",
				entity: "project",
				id: p.id,
				patch: { status: "canceled" },
			},
		]);
	});
});

describe("placing new lists", () => {
	it("puts a new project at the end of its area", () => {
		const a = area();
		const fields = newProjectFields(a.id, [
			project({ areaId: a.id, sortKey: "a3" }),
			project({ areaId: null, sortKey: "z0" }),
			project({ areaId: a.id, sortKey: "a9", deletedAt: 5 }),
		]);
		expect(fields).toMatchObject({ areaId: a.id, title: "", when: "anytime" });
		expect((fields.sortKey ?? "") > "a3" && (fields.sortKey ?? "") < "a9").toBe(
			true,
		);
	});

	it("puts a new area and heading last", () => {
		expect(
			(newAreaFields([area({ sortKey: "a5" })]).sortKey ?? "") > "a5",
		).toBe(true);
		const p = project();
		const fields = newHeadingFields(p.id, [
			heading({ projectId: p.id, sortKey: "a2" }),
		]);
		expect(fields.projectId).toBe(p.id);
		expect((fields.sortKey ?? "") > "a2").toBe(true);
	});

	it("puts a new to-do at the end of a heading", () => {
		const p = project();
		const h = heading({ projectId: p.id });
		const fields = newTodoUnderHeadingFields(h, [
			todo({ headingId: h.id, projectId: p.id, sortKey: "a7" }),
			todo({ projectId: p.id, sortKey: "b5" }),
		]);
		expect(fields).toMatchObject({
			projectId: p.id,
			headingId: h.id,
			when: "anytime",
		});
		expect((fields.sortKey ?? "") > "a7").toBe(true);
	});
});

describe("archiving headings", () => {
	it("is allowed once nothing under the heading is open", () => {
		const p = project();
		const h = heading({ projectId: p.id });
		expect(
			canArchiveHeading(h.id, [todo({ headingId: h.id, projectId: p.id })]),
		).toBe(false);
		expect(
			canArchiveHeading(h.id, [
				todo({
					headingId: h.id,
					projectId: p.id,
					status: "completed",
					completedAt: 1,
				}),
				todo({ headingId: h.id, projectId: p.id, deletedAt: 1 }),
			]),
		).toBe(true);
	});
});
