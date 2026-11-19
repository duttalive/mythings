import { ulid } from "ulid";
import { describe, expect, it } from "vitest";
import type { ExportFile } from "../../shared/transfer";
import { api, PASSWORD, sessionCookie, signup } from "./helpers";

const NEW_PASSWORD = "a brand new passphrase";

async function login(email: string, password: string) {
	return api("/auth/login", { method: "POST", body: { email, password } });
}

describe("change password", () => {
	it("needs the current password", async () => {
		const { cookie } = await signup();
		const res = await api("/auth/password", {
			method: "POST",
			cookie,
			body: { currentPassword: "wrong one", newPassword: NEW_PASSWORD },
		});
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "wrong_password" });
	});

	it("limits current-password guesses per account, from any IP", async () => {
		const { cookie } = await signup();
		const attempt = () =>
			api("/auth/password", {
				method: "POST",
				cookie,
				body: { currentPassword: "wrong one", newPassword: NEW_PASSWORD },
			});
		for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(403);
		expect((await attempt()).status).toBe(429);
	});

	it("updates it and signs out other devices, keeping this one", async () => {
		const { cookie, email } = await signup();
		const other = sessionCookie(await login(email, PASSWORD));

		const res = await api("/auth/password", {
			method: "POST",
			cookie,
			body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
		});
		expect(res.status).toBe(200);

		expect((await api("/me", { cookie })).status).toBe(200);
		expect((await api("/me", { cookie: other })).status).toBe(401);
		expect((await login(email, PASSWORD)).status).toBe(401);
		expect((await login(email, NEW_PASSWORD)).status).toBe(200);
	});
});

describe("sign out of all devices", () => {
	it("ends every session", async () => {
		const { cookie, email } = await signup();
		const other = sessionCookie(await login(email, PASSWORD));
		const res = await api("/auth/logout-all", { method: "POST", cookie });
		expect(res.status).toBe(200);
		expect(res.headers.get("set-cookie")).toMatch(/mt_session=;/);
		expect((await api("/me", { cookie })).status).toBe(401);
		expect((await api("/me", { cookie: other })).status).toBe(401);
	});
});

describe("export and import", () => {
	function upsert(entity: string, entityId: string, patch: object) {
		return {
			opId: ulid(),
			entity,
			entityId,
			kind: "upsert",
			patch,
			clientTs: Date.now(),
		};
	}

	async function seed(cookie: string) {
		const ids = {
			tag: ulid(),
			bucket: ulid(),
			area: ulid(),
			project: ulid(),
			heading: ulid(),
			todo: ulid(),
			step: ulid(),
			trashed: ulid(),
		};
		const res = await api("/sync/push", {
			method: "POST",
			cookie,
			body: {
				ops: [
					upsert("tag", ids.tag, { title: "Errands" }),
					upsert("area", ids.bucket, { title: "Home", kind: "bucket" }),
					upsert("area", ids.area, { title: "Chores", bucketId: ids.bucket }),
					upsert("project", ids.project, {
						title: "Move",
						areaId: ids.bucket,
					}),
					upsert("heading", ids.heading, {
						title: "Packing",
						projectId: ids.project,
					}),
					upsert("todo", ids.todo, {
						title: "Buy boxes",
						projectId: ids.project,
						headingId: ids.heading,
						tagIds: [ids.tag],
						notes: "big ones",
					}),
					upsert("checklist", ids.step, { title: "Tape", todoId: ids.todo }),
					upsert("todo", ids.trashed, { title: "Old" }),
					{
						opId: ulid(),
						entity: "todo",
						entityId: ids.trashed,
						kind: "delete",
						clientTs: Date.now(),
					},
				],
			},
		});
		expect((await res.json<{ errors: unknown[] }>()).errors).toEqual([]);
		return ids;
	}

	it("exports every row as a download", async () => {
		const { cookie } = await signup();
		const ids = await seed(cookie);
		const res = await api("/export", { cookie });
		expect(res.status).toBe(200);
		expect(res.headers.get("content-disposition")).toMatch(
			/attachment; filename="mythings-\d{4}-\d{2}-\d{2}\.json"/,
		);
		const file = await res.json<ExportFile>();
		expect(file).toMatchObject({ format: "mythings-export", version: 2 });
		expect(file.data.todo.map((t) => t.id).sort()).toEqual(
			[ids.todo, ids.trashed].sort(),
		);
		expect(file.data.checklist).toHaveLength(1);
	});

	it("imports into another account with fresh ids and intact references", async () => {
		const source = await signup();
		await seed(source.cookie);
		const file = await (await api("/export", { cookie: source.cookie })).json();

		const target = await signup();
		const res = await api("/import", {
			method: "POST",
			cookie: target.cookie,
			body: file,
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ imported: 7, skipped: 1, errors: [] });

		const copy = await (
			await api("/export", { cookie: target.cookie })
		).json<ExportFile>();
		const [todo] = copy.data.todo;
		const [project] = copy.data.project;
		expect(todo).toMatchObject({
			title: "Buy boxes",
			notes: "big ones",
			projectId: project?.id,
			headingId: copy.data.heading[0]?.id,
			tagIds: [copy.data.tag[0]?.id],
		});
		const bucket = copy.data.area.find((a) => a.kind === "bucket");
		const area = copy.data.area.find((a) => a.kind === "area");
		expect(bucket?.title).toBe("Home");
		expect(project?.areaId).toBe(bucket?.id);
		expect(area).toMatchObject({ title: "Chores", bucketId: bucket?.id });
		expect(copy.data.checklist[0]?.todoId).toBe(todo?.id);
	});

	it("adds copies when importing into the same account, reusing tags", async () => {
		const { cookie } = await signup();
		await seed(cookie);
		const file = await (await api("/export", { cookie })).json();
		await api("/import", { method: "POST", cookie, body: file });
		const after = await (await api("/export", { cookie })).json<ExportFile>();
		expect(after.data.todo.filter((t) => t.title === "Buy boxes")).toHaveLength(
			2,
		);
		expect(after.data.tag).toHaveLength(1);
	});

	it("converts an export from before Life Buckets", async () => {
		const { cookie } = await signup();
		const now = Date.now();
		const row = (id: string, fields: object) => ({
			id,
			createdAt: now,
			updatedAt: now,
			deletedAt: null,
			rev: 1,
			...fields,
		});
		const [work, home, launch, loose, inWork, atHome] = [
			ulid(),
			ulid(),
			ulid(),
			ulid(),
			ulid(),
			ulid(),
		];
		const file = {
			format: "mythings-export",
			version: 1,
			data: {
				tag: [],
				area: [
					row(work, {
						title: "Work",
						sortKey: "a0",
						tagIds: [],
						collapsed: false,
					}),
					row(home, {
						title: "Home",
						sortKey: "a1",
						tagIds: [],
						collapsed: false,
					}),
				],
				project: [
					row(launch, {
						title: "Launch",
						areaId: work,
						when: "anytime",
						status: "open",
						notes: "",
						sortKey: "a0",
						tagIds: [],
					}),
				],
				heading: [],
				todo: [
					row(loose, {
						title: "Loose",
						when: "anytime",
						status: "open",
						notes: "",
						sortKey: "a0",
						tagIds: [],
					}),
					row(inWork, {
						title: "Inbox zero",
						areaId: work,
						when: "anytime",
						status: "open",
						notes: "",
						sortKey: "a0",
						tagIds: [],
					}),
					row(atHome, {
						title: "Water plants",
						areaId: home,
						when: "anytime",
						status: "open",
						notes: "",
						sortKey: "a0",
						tagIds: [],
					}),
				],
				checklist: [],
			},
		};
		const res = await api("/import", { method: "POST", cookie, body: file });
		expect(await res.json()).toMatchObject({ skipped: 0, errors: [] });
		const copy = await (await api("/export", { cookie })).json<ExportFile>();
		const byTitle = (rows: { title: string }[], title: string) =>
			rows.find((r) => r.title === title) as never as Record<string, unknown>;
		const buckets = copy.data.area.filter((a) => a.kind === "bucket");
		const workBucket = byTitle(buckets, "Work");
		// "Work" held a project, so it's a Life Bucket; its own to-do moved into a "Work" area.
		expect(byTitle(copy.data.project, "Launch").areaId).toBe(workBucket.id);
		const workArea = copy.data.area.find(
			(a) => a.kind === "area" && a.title === "Work",
		);
		expect(workArea?.bucketId).toBe(workBucket.id);
		expect(byTitle(copy.data.todo, "Inbox zero").areaId).toBe(workArea?.id);
		// "Home" had no projects: it stays an area, in the first bucket.
		const homeArea = byTitle(copy.data.area, "Home");
		expect(homeArea).toMatchObject({ kind: "area", bucketId: workBucket.id });
		expect(byTitle(copy.data.todo, "Water plants").areaId).toBe(homeArea.id);
	});

	it("rejects files that aren't mythings exports", async () => {
		const { cookie } = await signup();
		const res = await api("/import", {
			method: "POST",
			cookie,
			body: { hello: "world" },
		});
		expect(res.status).toBe(400);
	});

	it("needs a session", async () => {
		expect((await api("/export")).status).toBe(401);
		expect((await api("/auth/config")).status).toBe(200);
	});
});

describe("PATCH /me", () => {
	it("hands the new time zone to the user's store", async () => {
		const { cookie } = await signup();
		const res = await api("/me", {
			method: "PATCH",
			cookie,
			body: { tz: "Asia/Tokyo", settings: { weekStart: 0, theme: "dark" } },
		});
		expect(await res.json()).toMatchObject({
			tz: "Asia/Tokyo",
			settings: { weekStart: 0, theme: "dark" },
		});
	});
});
