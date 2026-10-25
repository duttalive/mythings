import { ulid } from "ulid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EntityRow, OpError, Todo } from "../../shared/schema";
import { LocalDb } from "../../src/db/local";
import { SyncEngine } from "../../src/sync/engine";
import { FakeChannel } from "./fake-channel";
import { FakeServer } from "./fake-server";

let db: LocalDb;
let server: FakeServer;
let channel: FakeChannel;
let engine: SyncEngine;
let rejected: OpError[];

beforeEach(async () => {
	db = new LocalDb(`test-${ulid()}`);
	server = new FakeServer();
	channel = new FakeChannel();
	rejected = [];
	engine = new SyncEngine(db, server, {
		channel,
		tz: "Europe/Berlin",
		socketTimeoutMs: 200,
		pollIntervalMs: 60_000,
		onRejected: (errors) => rejected.push(...errors),
	});
	engine.start();
	await engine.sync(); // the initial sync from start(), over HTTP
});

afterEach(async () => {
	engine.stop();
	await db.delete();
});

const lastRev = async () => (await db.meta.get("lastRev"))?.value;

function todoRow(id: string, rev: number, title = "remote"): EntityRow {
	const row = server.write("todo", id, { title });
	return { entity: "todo", row: { ...(row.row as Todo), rev } };
}

describe("connecting", () => {
	it("says hello with lastRev and time zone, and goes live", async () => {
		server.write("todo", ulid(), { title: "seen" });
		await engine.sync();
		channel.connect();
		await vi.waitFor(() => expect(channel.sentOfType("hello")).toHaveLength(1));
		expect(channel.sentOfType("hello")[0]).toEqual({
			type: "hello",
			lastRev: 1,
			tz: "Europe/Berlin",
		});
		expect(engine.getStatus().live).toBe(true);
	});
});

describe("time zone", () => {
	it("says hello again when the user picks another time zone", async () => {
		channel.connect();
		await vi.waitFor(() => expect(channel.sentOfType("hello")).toHaveLength(1));
		engine.setTimeZone("Asia/Tokyo");
		await vi.waitFor(() => expect(channel.sentOfType("hello")).toHaveLength(2));
		expect(channel.sentOfType("hello")[1]).toMatchObject({ tz: "Asia/Tokyo" });
		// The same zone again changes nothing.
		engine.setTimeZone("Asia/Tokyo");
		await new Promise((r) => setTimeout(r, 20));
		expect(channel.sentOfType("hello")).toHaveLength(2);
	});
});

describe("streamed changes", () => {
	beforeEach(async () => {
		channel.connect();
		await vi.waitFor(() => expect(channel.sentOfType("hello")).toHaveLength(1));
	});

	it("applies rows and advances lastRev when contiguous", async () => {
		const id = ulid();
		channel.deliver({
			type: "changes",
			rows: [todoRow(id, 1, "live!")],
			purged: [],
			fromRev: 0,
			rev: 1,
			more: false,
		});
		await vi.waitFor(async () =>
			expect((await db.todos.get(id))?.title).toBe("live!"),
		);
		expect(await lastRev()).toBe(1);
	});

	it("applies rows after a gap but asks to catch up instead of advancing", async () => {
		const id = ulid();
		channel.deliver({
			type: "changes",
			rows: [todoRow(id, 9)],
			purged: [],
			fromRev: 8,
			rev: 9,
			more: false,
		});
		await vi.waitFor(() => expect(channel.sentOfType("hello")).toHaveLength(2));
		expect(await db.todos.get(id)).toBeDefined();
		expect(await lastRev()).toBe(0);
	});

	it("applies messages in order", async () => {
		const id = ulid();
		for (let rev = 1; rev <= 5; rev++) {
			channel.deliver({
				type: "changes",
				rows: [todoRow(id, rev, `v${rev}`)],
				purged: [],
				fromRev: rev - 1,
				rev,
				more: false,
			});
		}
		await vi.waitFor(async () => expect(await lastRev()).toBe(5));
		expect((await db.todos.get(id))?.title).toBe("v5");
	});

	it("doesn't poll or pull while live", async () => {
		const pull = vi.spyOn(server, "pull");
		await engine.sync();
		expect(pull).not.toHaveBeenCalled();
	});
});

describe("pushing over the channel", () => {
	beforeEach(async () => {
		channel.connect();
		await vi.waitFor(() => expect(channel.sentOfType("hello")).toHaveLength(1));
	});

	it("sends the outbox and clears it on ack", async () => {
		const id = await engine.create("todo", { title: "over ws" });
		await vi.waitFor(() => expect(channel.sentOfType("push")).toHaveLength(1));
		const [push] = channel.sentOfType("push");
		expect(push?.ops.map((op) => op.entityId)).toEqual([id]);
		expect(server.pushCalls).toBe(0);

		channel.deliver({
			type: "ack",
			opIds: [push?.ops[0]?.opId as string],
			rev: 1,
		});
		await vi.waitFor(async () => expect(await db.outbox.count()).toBe(0));
		expect(engine.getStatus()).toMatchObject({ pending: 0, state: "idle" });
	});

	it("takes the server's row for ops it already applied, even before their ack", async () => {
		const id = await engine.create("todo", { title: "Plan" });
		await vi.waitFor(() => expect(channel.sentOfType("push")).toHaveLength(1));
		const opId = channel.sentOfType("push")[0]?.ops[0]?.opId as string;

		// The server applied the op and changed a field the op also set (as when
		// it advances a repeat's next date); its broadcast arrives before the ack.
		const serverRow = {
			...((await db.todos.get(id)) as Todo),
			title: "Plan (server)",
			rev: 1,
		};
		channel.deliver({
			type: "changes",
			rows: [{ entity: "todo", row: serverRow }],
			purged: [],
			fromRev: 0,
			rev: 1,
			more: false,
			opIds: [opId],
		});
		await vi.waitFor(async () =>
			expect((await db.todos.get(id))?.title).toBe("Plan (server)"),
		);
		expect(await db.outbox.count()).toBe(0);

		channel.deliver({ type: "ack", opIds: [opId], rev: 1 });
		await vi.waitFor(() => expect(engine.getStatus().state).toBe("idle"));
		expect((await db.todos.get(id))?.title).toBe("Plan (server)");
	});

	it("rolls back ops rejected before the ack", async () => {
		const id = await engine.create("todo", { title: "doomed" });
		await vi.waitFor(() => expect(channel.sentOfType("push")).toHaveLength(1));
		const opId = channel.sentOfType("push")[0]?.ops[0]?.opId as string;

		channel.deliver({
			type: "error",
			opId,
			code: "missing_reference",
			message: "nope",
			current: null,
		});
		channel.deliver({ type: "ack", opIds: [], rev: 0 });
		await vi.waitFor(async () =>
			expect(await db.todos.get(id)).toBeUndefined(),
		);
		expect(rejected.map((e) => e.code)).toEqual(["missing_reference"]);
	});

	it("falls back to HTTP when the connection drops mid-push", async () => {
		const id = await engine.create("todo", { title: "resilient" });
		await vi.waitFor(() => expect(channel.sentOfType("push")).toHaveLength(1));

		channel.disconnect();
		expect(engine.getStatus().live).toBe(false);
		await vi.waitFor(() => expect(server.get("todo", id)).toBeDefined());
		await vi.waitFor(async () => expect(await db.outbox.count()).toBe(0));
	});

	it("retries when no ack arrives", async () => {
		await engine.create("todo", { title: "slow" });
		await vi.waitFor(() => expect(engine.getStatus().state).toBe("offline"), {
			timeout: 1000,
		});
		expect(await db.outbox.count()).toBe(1);
	});
});
