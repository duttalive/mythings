import { ulid } from "ulid";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayIn } from "../../shared/dates";
import type {
	EntityName,
	EntityRowMap,
	OpError,
	PullResult,
	PushResult,
	RepeatRule,
} from "../../shared/schema";
import { api, signup } from "./helpers";

let cookie: string;
const today = () => todayIn("UTC");

beforeEach(async () => {
	({ cookie } = await signup());
});

function upsert(
	entity: EntityName,
	entityId: string,
	patch: Record<string, unknown>,
) {
	return {
		opId: ulid(),
		entity,
		entityId,
		kind: "upsert",
		patch,
		clientTs: Date.now(),
	};
}

function remove(
	entity: EntityName,
	entityId: string,
	kind: "delete" | "purge" = "delete",
) {
	return { opId: ulid(), entity, entityId, kind, clientTs: Date.now() };
}

async function push(...ops: unknown[]): Promise<PushResult> {
	const res = await api("/sync/push", {
		method: "POST",
		cookie,
		body: { ops },
	});
	expect(res.status).toBe(200);
	return res.json();
}

async function pull(since = 0, limit?: number): Promise<PullResult> {
	const res = await api(
		`/sync/pull?since=${since}${limit ? `&limit=${limit}` : ""}`,
		{ cookie },
	);
	expect(res.status).toBe(200);
	return res.json();
}

/** Pushes ops that must all succeed. */
async function ok(...ops: unknown[]): Promise<PushResult> {
	const result = await push(...ops);
	expect(result.errors).toEqual([]);
	return result;
}

async function rejected(op: unknown): Promise<OpError> {
	const result = await push(op);
	expect(result.acked).toEqual([]);
	expect(result.errors).toHaveLength(1);
	return result.errors[0] as OpError;
}

/** Current server state of every row of an entity. */
async function all<E extends EntityName>(
	entity: E,
): Promise<EntityRowMap[E][]> {
	const { rows } = await pull();
	return rows
		.filter((r) => r.entity === entity)
		.map((r) => r.row as EntityRowMap[E]);
}

async function get<E extends EntityName>(
	entity: E,
	id: string,
): Promise<EntityRowMap[E]> {
	const row = (await all(entity)).find((r) => r.id === id);
	expect(row, `${entity} ${id}`).toBeDefined();
	return row as EntityRowMap[E];
}

describe("push and pull", () => {
	it("creates rows with defaults and server-assigned rev", async () => {
		const id = ulid();
		const result = await ok(upsert("todo", id, { title: "Buy milk" }));
		expect(result.rev).toBe(1);
		expect(result.rows).toMatchObject([
			{
				entity: "todo",
				row: { id, title: "Buy milk", when: "inbox", status: "open", rev: 1 },
			},
		]);

		const pulled = await pull();
		expect(pulled).toMatchObject({ rev: 1, more: false, purged: [] });
		expect(pulled.rows).toEqual(result.rows);
	});

	it("stores whether an area is collapsed, open by default", async () => {
		const id = ulid();
		await ok(upsert("area", id, { title: "Home" }));
		expect(await get("area", id)).toMatchObject({ collapsed: false });
		await ok(upsert("area", id, { collapsed: true }));
		expect(await get("area", id)).toMatchObject({
			title: "Home",
			collapsed: true,
		});
		// Other edits leave it alone.
		await ok(upsert("area", id, { title: "House" }));
		expect(await get("area", id)).toMatchObject({ collapsed: true });
		expect(
			(await rejected(upsert("area", id, { collapsed: "yes" }))).code,
		).toBe("invalid_op");
	});

	it("stores whether a tag is collapsed, open by default", async () => {
		const id = ulid();
		await ok(upsert("tag", id, { title: "errands" }));
		expect(await get("tag", id)).toMatchObject({ collapsed: false });
		await ok(upsert("tag", id, { collapsed: true }));
		expect(await get("tag", id)).toMatchObject({
			title: "errands",
			collapsed: true,
		});
	});

	it("ignores an op it has already applied", async () => {
		const op = upsert("todo", ulid(), { title: "Once" });
		const first = await ok(op);
		const again = await ok(op);
		expect(again.acked).toEqual([op.opId]);
		expect(again.rows).toEqual([]);
		expect(again.rev).toBe(first.rev);
	});

	it("merges field by field, last write wins", async () => {
		const id = ulid();
		await ok(upsert("todo", id, { title: "A" }));
		await ok(
			upsert("todo", id, { notes: "from device 1" }),
			upsert("todo", id, { title: "B" }),
		);
		await ok(upsert("todo", id, { title: "C" }));
		expect(await get("todo", id)).toMatchObject({
			title: "C",
			notes: "from device 1",
		});
	});

	it("rejects bad ops individually and applies the rest", async () => {
		const good = upsert("todo", ulid(), { title: "fine" });
		const unknownField = upsert("todo", ulid(), { colour: "red" });
		const result = await push(
			{ opId: "nope" },
			{ kind: "upsert" },
			unknownField,
			good,
		);
		expect(result.acked).toEqual([good.opId]);
		// The opId is echoed back when there is one, so the client can match the error to its op.
		expect(result.errors.map((e) => [e.opId, e.code])).toEqual([
			["nope", "invalid_op"],
			[null, "invalid_op"],
			[unknownField.opId, "invalid_op"],
		]);
	});

	it("rejects rows that break invariants", async () => {
		const error = await rejected(
			upsert("heading", ulid(), { title: "No project" }),
		);
		expect(error.code).toBe("invalid_row");
		expect(error.issues?.[0]?.path).toEqual(["projectId"]);
	});

	it("rejects references to missing or deleted rows", async () => {
		expect(
			(await rejected(upsert("todo", ulid(), { projectId: ulid() }))).code,
		).toBe("missing_reference");
		const projectId = ulid();
		await ok(
			upsert("project", projectId, { title: "P" }),
			remove("project", projectId),
		);
		expect((await rejected(upsert("todo", ulid(), { projectId }))).code).toBe(
			"missing_reference",
		);
		expect(
			(await rejected(upsert("todo", ulid(), { tagIds: [ulid()] }))).code,
		).toBe("missing_reference");
		expect((await rejected(remove("todo", ulid()))).code).toBe("not_found");
	});

	it("returns the server's row with a rejection so clients can roll back", async () => {
		const id = ulid();
		await ok(upsert("todo", id, { title: "Real" }));
		const error = await rejected(upsert("todo", id, { projectId: ulid() }));
		expect(error.current).toMatchObject({
			entity: "todo",
			row: { id, title: "Real", projectId: null },
		});
		expect(
			(await rejected(upsert("todo", ulid(), { projectId: ulid() }))).current,
		).toBeNull();
	});

	it("paginates pulls by rev", async () => {
		await ok(
			...Array.from({ length: 5 }, (_, i) =>
				upsert("todo", ulid(), { title: `t${i}` }),
			),
		);
		const page1 = await pull(0, 2);
		expect(page1).toMatchObject({ more: true, rev: 2 });
		const page2 = await pull(page1.rev, 2);
		const page3 = await pull(page2.rev, 2);
		expect(page3).toMatchObject({ more: false, rev: 5 });
		const titles = [...page1.rows, ...page2.rows, ...page3.rows].map(
			(r) => (r.row as { title: string }).title,
		);
		expect(titles).toEqual(["t0", "t1", "t2", "t3", "t4"]);
		expect((await pull(5)).rows).toEqual([]);
	});

	it("keeps each user's data separate", async () => {
		await ok(upsert("todo", ulid(), { title: "mine" }));
		const other = await signup();
		const res = await api("/sync/pull", { cookie: other.cookie });
		expect(await res.json()).toMatchObject({ rows: [], rev: 0 });
	});
});

describe("normalization", () => {
	it("keeps scheduling fields consistent", async () => {
		const id = ulid();
		await ok(upsert("todo", id, { startDate: today(), evening: true }));
		expect(await get("todo", id)).toMatchObject({
			when: "scheduled",
			startDate: today(),
			evening: true,
		});

		await ok(upsert("todo", id, { when: "someday" }));
		expect(await get("todo", id)).toMatchObject({
			when: "someday",
			startDate: null,
			evening: false,
		});

		await ok(upsert("todo", id, { startDate: today() }));
		await ok(upsert("todo", id, { startDate: null }));
		expect(await get("todo", id)).toMatchObject({
			when: "anytime",
			startDate: null,
		});
	});

	it("stamps and clears completedAt with the status", async () => {
		const id = ulid();
		const op = upsert("todo", id, { status: "completed" });
		await ok(op);
		expect((await get("todo", id)).completedAt).toBe(op.clientTs);
		await ok(upsert("todo", id, { status: "open" }));
		expect((await get("todo", id)).completedAt).toBeNull();
	});

	it("moves to-dos between Inbox, areas, projects and headings cleanly", async () => {
		const [areaId, projectId, otherProjectId, headingId, todoId] = [
			ulid(),
			ulid(),
			ulid(),
			ulid(),
			ulid(),
		];
		await ok(
			upsert("area", areaId, { title: "Home" }),
			upsert("project", projectId, { title: "Garden" }),
			upsert("project", otherProjectId, { title: "Kitchen" }),
			upsert("heading", headingId, { projectId, title: "Spring" }),
			upsert("todo", todoId, { title: "Plant bulbs" }),
		);

		await ok(upsert("todo", todoId, { areaId }));
		expect(await get("todo", todoId)).toMatchObject({
			areaId,
			projectId: null,
			when: "anytime",
		});

		await ok(upsert("todo", todoId, { headingId }));
		expect(await get("todo", todoId)).toMatchObject({
			projectId,
			headingId,
			areaId: null,
		});

		await ok(upsert("todo", todoId, { projectId: otherProjectId }));
		expect(await get("todo", todoId)).toMatchObject({
			projectId: otherProjectId,
			headingId: null,
		});

		await ok(upsert("todo", todoId, { when: "inbox" }));
		expect(await get("todo", todoId)).toMatchObject({
			when: "inbox",
			projectId: null,
			areaId: null,
		});
	});

	it("rejects a heading from a different project", async () => {
		const [p1, p2, h1] = [ulid(), ulid(), ulid()];
		await ok(
			upsert("project", p1, {}),
			upsert("project", p2, {}),
			upsert("heading", h1, { projectId: p1 }),
		);
		const error = await rejected(
			upsert("todo", ulid(), { projectId: p2, headingId: h1 }),
		);
		expect(error.code).toBe("invalid_reference");
	});

	it("moves a heading's to-dos when the heading moves", async () => {
		const [p1, p2, h, t] = [ulid(), ulid(), ulid(), ulid()];
		await ok(
			upsert("project", p1, {}),
			upsert("project", p2, {}),
			upsert("heading", h, { projectId: p1 }),
			upsert("todo", t, { headingId: h }),
		);
		await ok(upsert("heading", h, { projectId: p2 }));
		expect(await get("todo", t)).toMatchObject({ projectId: p2, headingId: h });
	});

	it("rejects tag cycles", async () => {
		const [a, b] = [ulid(), ulid()];
		await ok(
			upsert("tag", a, { title: "a" }),
			upsert("tag", b, { title: "b", parentId: a }),
		);
		expect((await rejected(upsert("tag", a, { parentId: b }))).code).toBe(
			"cycle",
		);
	});
});

describe("delete, restore and purge", () => {
	it("cascades a project delete and restores exactly what went with it", async () => {
		const [p, h, t1, t2, earlier] = [ulid(), ulid(), ulid(), ulid(), ulid()];
		await ok(
			upsert("project", p, {}),
			upsert("heading", h, { projectId: p }),
			upsert("todo", t1, { projectId: p }),
			upsert("todo", t2, { headingId: h }),
			upsert("todo", earlier, { projectId: p }),
		);
		await ok(remove("todo", earlier));
		const earlierDeletedAt = (await get("todo", earlier)).deletedAt;

		await ok(remove("project", p));
		const deletedAt = (await get("project", p)).deletedAt;
		for (const [entity, id] of [
			["heading", h],
			["todo", t1],
			["todo", t2],
		] as const) {
			expect((await get(entity, id)).deletedAt).toBe(deletedAt);
		}

		await ok(upsert("project", p, { deletedAt: null }));
		for (const [entity, id] of [
			["project", p],
			["heading", h],
			["todo", t1],
			["todo", t2],
		] as const) {
			expect((await get(entity, id)).deletedAt).toBeNull();
		}
		expect((await get("todo", earlier)).deletedAt).toBe(earlierDeletedAt);
	});

	it("cascades an area delete through its projects", async () => {
		const [a, p, t] = [ulid(), ulid(), ulid()];
		await ok(
			upsert("area", a, {}),
			upsert("project", p, { areaId: a }),
			upsert("todo", t, { projectId: p }),
		);
		await ok(remove("area", a));
		expect((await get("todo", t)).deletedAt).not.toBeNull();
	});

	it("purges a to-do and its checklist, and tells clients", async () => {
		const [t, c] = [ulid(), ulid()];
		const created = await ok(
			upsert("todo", t, {}),
			upsert("checklist", c, { todoId: t, title: "step" }),
		);
		const result = await ok(remove("todo", t, "purge"));
		expect(result.purged).toEqual(
			expect.arrayContaining([
				{ entity: "todo", id: t },
				{ entity: "checklist", id: c },
			]),
		);
		const after = await pull(created.rev);
		expect(after.rows).toEqual([]);
		expect(after.purged).toHaveLength(2);
		expect(await all("todo")).toEqual([]);
	});

	it("strips a purged tag from items", async () => {
		const [tagId, keep, t] = [ulid(), ulid(), ulid()];
		await ok(
			upsert("tag", tagId, { title: "gone" }),
			upsert("tag", keep, { title: "kept" }),
			upsert("todo", t, { tagIds: [tagId, keep] }),
		);
		await ok(remove("tag", tagId, "purge"));
		expect((await get("todo", t)).tagIds).toEqual([keep]);
	});
});

describe("repeats", () => {
	const daily = (overrides: Partial<RepeatRule> = {}): RepeatRule => ({
		mode: "fixed",
		freq: "daily",
		interval: 1,
		nextDate: today(),
		...overrides,
	});

	it("materializes a due fixed template once and advances it", async () => {
		const [template, item] = [ulid(), ulid()];
		await ok(
			upsert("todo", template, {
				title: "Water plants",
				repeat: daily({ deadlineOffsetDays: 1 }),
			}),
			upsert("checklist", item, { todoId: template, title: "Ferns" }),
		);
		// The checklist is added after the template, so trigger another pass to copy it.
		await ok(upsert("todo", template, { notes: "both rooms" }));

		const instances = (await all("todo")).filter(
			(t) => t.repeatTemplateId === template,
		);
		expect(instances).toHaveLength(1);
		expect(instances[0]).toMatchObject({
			title: "Water plants",
			when: "scheduled",
			startDate: today(),
			deadline: addDays(today(), 1),
			repeat: null,
		});
		expect((await get("todo", template)).repeat?.nextDate).toBe(
			addDays(today(), 1),
		);
	});

	it("doesn't respawn an instance that was deleted", async () => {
		const template = ulid();
		await ok(upsert("todo", template, { repeat: daily() }));
		const instance = (await all("todo")).find(
			(t) => t.repeatTemplateId === template,
		);
		await ok(remove("todo", instance?.id as string));
		await ok(upsert("todo", template, { repeat: daily() }));
		const instances = (await all("todo")).filter(
			(t) => t.repeatTemplateId === template,
		);
		expect(instances).toHaveLength(1);
	});

	it("schedules an after-completion series from the completion day", async () => {
		const template = ulid();
		await ok(
			upsert("todo", template, {
				repeat: daily({ mode: "afterCompletion", interval: 3 }),
			}),
		);
		const instance = (await all("todo")).find(
			(t) => t.repeatTemplateId === template,
		);
		expect(instance).toMatchObject({ startDate: today() });

		await ok(upsert("todo", instance?.id as string, { status: "completed" }));
		expect((await get("todo", template)).repeat?.nextDate).toBe(
			addDays(today(), 3),
		);
		expect(
			(await all("todo")).filter((t) => t.repeatTemplateId === template),
		).toHaveLength(1);
	});

	it("copies a project template's headings and to-dos", async () => {
		const [template, heading, todo] = [ulid(), ulid(), ulid()];
		await ok(
			upsert("project", template, {
				title: "Weekly review",
				repeat: daily({ nextDate: addDays(today(), 1) }),
			}),
			upsert("heading", heading, { projectId: template, title: "Inbox zero" }),
			upsert("todo", todo, { headingId: heading, title: "Clear email" }),
		);
		await ok(upsert("project", template, { repeat: daily() }));

		const instance = (await all("project")).find(
			(p) => p.repeatTemplateId === template,
		);
		expect(instance).toMatchObject({
			title: "Weekly review",
			startDate: today(),
			repeat: null,
		});
		const headingCopy = (await all("heading")).find(
			(h) => h.projectId === instance?.id,
		);
		const todoCopy = (await all("todo")).find(
			(t) => t.projectId === instance?.id,
		);
		expect(headingCopy).toMatchObject({ title: "Inbox zero" });
		expect(todoCopy).toMatchObject({
			title: "Clear email",
			headingId: headingCopy?.id,
		});
	});

	it("parks an ended series past its end date", async () => {
		const template = ulid();
		await ok(upsert("todo", template, { repeat: daily({ endsOn: today() }) }));
		expect((await get("todo", template)).repeat?.nextDate).toBe(
			addDays(today(), 1),
		);
	});
});

describe("sync routes", () => {
	it("require a session", async () => {
		expect((await api("/sync/pull")).status).toBe(401);
		const res = await api("/sync/push", {
			method: "POST",
			body: { ops: [upsert("todo", ulid(), {})] },
		});
		expect(res.status).toBe(401);
	});

	it("validate the request", async () => {
		for (const body of [
			{ ops: [] },
			{ ops: "x" },
			{ ops: Array.from({ length: 101 }, () => ({})) },
		]) {
			expect(
				(await api("/sync/push", { method: "POST", cookie, body })).status,
			).toBe(400);
		}
		expect((await api("/sync/pull?since=-1", { cookie })).status).toBe(400);
	});
});
