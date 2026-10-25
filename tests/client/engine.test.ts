import { ulid } from "ulid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpError } from "../../shared/schema";
import { LocalDb } from "../../src/db/local";
import { InvalidMutation, SyncEngine } from "../../src/sync/engine";
import { FakeServer } from "./fake-server";

let db: LocalDb;
let server: FakeServer;
let engine: SyncEngine;
let rejected: OpError[];
let unauthorized: number;

beforeEach(() => {
	db = new LocalDb(`test-${ulid()}`);
	server = new FakeServer();
	rejected = [];
	unauthorized = 0;
	engine = new SyncEngine(db, server, {
		pullLimit: 3,
		onRejected: (errors) => rejected.push(...errors),
		onUnauthorized: () => unauthorized++,
	});
});

afterEach(async () => {
	engine.stop();
	await db.delete();
});

describe("local mutations", () => {
	it("apply immediately and queue an op", async () => {
		const id = await engine.create("todo", { title: "Buy milk" });
		expect(await db.todos.get(id)).toMatchObject({
			title: "Buy milk",
			when: "inbox",
			rev: 0,
		});
		const outbox = await db.outbox.toArray();
		expect(outbox).toHaveLength(1);
		expect(outbox[0]?.op).toMatchObject({
			kind: "upsert",
			entity: "todo",
			entityId: id,
		});
		expect(engine.getStatus().pending).toBe(1);
		expect(server.pushCalls).toBe(0);
	});

	it("normalize like the server does", async () => {
		const id = await engine.create("todo", { title: "Call" });
		await engine.update("todo", id, { startDate: "2026-10-25", evening: true });
		expect(await db.todos.get(id)).toMatchObject({
			when: "scheduled",
			startDate: "2026-10-25",
			evening: true,
		});
		await engine.update("todo", id, { status: "completed" });
		expect((await db.todos.get(id))?.completedAt).toEqual(expect.any(Number));
	});

	it("reject invalid changes without writing anything", async () => {
		await expect(
			engine.create("heading", { title: "No project" }),
		).rejects.toBeInstanceOf(InvalidMutation);
		await expect(
			engine.update("todo", ulid(), { title: "ghost", evening: true }),
		).rejects.toBeInstanceOf(InvalidMutation);
		expect(await db.headings.count()).toBe(0);
		expect(await db.todos.count()).toBe(0);
		expect(await db.outbox.count()).toBe(0);
	});

	it("apply a batch atomically", async () => {
		const projectId = ulid();
		await expect(
			engine.apply([
				{
					type: "upsert",
					entity: "project",
					id: projectId,
					patch: { title: "P" },
				},
				{
					type: "upsert",
					entity: "heading",
					id: ulid(),
					patch: { title: "bad" },
				},
			]),
		).rejects.toBeInstanceOf(InvalidMutation);
		expect(await db.projects.count()).toBe(0);
		expect(await db.outbox.count()).toBe(0);
	});
});

describe("sync", () => {
	it("pushes the outbox and adopts the server's rows", async () => {
		const id = await engine.create("todo", { title: "Ship it" });
		await engine.sync();
		expect(await db.outbox.count()).toBe(0);
		expect(server.get("todo", id)).toMatchObject({ title: "Ship it" });
		expect((await db.todos.get(id))?.rev).toBe(1);
		expect(engine.getStatus()).toMatchObject({
			state: "idle",
			pending: 0,
			error: null,
		});
	});

	it("pulls changes from other devices, page by page", async () => {
		const ids = Array.from({ length: 7 }, () => ulid());
		for (const [i, id] of ids.entries())
			server.write("todo", id, { title: `remote ${i}` });
		await engine.sync();
		expect(await db.todos.count()).toBe(7);
		expect((await db.meta.get("lastRev"))?.value).toBe(7);

		server.write("todo", ids[0] as string, { title: "renamed" });
		await engine.sync();
		expect((await db.todos.get(ids[0] as string))?.title).toBe("renamed");
	});

	it("queues while offline and catches up when back", async () => {
		server.offline = true;
		const id = await engine.create("todo", { title: "Offline" });
		await engine.sync();
		expect(engine.getStatus()).toMatchObject({ state: "offline", pending: 1 });
		expect(await db.todos.get(id)).toBeDefined();

		server.offline = false;
		await engine.sync();
		expect(engine.getStatus()).toMatchObject({ state: "idle", pending: 0 });
		expect(server.get("todo", id)).toBeDefined();
	});

	it("shares one run between concurrent sync calls, then runs once more", async () => {
		await engine.create("todo", { title: "a" });
		await Promise.all([engine.sync(), engine.sync(), engine.sync()]);
		// First run pushes; the follow-up run finds an empty outbox.
		expect(server.pushCalls).toBe(1);
	});

	it("deletes rows the server purged", async () => {
		const id = ulid();
		server.write("todo", id, { title: "doomed" });
		await engine.sync();
		await server.push([
			{
				opId: ulid(),
				entity: "todo",
				entityId: id,
				kind: "purge",
				clientTs: Date.now(),
			},
		]);
		await engine.sync();
		expect(await db.todos.get(id)).toBeUndefined();
	});

	it("reports an expired session", async () => {
		server.unauthorized = true;
		await engine.sync();
		expect(unauthorized).toBe(1);
		expect(engine.getStatus()).toMatchObject({
			state: "error",
			error: "unauthorized",
		});
	});
});

describe("rebasing server rows under pending edits", () => {
	it("keeps unsent local edits when another device changed other fields", async () => {
		const id = ulid();
		server.write("todo", id, { title: "Original" });
		await engine.sync();

		server.offline = true;
		await engine.update("todo", id, { title: "Mine" });
		server.offline = false;
		server.write("todo", id, { notes: "theirs" });
		await engine.pull();

		expect(await db.todos.get(id)).toMatchObject({
			title: "Mine",
			notes: "theirs",
			rev: 2,
		});
		expect(await db.outbox.count()).toBe(1);
	});

	it("replays normalization too, not just the patched fields", async () => {
		const id = ulid();
		server.write("todo", id, { title: "Plan" });
		await engine.sync();

		await engine.update("todo", id, { startDate: "2026-11-02" });
		server.write("todo", id, { title: "Plan trip" });
		await engine.pull();

		// `when` wasn't in the patch, but replaying the op re-derives it.
		expect(await db.todos.get(id)).toMatchObject({
			title: "Plan trip",
			when: "scheduled",
			startDate: "2026-11-02",
		});
	});

	it("ignores server rows older than what we have", async () => {
		const id = ulid();
		server.write("todo", id, { title: "v1" });
		await engine.sync();
		const stale = {
			...(server.get("todo", id) as NonNullable<
				ReturnType<typeof server.get<"todo">>
			>),
		};
		server.write("todo", id, { title: "v2" });
		await engine.sync();

		const pullOnce = vi.spyOn(server, "pull").mockResolvedValueOnce({
			rows: [{ entity: "todo", row: stale }],
			purged: [],
			rev: server.rev,
			more: false,
		});
		await engine.pull();
		expect(pullOnce).toHaveBeenCalled();
		expect((await db.todos.get(id))?.title).toBe("v2");
	});
});

describe("rejected ops", () => {
	it("roll back to the server's version", async () => {
		const id = ulid();
		server.write("todo", id, { title: "Server title" });
		await engine.sync();

		server.reject = (op) =>
			op.kind === "upsert" && op.patch && "title" in op.patch
				? "invalid_row"
				: null;
		await engine.update("todo", id, { title: "Rejected title" });
		expect((await db.todos.get(id))?.title).toBe("Rejected title");
		await engine.sync();

		expect((await db.todos.get(id))?.title).toBe("Server title");
		expect(rejected.map((e) => e.code)).toEqual(["invalid_row"]);
		expect(await db.outbox.count()).toBe(0);
	});

	it("remove a rejected create", async () => {
		server.reject = () => "missing_reference";
		const id = await engine.create("todo", { title: "Never was" });
		await engine.sync();
		expect(await db.todos.get(id)).toBeUndefined();
	});
});

describe("local cascades", () => {
	it("trash and restore a project with its contents", async () => {
		const projectId = await engine.create("project", { title: "Garden" });
		const headingId = await engine.create("heading", {
			projectId,
			title: "Spring",
		});
		const inHeading = await engine.create("todo", { headingId });
		const loose = await engine.create("todo", { projectId });
		expect(await db.todos.get(inHeading)).toMatchObject({
			projectId,
			when: "anytime",
		});

		await engine.remove("project", projectId);
		const deletedAt = (await db.projects.get(projectId))?.deletedAt;
		expect(deletedAt).toEqual(expect.any(Number));
		for (const id of [inHeading, loose])
			expect((await db.todos.get(id))?.deletedAt).toBe(deletedAt);
		expect((await db.headings.get(headingId))?.deletedAt).toBe(deletedAt);

		await engine.restore("project", projectId);
		for (const id of [inHeading, loose])
			expect((await db.todos.get(id))?.deletedAt).toBeNull();
	});

	it("purge a to-do with its checklist, and strip purged tags", async () => {
		const tagId = await engine.create("tag", { title: "errand" });
		const todoId = await engine.create("todo", { tagIds: [tagId] });
		const itemId = await engine.create("checklist", { todoId, title: "step" });
		const other = await engine.create("todo", { tagIds: [tagId] });

		await engine.purge("tag", tagId);
		expect((await db.todos.get(other))?.tagIds).toEqual([]);
		await engine.purge("todo", todoId);
		expect(await db.todos.get(todoId)).toBeUndefined();
		expect(await db.checklist.get(itemId)).toBeUndefined();
	});
});

describe("first snapshot", () => {
	it("is missing until a pull reaches the server's latest rev", async () => {
		for (let i = 0; i < 5; i++)
			server.write("todo", ulid(), { title: `t${i}` });
		server.offline = true;
		await engine.sync();
		expect(engine.getStatus().hasSnapshot).toBe(false);

		server.offline = false;
		await engine.sync();
		expect(engine.getStatus().hasSnapshot).toBe(true);
	});

	it("counts an empty account as caught up", async () => {
		await engine.sync();
		expect(engine.getStatus().hasSnapshot).toBe(true);
	});

	it("is remembered across restarts, so the app can open offline", async () => {
		await engine.sync();
		engine.stop();
		server.offline = true;
		engine = new SyncEngine(db, server);
		engine.start();
		await vi.waitFor(() =>
			expect(engine.getStatus()).toMatchObject({
				hasSnapshot: true,
				state: "offline",
			}),
		);
	});
});
