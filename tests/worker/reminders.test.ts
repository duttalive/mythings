import {
	env,
	runDurableObjectAlarm,
	runInDurableObject,
} from "cloudflare:test";
import { ulid } from "ulid";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { addDays, todayIn } from "../../shared/dates";
import { DEFAULTS } from "../../shared/rows";
import type { Todo } from "../../shared/schema";
import { sendPush } from "../../worker/push";
import { Store } from "../../worker/store";
import { api, signup } from "./helpers";

let cookie: string;
let userId: string;

/**
 * Stand-in push services at push.test: accept well-formed Web Push requests
 * (aes128gcm body, VAPID authorization, TTL) and report /gone/… as expired.
 * Durable Objects run in this isolate, so this also covers alarms.
 */
beforeAll(() => {
	const realFetch = globalThis.fetch;
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		if (url.hostname !== "push.test") return realFetch(input, init);
		if (url.pathname.startsWith("/gone"))
			return new Response(null, { status: 410 });
		const ok =
			request.method === "POST" &&
			request.headers.get("content-encoding") === "aes128gcm" &&
			/^vapid t=[^,]+, k=/.test(request.headers.get("authorization") ?? "") &&
			Number(request.headers.get("ttl")) > 0 &&
			(await request.arrayBuffer()).byteLength > 0;
		return new Response(null, { status: ok ? 201 : 400 });
	});
});

afterAll(() => {
	vi.restoreAllMocks();
});

beforeEach(async () => {
	({ cookie } = await signup());
	userId = ((await (await api("/me", { cookie })).json()) as { id: string }).id;
});

const upsert = (
	entity: string,
	entityId: string,
	patch: Record<string, unknown>,
) => ({
	opId: ulid(),
	entity,
	entityId,
	kind: "upsert",
	patch,
	clientTs: Date.now(),
});

async function push(...ops: unknown[]) {
	const res = await api("/sync/push", {
		method: "POST",
		cookie,
		body: { ops },
	});
	expect(res.status).toBe(200);
	return res.json<{ errors: unknown[] }>();
}

/** A browser-like subscription: a fresh P-256 key and auth secret. */
async function fakeSubscription(endpoint: string) {
	const pair = (await crypto.subtle.generateKey(
		{ name: "ECDH", namedCurve: "P-256" },
		true,
		["deriveBits"],
	)) as CryptoKeyPair;
	const raw = new Uint8Array(
		(await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer,
	);
	const b64url = (bytes: Uint8Array) =>
		btoa(String.fromCharCode(...bytes))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/, "");
	return {
		endpoint,
		keys: {
			p256dh: b64url(raw),
			auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
		},
	};
}

const stub = () => env.USER_STORE.getByName(userId);

describe("push subscription routes", () => {
	it("serves the public key", async () => {
		const res = await api("/push/key", { cookie });
		expect(await res.json()).toEqual({ publicKey: env.VAPID_PUBLIC_KEY });
	});

	it("saves, updates and removes a subscription", async () => {
		const sub = await fakeSubscription(`https://push.test/ok/${ulid()}`);
		expect(
			(await api("/push/subscribe", { method: "POST", cookie, body: sub }))
				.status,
		).toBe(201);
		const again = { ...sub, keys: { ...sub.keys, auth: "bmV3LWF1dGg" } };
		expect(
			(await api("/push/subscribe", { method: "POST", cookie, body: again }))
				.status,
		).toBe(201);

		const rows = await env.DB.prepare(
			"SELECT auth FROM push_subscriptions WHERE endpoint = ?",
		)
			.bind(sub.endpoint)
			.all();
		expect(rows.results).toEqual([{ auth: "bmV3LWF1dGg" }]);

		await api("/push/subscribe", {
			method: "DELETE",
			cookie,
			body: { endpoint: sub.endpoint },
		});
		const after = await env.DB.prepare(
			"SELECT 1 FROM push_subscriptions WHERE endpoint = ?",
		)
			.bind(sub.endpoint)
			.all();
		expect(after.results).toEqual([]);
	});

	it("won't move another account's subscription", async () => {
		const sub = await fakeSubscription(`https://push.test/ok/${ulid()}`);
		await api("/push/subscribe", { method: "POST", cookie, body: sub });
		const other = await signup();
		const res = await api("/push/subscribe", {
			method: "POST",
			cookie: other.cookie,
			body: sub,
		});
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: "endpoint_taken" });
		// Nor remove it.
		await api("/push/subscribe", {
			method: "DELETE",
			cookie: other.cookie,
			body: { endpoint: sub.endpoint },
		});
		const row = await env.DB.prepare(
			"SELECT user_id FROM push_subscriptions WHERE endpoint = ?",
		)
			.bind(sub.endpoint)
			.first<{ user_id: string }>();
		expect(row?.user_id).toBe(userId);

		// Once its owner unsubscribes (e.g. signing out), the next account can have it.
		await api("/push/subscribe", {
			method: "DELETE",
			cookie,
			body: { endpoint: sub.endpoint },
		});
		expect(
			(
				await api("/push/subscribe", {
					method: "POST",
					cookie: other.cookie,
					body: sub,
				})
			).status,
		).toBe(201);
	});

	it("rejects non-https endpoints and anonymous requests", async () => {
		const sub = await fakeSubscription("http://push.test/insecure");
		expect(
			(await api("/push/subscribe", { method: "POST", cookie, body: sub }))
				.status,
		).toBe(400);
		expect((await api("/push/key")).status).toBe(401);
	});
});

describe("sendPush", () => {
	it("delivers encrypted, VAPID-signed messages and forgets expired subscriptions", async () => {
		const ok = await fakeSubscription(`https://push.test/ok/${ulid()}`);
		const gone = await fakeSubscription(`https://push.test/gone/${ulid()}`);
		await api("/push/subscribe", { method: "POST", cookie, body: ok });
		await api("/push/subscribe", { method: "POST", cookie, body: gone });

		const delivered = await sendPush(env, userId, [
			{ title: "Water plants", body: "Home", url: "/today", tag: "t1" },
		]);
		expect(delivered).toBe(1);
		const left = await env.DB.prepare(
			"SELECT endpoint FROM push_subscriptions WHERE user_id = ?",
		)
			.bind(userId)
			.all();
		expect(left.results).toEqual([{ endpoint: ok.endpoint }]);
	});
});

describe("alarms", () => {
	it("is set for the next reminder once the user has synced", async () => {
		const at = Date.now() + 60 * 60 * 1000;
		await push(
			upsert("todo", ulid(), {
				title: "Call",
				reminderAt: at,
				when: "scheduled",
				startDate: todayIn("UTC"),
			}),
		);
		const alarm = await runInDurableObject(stub(), (_, state) =>
			state.storage.getAlarm(),
		);
		expect(alarm).not.toBeNull();
		// Midnight may come first; either way it's in the future and no later than the reminder.
		expect(alarm as number).toBeGreaterThan(Date.now());
		expect(alarm as number).toBeLessThanOrEqual(at);
	});

	it("pushes due reminders once", async () => {
		const sub = await fakeSubscription(`https://push.test/ok/${ulid()}`);
		await api("/push/subscribe", { method: "POST", cookie, body: sub });
		const id = ulid();
		await push(
			upsert("todo", id, {
				title: "Stretch",
				reminderAt: Date.now() - 1000,
				when: "scheduled",
				startDate: todayIn("UTC"),
			}),
		);

		expect(await runDurableObjectAlarm(stub())).toBe(true);
		const sent = await runInDurableObject(stub(), (_, state) =>
			state.storage.sql.exec("SELECT todo_id FROM reminders_sent").toArray(),
		);
		expect(sent).toEqual([{ todo_id: id }]);

		// Moving the reminder makes it due again.
		await push(upsert("todo", id, { reminderAt: Date.now() - 500 }));
		await runDurableObjectAlarm(stub());
		const resent = await runInDurableObject(stub(), (_, state) =>
			state.storage.sql
				.exec<{ reminder_at: number }>("SELECT reminder_at FROM reminders_sent")
				.toArray(),
		);
		expect(resent).toHaveLength(1);
		expect(resent[0]?.reminder_at).toBeGreaterThan(Date.now() - 2000);
	});

	it("creates due repeat instances and empties old Trash", async () => {
		await push(upsert("todo", ulid(), { title: "Sync context" }));
		const today = todayIn("UTC");
		const templateId = ulid();
		const oldTrash = ulid();
		const recentTrash = ulid();
		// Write directly, as if the day had turned since the last push.
		await runInDurableObject(stub(), (_, state) => {
			const store = new Store(state.storage.sql);
			const base = (id: string, patch: Partial<Todo>): Todo =>
				({
					...DEFAULTS.todo,
					id,
					createdAt: 1,
					updatedAt: 1,
					rev: store.nextRev(),
					...patch,
				}) as Todo;
			store.put(
				"todo",
				base(templateId, {
					title: "Water plants",
					when: "anytime",
					repeat: {
						mode: "fixed",
						freq: "daily",
						interval: 1,
						nextDate: today,
					},
				}),
			);
			store.put(
				"todo",
				base(oldTrash, {
					title: "Old",
					deletedAt: Date.now() - 31 * 24 * 60 * 60 * 1000,
				}),
			);
			store.put(
				"todo",
				base(recentTrash, { title: "Recent", deletedAt: Date.now() - 1000 }),
			);
		});

		await runDurableObjectAlarm(stub());
		const rows = await (await api("/sync/pull?since=0", { cookie })).json<{
			rows: { row: Todo }[];
			purged: { id: string }[];
		}>();
		const todos = rows.rows.map((r) => r.row);
		expect(
			todos
				.filter((t) => t.repeatTemplateId === templateId)
				.map((t) => t.startDate),
		).toEqual([today]);
		expect(todos.find((t) => t.id === templateId)?.repeat?.nextDate).toBe(
			addDays(today, 1),
		);
		expect(todos.some((t) => t.id === oldTrash)).toBe(false);
		expect(rows.purged.map((p) => p.id)).toContain(oldTrash);
		expect(todos.some((t) => t.id === recentTrash)).toBe(true);
	});

	it("does nothing before the user has ever synced", async () => {
		const fresh = env.USER_STORE.getByName(ulid());
		expect(
			await runInDurableObject(fresh, (_, state) => state.storage.getAlarm()),
		).toBeNull();
	});
});
