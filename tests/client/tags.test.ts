import { describe, expect, it } from "vitest";
import type { Tag } from "../../shared/schema";
import { tagForShortcut, tagShortcutMutations } from "../../src/editing/tags";

let n = 0;
const tag = (overrides: Partial<Tag> = {}): Tag => ({
	id: `01M5SQ00000000000000TAG${String(n++).padStart(3, "0")}`,
	createdAt: 0,
	updatedAt: 0,
	deletedAt: null,
	rev: 0,
	title: "tag",
	parentId: null,
	shortcut: null,
	sortKey: "a0",
	...overrides,
});

describe("tag shortcuts", () => {
	it("moves a key that's taken to the new tag, in one batch", () => {
		const errands = tag({ title: "errands", shortcut: "e" });
		const email = tag({ title: "email" });
		expect(tagShortcutMutations([errands, email], email.id, "e")).toEqual([
			{
				type: "upsert",
				entity: "tag",
				id: errands.id,
				patch: { shortcut: null },
			},
			{ type: "upsert", entity: "tag", id: email.id, patch: { shortcut: "e" } },
		]);
	});

	it("clears a key, and ignores deleted tags holding it", () => {
		const gone = tag({ shortcut: "x", deletedAt: 1 });
		const live = tag();
		expect(tagShortcutMutations([gone, live], live.id, "x")).toHaveLength(1);
		expect(tagShortcutMutations([live], live.id, null)).toEqual([
			{ type: "upsert", entity: "tag", id: live.id, patch: { shortcut: null } },
		]);
	});

	it("finds the live tag for a key", () => {
		const gone = tag({ shortcut: "w", deletedAt: 1 });
		const work = tag({ title: "work", shortcut: "w" });
		expect(tagForShortcut([gone, work], "w")).toBe(work);
		expect(tagForShortcut([work], "W")).toBeUndefined();
		expect(tagForShortcut([work], "Enter")).toBeUndefined();
	});
});
