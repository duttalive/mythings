import { describe, expect, it } from "vitest";
import { DEFAULT_BUCKET_TITLE, restructure } from "../../shared/structure";
import { area, project, todo } from "./fixtures";

let n = 0;
const newId = () => `NEW${++n}`;
const run = (input: Parameters<typeof restructure>[0], createDefault = true) =>
	restructure(input, { newId, now: 1, createDefault });

describe("restructure (to Life Buckets)", () => {
	it("turns an area with projects into a bucket, moving its own to-dos into a same-named area", () => {
		const work = area({ title: "Work", tagIds: ["T"] });
		const launch = project({ areaId: work.id });
		const own = todo({ areaId: work.id });
		const inProject = todo({ projectId: launch.id });
		const plan = run({
			areas: [work],
			projects: [launch],
			todos: [own, inProject],
		});

		expect(plan.areas.get(work.id)).toEqual({ kind: "bucket", bucketId: null });
		expect(plan.projects.has(launch.id)).toBe(false);
		const [inner] = plan.created;
		expect(inner).toMatchObject({
			kind: "area",
			bucketId: work.id,
			title: "Work",
			deletedAt: null,
		});
		expect(plan.todos.get(own.id)).toEqual({ areaId: inner?.id });
		expect(plan.todos.has(inProject.id)).toBe(false);
		// Nothing else needed a bucket, so no "Personal" one.
		expect(plan.created).toHaveLength(1);
	});

	it("puts other areas and loose projects into a new Personal bucket, after the others", () => {
		const work = area({ title: "Work", sortKey: "a5" });
		const home = area({ title: "Home" });
		const inWork = project({ areaId: work.id });
		const solo = project();
		const plan = run({
			areas: [work, home],
			projects: [inWork, solo],
			todos: [],
		});
		const personal = plan.created.find((r) => r.kind === "bucket");
		expect(personal).toMatchObject({
			title: DEFAULT_BUCKET_TITLE,
			bucketId: null,
		});
		expect((personal?.sortKey as string) > "a5").toBe(true);
		expect(plan.areas.get(home.id)).toEqual({
			kind: "area",
			bucketId: personal?.id,
		});
		expect(plan.projects.get(solo.id)).toEqual({ areaId: personal?.id });
	});

	it("keeps a deleted bucket's new area deleted with it, so they're restored together", () => {
		const gone = area({ deletedAt: 9 });
		const plan = run({
			areas: [gone],
			projects: [project({ areaId: gone.id, deletedAt: 9 })],
			todos: [todo({ areaId: gone.id, deletedAt: 9 })],
		});
		expect(plan.created[0]).toMatchObject({ kind: "area", deletedAt: 9 });
	});

	it("creates nothing for an empty account, and leaves buckets unset when told not to create one", () => {
		expect(run({ areas: [], projects: [], todos: [] }).created).toEqual([]);
		const home = area();
		const plan = run(
			{ areas: [home], projects: [project()], todos: [] },
			false,
		);
		expect(plan.created).toEqual([]);
		expect(plan.areas.get(home.id)).toEqual({ kind: "area", bucketId: null });
	});
});
