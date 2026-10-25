import { exports } from "cloudflare:workers";
import { ulid } from "ulid";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerMessage } from "../../shared/schema";
import { CATCH_UP_PAGE_SIZE } from "../../worker/user-store";
import { api, ORIGIN, signup } from "./helpers";

let cookie: string;
const sockets: WebSocket[] = [];

beforeEach(async () => {
	({ cookie } = await signup());
});

afterEach(() => {
	for (const ws of sockets.splice(0)) ws.close();
});

function upgrade(headers: Record<string, string> = {}) {
	return exports.default.fetch(`${ORIGIN}/api/sync/ws`, {
		headers: { upgrade: "websocket", origin: ORIGIN, cookie, ...headers },
	});
}

/** An open socket with a queue of received messages. */
async function connect() {
	const res = await upgrade();
	expect(res.status).toBe(101);
	const ws = res.webSocket as WebSocket;
	ws.accept();
	sockets.push(ws);

	const queue: (ServerMessage | "pong")[] = [];
	const waiters: ((m: ServerMessage | "pong") => void)[] = [];
	ws.addEventListener("message", (event) => {
		const message =
			event.data === "pong"
				? "pong"
				: (JSON.parse(event.data as string) as ServerMessage);
		const waiter = waiters.shift();
		if (waiter) waiter(message);
		else queue.push(message);
	});

	return {
		ws,
		send: (message: unknown) =>
			ws.send(typeof message === "string" ? message : JSON.stringify(message)),
		next: (): Promise<ServerMessage | "pong"> => {
			const queued = queue.shift();
			if (queued) return Promise.resolve(queued);
			return new Promise((resolve, reject) => {
				const timer = setTimeout(
					() => reject(new Error("No message within 2s")),
					2000,
				);
				waiters.push((m) => {
					clearTimeout(timer);
					resolve(m);
				});
			});
		},
		/** Resolves false if nothing arrives within `ms`. */
		quiet: async (ms = 200) => {
			if (queue.length > 0) return false;
			return new Promise<boolean>((resolve) => {
				const timer = setTimeout(() => {
					waiters.splice(waiters.indexOf(onMessage), 1);
					resolve(true);
				}, ms);
				const onMessage = (m: ServerMessage | "pong") => {
					clearTimeout(timer);
					queue.unshift(m);
					resolve(false);
				};
				waiters.push(onMessage);
			});
		},
	};
}

const upsert = (patch: Record<string, unknown>, entityId = ulid()) => ({
	opId: ulid(),
	entity: "todo",
	entityId,
	kind: "upsert",
	patch,
	clientTs: Date.now(),
});

describe("handshake", () => {
	it("requires a session, a WebSocket upgrade and our origin", async () => {
		expect((await upgrade({ cookie: "" })).status).toBe(401);
		expect((await upgrade({ origin: "https://evil.example" })).status).toBe(
			403,
		);
		expect((await upgrade({ origin: "" })).status).toBe(403);
		const plain = await api("/sync/ws", { cookie });
		expect(plain.status).toBe(426);
	});
});

describe("hello", () => {
	it("catches the socket up from lastRev", async () => {
		await api("/sync/push", {
			method: "POST",
			cookie,
			body: { ops: [upsert({ title: "a" }), upsert({ title: "b" })] },
		});
		const socket = await connect();

		socket.send({ type: "hello", lastRev: 0, tz: "UTC" });
		expect(await socket.next()).toMatchObject({
			type: "changes",
			fromRev: 0,
			rev: 2,
			more: false,
		});

		socket.send({ type: "hello", lastRev: 1, tz: "UTC" });
		const partial = (await socket.next()) as Extract<
			ServerMessage,
			{ type: "changes" }
		>;
		expect(partial).toMatchObject({ fromRev: 1, rev: 2 });
		expect(partial.rows.map((r) => (r.row as { title: string }).title)).toEqual(
			["b"],
		);
	});

	it("pages a large catch-up", async () => {
		for (
			let batch = 0;
			batch < Math.ceil((CATCH_UP_PAGE_SIZE + 50) / 100);
			batch++
		) {
			const ops = Array.from({ length: 100 }, (_, i) =>
				upsert({ title: `${batch}-${i}` }),
			);
			await api("/sync/push", { method: "POST", cookie, body: { ops } });
		}
		const socket = await connect();
		socket.send({ type: "hello", lastRev: 0, tz: "UTC" });
		const first = (await socket.next()) as Extract<
			ServerMessage,
			{ type: "changes" }
		>;
		const second = (await socket.next()) as Extract<
			ServerMessage,
			{ type: "changes" }
		>;
		expect(first).toMatchObject({
			fromRev: 0,
			rev: CATCH_UP_PAGE_SIZE,
			more: true,
		});
		expect(first.rows).toHaveLength(CATCH_UP_PAGE_SIZE);
		expect(second).toMatchObject({ fromRev: CATCH_UP_PAGE_SIZE, more: false });
	});

	it("sends everything to a client that is ahead of the server", async () => {
		await api("/sync/push", {
			method: "POST",
			cookie,
			body: { ops: [upsert({ title: "a" })] },
		});
		const socket = await connect();
		socket.send({ type: "hello", lastRev: 99, tz: "UTC" });
		expect(await socket.next()).toMatchObject({
			type: "changes",
			fromRev: 0,
			rev: 1,
		});
	});
});

describe("push over the socket", () => {
	it("sends errors and an ack to the sender and changes to every socket", async () => {
		const sender = await connect();
		const other = await connect();
		const good = upsert({ title: "realtime" });
		const bad = upsert({ projectId: ulid() });

		sender.send({ type: "push", ops: [good, bad] });
		const forSender = [
			await sender.next(),
			await sender.next(),
			await sender.next(),
		];
		expect(forSender).toEqual([
			expect.objectContaining({
				type: "changes",
				fromRev: 0,
				rev: 1,
				opIds: [good.opId],
			}),
			expect.objectContaining({
				type: "error",
				opId: bad.opId,
				code: "missing_reference",
				current: null,
			}),
			{ type: "ack", opIds: [good.opId], rev: 1 },
		]);

		const forOther = await other.next();
		expect(forOther).toMatchObject({ type: "changes", rev: 1 });
		expect(await other.quiet()).toBe(true);
	});

	it("acks an all-rejected push so the client can move on", async () => {
		const socket = await connect();
		const bad = upsert({ projectId: ulid() });
		socket.send({ type: "push", ops: [bad] });
		expect(await socket.next()).toMatchObject({
			type: "error",
			opId: bad.opId,
		});
		expect(await socket.next()).toEqual({ type: "ack", opIds: [], rev: 0 });
	});

	it("rejects malformed messages", async () => {
		const socket = await connect();
		socket.send("not json");
		expect(await socket.next()).toMatchObject({
			type: "error",
			code: "invalid_message",
		});
		socket.send({ type: "push", ops: [] });
		expect(await socket.next()).toMatchObject({
			type: "error",
			code: "invalid_message",
		});
	});
});

describe("broadcast", () => {
	it("delivers HTTP pushes to connected sockets", async () => {
		const socket = await connect();
		await api("/sync/push", {
			method: "POST",
			cookie,
			body: { ops: [upsert({ title: "from http" })] },
		});
		const message = (await socket.next()) as Extract<
			ServerMessage,
			{ type: "changes" }
		>;
		expect(message.rows.map((r) => (r.row as { title: string }).title)).toEqual(
			["from http"],
		);
	});

	it("doesn't cross users", async () => {
		const socket = await connect();
		const other = await signup();
		await api("/sync/push", {
			method: "POST",
			cookie: other.cookie,
			body: { ops: [upsert({ title: "theirs" })] },
		});
		expect(await socket.quiet()).toBe(true);
	});
});

describe("heartbeat", () => {
	it("answers ping with pong", async () => {
		const socket = await connect();
		socket.send("ping");
		expect(await socket.next()).toBe("pong");
	});
});
