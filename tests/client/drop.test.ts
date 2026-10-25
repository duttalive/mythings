import { ulid } from "ulid";
import { describe, expect, it } from "vitest";
import type { Project, Todo } from "../../shared/schema";
import type { ViewContext, ViewData } from "../../shared/views";
import { sidebarDropMutations } from "../../src/dnd/drop";

const TODAY = "2026-10-25";
const ctx: ViewContext = { today: TODAY, tz: "UTC" };
const base = () => ({
	id: ulid(),
	createdAt: 0,
	updatedAt: 0,
	deletedAt: null,
	rev: 0,
});

const todo = (o: Partial<Todo> = {}): Todo => ({
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
	...o,
});

const project = (o: Partial<Project> = {}): Project => ({
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
	...o,
});

const data = (parts: Partial<ViewData>): ViewData => ({
	areas: [],
	projects: [],
	headings: [],
	todos: [],
	tags: [],
	...parts,
});

const patchOf = (
	mutations: ReturnType<typeof sidebarDropMutations>,
	id: string,
) => {
	const m = mutations?.find((x) => x.id === id);
	return m?.type === "upsert" ? m.patch : undefined;
};

describe("dropping a to-do on the sidebar", () => {
	it("schedules it at the top of Today", () => {
		const first = todo({
			when: "scheduled",
			startDate: TODAY,
			todaySortKey: "a1",
		});
		const dragged = todo({ when: "inbox" });
		const mutations = sidebarDropMutations(
			"todo",
			dragged.id,
			{ type: "today" },
			data({ todos: [first, dragged] }),
			ctx,
		);
		const patch = patchOf(mutations, dragged.id);
		expect(patch).toMatchObject({
			when: "scheduled",
			startDate: TODAY,
			evening: false,
		});
		expect((patch?.todaySortKey as string) < "a1").toBe(true);
	});

	it("goes to the top of Today even ahead of unplaced items (by numbering them)", () => {
		const unplaced = todo({ when: "scheduled", startDate: TODAY });
		const dragged = todo();
		const mutations = sidebarDropMutations(
			"todo",
			dragged.id,
			{ type: "today" },
			data({ todos: [unplaced, dragged] }),
			ctx,
		);
		const draggedKey = patchOf(mutations, dragged.id)?.todaySortKey as string;
		const otherKey = patchOf(mutations, unplaced.id)?.todaySortKey as string;
		expect(draggedKey < otherKey).toBe(true);
	});

	it("moves it to the end of a project or area", () => {
		const p = project();
		const inProject = todo({ projectId: p.id, sortKey: "a5" });
		const dragged = todo();
		const patch = patchOf(
			sidebarDropMutations(
				"todo",
				dragged.id,
				{ type: "project", id: p.id },
				data({ todos: [inProject, dragged], projects: [p] }),
				ctx,
			),
			dragged.id,
		);
		expect(patch).toMatchObject({ projectId: p.id, headingId: null });
		expect((patch?.sortKey as string) > "a5").toBe(true);

		const areaPatch = patchOf(
			sidebarDropMutations(
				"todo",
				dragged.id,
				{ type: "area", id: "AREA" },
				data({}),
				ctx,
			),
			dragged.id,
		);
		expect(areaPatch).toMatchObject({
			areaId: "AREA",
			projectId: null,
			headingId: null,
		});
	});

	it("handles Inbox, Anytime, Someday, Logbook and Trash", () => {
		const d = data({});
		expect(
			patchOf(
				sidebarDropMutations("todo", "T", { type: "inbox" }, d, ctx),
				"T",
			),
		).toMatchObject({ when: "inbox" });
		expect(
			patchOf(
				sidebarDropMutations("todo", "T", { type: "anytime" }, d, ctx),
				"T",
			),
		).toEqual({ when: "anytime" });
		expect(
			patchOf(
				sidebarDropMutations("todo", "T", { type: "someday" }, d, ctx),
				"T",
			),
		).toEqual({ when: "someday" });
		expect(
			patchOf(
				sidebarDropMutations("todo", "T", { type: "logbook" }, d, ctx),
				"T",
			),
		).toEqual({ status: "completed" });
		expect(
			sidebarDropMutations("todo", "T", { type: "trash" }, d, ctx),
		).toEqual([{ type: "delete", entity: "todo", id: "T" }]);
	});
});

describe("dropping a project on the sidebar", () => {
	it("moves it into an area, last", () => {
		const sibling = project({ areaId: "AREA", sortKey: "a3" });
		const dragged = project();
		const patch = patchOf(
			sidebarDropMutations(
				"project",
				dragged.id,
				{ type: "area", id: "AREA" },
				data({ projects: [sibling, dragged] }),
				ctx,
			),
			dragged.id,
		);
		expect(patch?.areaId).toBe("AREA");
		expect((patch?.sortKey as string) > "a3").toBe(true);
	});

	it("refuses targets that don't make sense", () => {
		expect(
			sidebarDropMutations("project", "P", { type: "inbox" }, data({}), ctx),
		).toBeNull();
		expect(
			sidebarDropMutations("project", "P", { type: "logbook" }, data({}), ctx),
		).toBeNull();
		expect(
			sidebarDropMutations(
				"project",
				"P",
				{ type: "project", id: "Q" },
				data({}),
				ctx,
			),
		).toBeNull();
		expect(
			sidebarDropMutations("area", "A", { type: "today" }, data({}), ctx),
		).toBeNull();
	});

	it("can be trashed", () => {
		expect(
			sidebarDropMutations("area", "A", { type: "trash" }, data({}), ctx),
		).toEqual([{ type: "delete", entity: "area", id: "A" }]);
	});
});
