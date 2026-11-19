import { env, runInDurableObject } from "cloudflare:test";
import { ulid } from "ulid";
import { describe, expect, it } from "vitest";
import type { Area, Project, Todo } from "../../shared/schema";
import { convertToLifeBuckets } from "../../worker/life-buckets";
import { Store } from "../../worker/store";

const base = (id: string) => ({
	id,
	createdAt: 1,
	updatedAt: 1,
	deletedAt: null,
	rev: 1,
});

describe("converting an account to Life Buckets", () => {
	it("converts data from before buckets once, keeping every row and id", async () => {
		const stub = env.USER_STORE.getByName(`legacy-${ulid()}`);
		const [work, home, launch, solo, own, inLaunch, chore] = Array.from(
			{ length: 7 },
			() => ulid(),
		) as [string, string, string, string, string, string, string];

		const result = await runInDurableObject(stub, (_, state) => {
			const sql = state.storage.sql;
			const store = new Store(sql);
			// Rows as an older version stored them (no kind or bucket).
			const area = (id: string, title: string) =>
				store.put("area", {
					...base(id),
					title,
					sortKey: "a0",
					tagIds: [],
					collapsed: false,
				} as unknown as Area);
			area(work, "Work");
			area(home, "Home");
			const project = (id: string, areaId: string | null) =>
				store.put("project", {
					...base(id),
					title: "P",
					notes: "",
					areaId,
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
				} as Project);
			project(launch, work);
			project(solo, null);
			const todo = (id: string, fields: Partial<Todo>) =>
				store.put("todo", {
					...base(id),
					title: "T",
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
					...fields,
				} as Todo);
			todo(own, { areaId: work });
			todo(inLaunch, { projectId: launch });
			todo(chore, { areaId: home });

			sql.exec("DELETE FROM meta WHERE key = 'life_buckets'");
			const revBefore = store.rev;
			const converted = convertToLifeBuckets(store);
			return {
				converted,
				again: convertToLifeBuckets(store),
				revBefore,
				areas: store.where("area", "1 = 1"),
				projects: store.where("project", "1 = 1"),
				todos: store.where("todo", "1 = 1"),
			};
		});

		expect(result.converted).toBe(true);
		expect(result.again).toBe(false);
		const areaById = new Map(result.areas.map((a) => [a.id, a]));
		// "Work" held a project: it's now a Life Bucket, same id and title.
		expect(areaById.get(work)).toMatchObject({
			kind: "bucket",
			bucketId: null,
			title: "Work",
		});
		const personal = result.areas.find(
			(a) => a.kind === "bucket" && a.title === "Personal",
		);
		expect(personal).toBeDefined();
		// "Home" had none: it stays an area, in Personal.
		expect(areaById.get(home)).toMatchObject({
			kind: "area",
			bucketId: personal?.id,
		});
		// Work's own to-do moved into a new "Work" area inside the bucket.
		const workArea = result.areas.find(
			(a) => a.kind === "area" && a.title === "Work",
		);
		expect(workArea?.bucketId).toBe(work);
		const todoById = new Map(result.todos.map((t) => [t.id, t]));
		expect(todoById.get(own)?.areaId).toBe(workArea?.id);
		expect(todoById.get(inLaunch)?.projectId).toBe(launch);
		expect(todoById.get(chore)?.areaId).toBe(home);
		const projectById = new Map(result.projects.map((p) => [p.id, p]));
		expect(projectById.get(launch)?.areaId).toBe(work);
		expect(projectById.get(solo)?.areaId).toBe(personal?.id);
		// Changed rows get new revs, so devices pick them up.
		expect(areaById.get(home)?.rev).toBeGreaterThan(result.revBefore);
		expect(result.todos).toHaveLength(3);
		expect(result.projects).toHaveLength(2);
	});
});
