import { describe, expect, it } from "vitest";
import type { ViewContext } from "../../shared/views";
import { moveTodoMutations } from "../../src/dnd/drop";
import {
	choiceForTodo,
	choiceTitle,
	listGroups,
} from "../../src/editing/listOptions";
import { area, bucket, data, heading, project, todo } from "../shared/fixtures";

const ctx: ViewContext = { today: "2026-11-23", tz: "UTC" };

describe("Move destinations", () => {
	it("groups areas, projects and their headings under each Life Bucket, in order", () => {
		const work = bucket({ title: "Work", sortKey: "a1" });
		const home = bucket({ title: "Home", sortKey: "a0" });
		const admin = area({ title: "Admin", bucketId: work.id });
		const launch = project({ title: "Launch", areaId: work.id });
		const design = heading({ projectId: launch.id, title: "Design" });
		const old = heading({
			projectId: launch.id,
			title: "Old",
			archived: true,
		});
		const done = project({ areaId: work.id, status: "completed" });
		const chores = area({ title: "Chores", bucketId: home.id });
		const d = data({
			buckets: [work, home],
			areas: [admin, chores],
			projects: [launch, done],
			headings: [design, old],
		});

		const groups = listGroups(d);
		expect(groups.map((g) => g.bucket?.title ?? null)).toEqual([
			null,
			"Home",
			"Work",
		]);
		expect(groups[2]?.options.map((o) => [o.title, o.depth, o.path])).toEqual([
			["Admin", 0, "Work"],
			["Launch", 0, "Work"],
			["Design", 1, "Work › Launch"],
		]);
		expect(listGroups(d, { headings: false })[2]?.options).toHaveLength(2);
		expect(
			choiceTitle({ type: "heading", id: design.id, projectId: launch.id }, d),
		).toBe("Launch › Design");
	});

	it("knows where a to-do is now", () => {
		expect(choiceForTodo(todo({ when: "inbox" }))).toEqual({ type: "inbox" });
		expect(choiceForTodo(todo({ when: "anytime" }))).toBeNull();
		const t = todo({ projectId: "P", headingId: "H" });
		expect(choiceForTodo(t)).toEqual({
			type: "heading",
			id: "H",
			projectId: "P",
		});
	});

	it("moves a to-do to the end of a heading in another project", () => {
		const launch = project();
		const design = heading({ projectId: launch.id });
		const there = todo({
			projectId: launch.id,
			headingId: design.id,
			sortKey: "a5",
		});
		const moving = todo({ areaId: "A" });
		const d = data({
			projects: [launch],
			headings: [design],
			todos: [there, moving],
		});
		const [m] =
			moveTodoMutations(
				moving.id,
				{ type: "heading", id: design.id, projectId: launch.id },
				d,
				ctx,
			) ?? [];
		expect(m).toMatchObject({
			type: "upsert",
			entity: "todo",
			id: moving.id,
			patch: { projectId: launch.id, headingId: design.id, areaId: null },
		});
		const sortKey = m?.type === "upsert" ? String(m.patch.sortKey) : "";
		expect(sortKey > "a5").toBe(true);
	});
});
