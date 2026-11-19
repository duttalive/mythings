import { describe, expect, it } from "vitest";
import type { Tag } from "../../shared/schema";
import {
	canMoveTag,
	tagDescendants,
	tagMoveMutations,
	tagZone,
} from "../../src/dnd/tagMoves";
import type { Mutation } from "../../src/sync/engine";
import { tag } from "../shared/fixtures";

/** Applies upsert patches to a copy of the tags, as the engine would. */
function apply(tags: Tag[], mutations: Mutation[] | null): Tag[] {
	const out = tags.map((t) => ({ ...t }));
	for (const m of mutations ?? []) {
		if (m.type !== "upsert") continue;
		const row = out.find((t) => t.id === m.id);
		if (row) Object.assign(row, m.patch);
	}
	return out;
}

/** Titles under `parentId` in sidebar order. */
const order = (tags: Tag[], parentId: string | null) =>
	tags
		.filter((t) => t.parentId === parentId && t.deletedAt === null)
		.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1))
		.map((t) => t.title);

describe("tagZone", () => {
	it("reorders near the edges and nests in the middle", () => {
		const rect = { top: 100, height: 40 };
		expect(tagZone(102, rect)).toBe("before");
		expect(tagZone(120, rect)).toBe("inside");
		expect(tagZone(138, rect)).toBe("after");
	});
});

describe("tagMoveMutations", () => {
	const work = tag({ title: "work", sortKey: "a0" });
	const home = tag({ title: "home", sortKey: "a1" });
	const errands = tag({ title: "errands", sortKey: "a2" });
	const calls = tag({ title: "calls", sortKey: "a0", parentId: work.id });
	const tags = [work, home, errands, calls];

	it("nests a tag inside another, after its existing nested tags", () => {
		const after = apply(
			tags,
			tagMoveMutations(tags, errands.id, work.id, "inside"),
		);
		expect(order(after, null)).toEqual(["work", "home"]);
		expect(order(after, work.id)).toEqual(["calls", "errands"]);
	});

	it("reorders among the same parent's tags", () => {
		const before = apply(
			tags,
			tagMoveMutations(tags, errands.id, work.id, "before"),
		);
		expect(order(before, null)).toEqual(["errands", "work", "home"]);
		const after = apply(
			tags,
			tagMoveMutations(tags, work.id, home.id, "after"),
		);
		expect(order(after, null)).toEqual(["home", "work", "errands"]);
	});

	it("moves a nested tag out by placing it next to a top-level one", () => {
		const after = apply(
			tags,
			tagMoveMutations(tags, calls.id, home.id, "after"),
		);
		expect(order(after, null)).toEqual(["work", "home", "calls", "errands"]);
		expect(order(after, work.id)).toEqual([]);
	});

	it("won't nest a tag inside itself or its own nested tags", () => {
		expect(tagMoveMutations(tags, work.id, work.id, "inside")).toBeNull();
		expect(tagMoveMutations(tags, work.id, calls.id, "inside")).toBeNull();
		expect(tagMoveMutations(tags, work.id, calls.id, "before")).toBeNull();
		expect(canMoveTag(tags, work.id, calls.id)).toBe(false);
		expect(canMoveTag(tags, calls.id, work.id)).toBe(true);
	});

	it("does nothing when the tag is already there", () => {
		expect(tagMoveMutations(tags, work.id, home.id, "before")).toBeNull();
		expect(tagMoveMutations(tags, calls.id, work.id, "inside")).toBeNull();
	});

	it("opens a collapsed tag that something is nested into", () => {
		const closed = { ...work, collapsed: true };
		const mutations = tagMoveMutations(
			[closed, home, errands, calls],
			home.id,
			closed.id,
			"inside",
		);
		expect(mutations).toContainEqual({
			type: "upsert",
			entity: "tag",
			id: work.id,
			patch: { collapsed: false },
		});
	});

	it("treats a tag whose parent is deleted as top-level", () => {
		const gone = tag({ title: "gone", deletedAt: 1 });
		const orphan = tag({ title: "orphan", sortKey: "a3", parentId: gone.id });
		const all = [...tags, gone, orphan];
		const after = apply(
			all,
			tagMoveMutations(all, errands.id, orphan.id, "after"),
		);
		expect(after.find((t) => t.id === errands.id)?.parentId).toBeNull();
	});
});

describe("tagDescendants", () => {
	it("includes the tag and everything nested below it", () => {
		const a = tag();
		const b = tag({ parentId: a.id });
		const c = tag({ parentId: b.id });
		const d = tag();
		expect([...tagDescendants([a, b, c, d], a.id)].sort()).toEqual(
			[a.id, b.id, c.id].sort(),
		);
	});
});
