import { ulid } from "ulid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalDb } from "../../src/db/local";
import { SyncEngine } from "../../src/sync/engine";
import { FakeServer } from "./fake-server";

let db: LocalDb;
let engine: SyncEngine;

beforeEach(() => {
	db = new LocalDb(`test-${ulid()}`);
	engine = new SyncEngine(db, new FakeServer());
});

afterEach(async () => {
	await db.delete();
});

describe("undo and redo", () => {
	it("reverts and re-applies an edit, including derived fields", async () => {
		const id = await engine.create("todo", { title: "Plan" });
		await engine.update("todo", id, {
			title: "Plan trip",
			startDate: "2026-11-02",
		});
		expect(await db.todos.get(id)).toMatchObject({
			title: "Plan trip",
			when: "scheduled",
		});

		expect(await engine.undo()).toBe(true);
		expect(await db.todos.get(id)).toMatchObject({
			title: "Plan",
			when: "inbox",
			startDate: null,
		});

		expect(await engine.redo()).toBe(true);
		expect(await db.todos.get(id)).toMatchObject({
			title: "Plan trip",
			when: "scheduled",
			startDate: "2026-11-02",
		});
	});

	it("undoes a create by moving it to Trash, and redo brings it back", async () => {
		const id = await engine.create("todo", { title: "Oops" });
		await engine.undo();
		expect((await db.todos.get(id))?.deletedAt).toEqual(expect.any(Number));
		await engine.redo();
		expect((await db.todos.get(id))?.deletedAt).toBeNull();
	});

	it("undoes a cascading delete", async () => {
		const projectId = await engine.create("project", { title: "P" });
		const todoId = await engine.create("todo", { projectId });
		await engine.remove("project", projectId);
		expect((await db.todos.get(todoId))?.deletedAt).not.toBeNull();
		await engine.undo();
		expect((await db.projects.get(projectId))?.deletedAt).toBeNull();
		expect((await db.todos.get(todoId))?.deletedAt).toBeNull();
	});

	it("undoes a whole batch as one step", async () => {
		const a = await engine.create("todo", { title: "A" });
		const b = await engine.create("todo", { title: "B" });
		await engine.apply([
			{ type: "upsert", entity: "todo", id: a, patch: { status: "completed" } },
			{ type: "upsert", entity: "todo", id: b, patch: { status: "completed" } },
		]);
		await engine.undo();
		expect((await db.todos.get(a))?.status).toBe("open");
		expect((await db.todos.get(b))?.status).toBe("open");
	});

	it("clears redo after a new change, and respects undoable: false", async () => {
		const id = await engine.create("todo", { title: "A" });
		await engine.update("todo", id, { title: "B" });
		await engine.undo();
		await engine.update("todo", id, { title: "C" });
		expect(await engine.redo()).toBe(false);

		// Not recorded, so undo skips past it to the C edit, whose undo restores "A".
		await engine.apply(
			[{ type: "upsert", entity: "todo", id, patch: { title: "D" } }],
			{ undoable: false },
		);
		await engine.undo();
		expect((await db.todos.get(id))?.title).toBe("A");
	});

	it("skips entries whose rows were purged", async () => {
		const kept = await engine.create("todo", { title: "kept" });
		await engine.update("todo", kept, { title: "kept, edited" });
		const blank = await engine.create("todo", {});
		await engine.purge("todo", blank);
		expect(await engine.undo()).toBe(true);
		expect((await db.todos.get(kept))?.title).toBe("kept");
	});

	it("remembers at most 50 changes", async () => {
		const id = await engine.create("todo", { title: "0" });
		for (let i = 1; i <= 60; i++)
			await engine.update("todo", id, { title: String(i) });
		let undone = 0;
		while (await engine.undo()) undone++;
		expect(undone).toBe(50);
		expect((await db.todos.get(id))?.title).toBe("10");
	});

	it("has nothing to undo or redo at first", async () => {
		expect(await engine.undo()).toBe(false);
		expect(await engine.redo()).toBe(false);
	});
});
