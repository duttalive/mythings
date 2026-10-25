import { describe, expect, it } from "vitest";
import type { Todo } from "../../shared/schema";
import {
	anytime,
	areaView,
	daysUntilDeadline,
	type Entry,
	groupByProject,
	inbox,
	isEvening,
	isInToday,
	type LogbookCursor,
	logbook,
	projectProgress,
	projectView,
	sidebarCounts,
	sidebarTree,
	someday,
	tagged,
	today,
	trash,
	upcoming,
} from "../../shared/views";
import {
	area,
	ctx,
	data,
	done,
	heading,
	noon,
	project,
	rule,
	scheduled,
	TODAY,
	tag,
	todo,
} from "./fixtures";

const ids = (items: { id: string }[]) => items.map((i) => i.id);
const entryIds = (entries: Entry[]) => entries.map((e) => e.item.id);
const daily = { ...ctx, logbookTiming: "daily" as const };

describe("inbox", () => {
	it("lists open inbox to-dos by sort key", () => {
		const b = todo({ when: "inbox", sortKey: "b" });
		const a = todo({ when: "inbox", sortKey: "a" });
		const others = [
			todo({ when: "anytime" }),
			todo({ when: "inbox", ...done() }),
			todo({ when: "inbox", deletedAt: 1 }),
			todo({ when: "inbox", repeat: rule() }),
		];
		expect(ids(inbox(data({ todos: [b, ...others, a] }), ctx))).toEqual([
			a.id,
			b.id,
		]);
	});

	it("compares sort keys by code unit, not locale", () => {
		const upper = todo({ when: "inbox", sortKey: "Z" });
		const lower = todo({ when: "inbox", sortKey: "a" });
		expect(ids(inbox(data({ todos: [lower, upper] }), ctx))).toEqual([
			upper.id,
			lower.id,
		]);
	});

	it("keeps items completed today when the Logbook moves daily", () => {
		const today = todo({ when: "inbox", ...done(TODAY) });
		const yesterday = todo({ when: "inbox", ...done("2026-10-24") });
		const d = data({ todos: [today, yesterday] });
		expect(ids(inbox(d, daily))).toEqual([today.id]);
		expect(inbox(d, ctx)).toEqual([]);
	});
});

describe("today", () => {
	it("includes items started today or earlier", () => {
		const startsToday = todo(scheduled(TODAY));
		const rolledOver = todo(scheduled("2026-10-20"));
		const tomorrow = todo(scheduled("2026-10-26"));
		const view = today(
			data({ todos: [startsToday, rolledOver, tomorrow] }),
			ctx,
		);
		expect(entryIds(view.main).sort()).toEqual(
			[startsToday.id, rolledOver.id].sort(),
		);
	});

	it("includes items due today or overdue, whatever their When", () => {
		const dueToday = todo({ deadline: TODAY });
		const overdue = todo({ when: "someday", deadline: "2026-10-20" });
		const inboxDue = todo({ when: "inbox", deadline: TODAY });
		const dueLater = todo({ deadline: "2026-10-26" });
		const view = today(
			data({ todos: [dueToday, overdue, inboxDue, dueLater] }),
			ctx,
		);
		expect(entryIds(view.main).sort()).toEqual(
			[dueToday.id, overdue.id, inboxDue.id].sort(),
		);
	});

	it("excludes to-dos whose project is someday, finished, deleted or not started", () => {
		const active = project();
		const startedProject = project(scheduled("2026-10-01"));
		const parents = [
			project({ when: "someday" }),
			project(done()),
			project({ deletedAt: 1 }),
			project(scheduled("2026-11-01")),
		];
		const visible = [active, startedProject].map((p) =>
			todo({ projectId: p.id, ...scheduled(TODAY) }),
		);
		const hidden = parents.map((p) =>
			todo({ projectId: p.id, ...scheduled(TODAY) }),
		);
		const view = today(
			data({
				projects: [active, startedProject, ...parents],
				todos: [...visible, ...hidden],
			}),
			ctx,
		);
		// startedProject is itself in Today as a project entry; only compare to-dos here.
		const todoEntries = view.main.filter((e) => e.kind === "todo");
		expect(entryIds(todoEntries).sort()).toEqual(ids(visible).sort());
	});

	it("includes projects that are started or due", () => {
		const p = project(scheduled(TODAY));
		const due = project({ deadline: TODAY });
		const later = project(scheduled("2026-10-30"));
		const view = today(data({ projects: [p, due, later] }), ctx);
		expect(view.main.map((e) => e.kind)).toEqual(["project", "project"]);
		expect(entryIds(view.main).sort()).toEqual([p.id, due.id].sort());
	});

	it("splits This Evening, but only for items scheduled for today", () => {
		const evening = todo({ ...scheduled(TODAY), evening: true });
		const staleEvening = todo({ ...scheduled("2026-10-24"), evening: true });
		const view = today(data({ todos: [evening, staleEvening] }), ctx);
		expect(entryIds(view.evening)).toEqual([evening.id]);
		expect(entryIds(view.main)).toEqual([staleEvening.id]);
	});

	it("orders unplaced items first (oldest first), then by todaySortKey", () => {
		const placedB = todo({ ...scheduled(TODAY), todaySortKey: "b" });
		const placedA = todo({ ...scheduled(TODAY), todaySortKey: "a" });
		const newOld = todo(scheduled(TODAY));
		const newNew = todo(scheduled(TODAY));
		const view = today(
			data({ todos: [placedB, newNew, placedA, newOld] }),
			ctx,
		);
		expect(entryIds(view.main)).toEqual([
			newOld.id,
			newNew.id,
			placedA.id,
			placedB.id,
		]);
	});

	it("never shows repeat templates", () => {
		const template = todo({
			repeat: rule({ nextDate: TODAY }),
			deadline: TODAY,
		});
		expect(today(data({ todos: [template] }), ctx).main).toEqual([]);
	});
});

describe("upcoming", () => {
	it("always renders the next seven days", () => {
		const groups = upcoming(data(), ctx);
		expect(groups.map((g) => (g.kind === "day" ? g.date : g.kind))).toEqual([
			"2026-10-26",
			"2026-10-27",
			"2026-10-28",
			"2026-10-29",
			"2026-10-30",
			"2026-10-31",
			"2026-11-01",
		]);
	});

	it("places items by start date, then the rest of the month, then by month", () => {
		const tomorrow = todo(scheduled("2026-10-26"));
		const nov15 = todo(scheduled("2026-11-15"));
		const dec3 = todo(scheduled("2026-12-03"));
		const feb = todo(scheduled("2027-02-14"));
		const groups = upcoming(data({ todos: [feb, dec3, nov15, tomorrow] }), ctx);

		expect(groups[0]).toMatchObject({ kind: "day", date: "2026-10-26" });
		expect(groups[0]?.entries.map((e) => e.item.id)).toEqual([tomorrow.id]);
		expect(groups.slice(7)).toMatchObject([
			{
				kind: "restOfMonth",
				month: "2026-11",
				from: "2026-11-02",
				to: "2026-11-30",
			},
			{ kind: "month", month: "2026-12" },
			{ kind: "month", month: "2027-02" },
		]);
		expect(groups.slice(7).map((g) => g.entries.map((e) => e.item.id))).toEqual(
			[[nov15.id], [dec3.id], [feb.id]],
		);
	});

	it("skips the rest-of-month group when the seven days end on a month's last day", () => {
		const nov5 = todo(scheduled("2026-11-05"));
		const groups = upcoming(data({ todos: [nov5] }), {
			...ctx,
			today: "2026-10-24",
		});
		expect(groups.slice(7)).toMatchObject([
			{ kind: "month", month: "2026-11" },
		]);
	});

	it("shows repeat templates at their next date, flagged", () => {
		const template = todo({ repeat: rule({ nextDate: "2026-10-27" }) });
		const dueTemplate = todo({ repeat: rule({ nextDate: TODAY }) });
		const groups = upcoming(data({ todos: [template, dueTemplate] }), ctx);
		expect(groups[1]?.entries).toMatchObject([
			{ item: { id: template.id }, template: true },
		]);
		expect(groups.flatMap((g) => g.entries)).toHaveLength(1);
	});

	it("hides templates whose series has ended", () => {
		const ended = todo({
			repeat: rule({ nextDate: "2026-10-28", endsOn: "2026-10-27" }),
		});
		expect(
			upcoming(data({ todos: [ended] }), ctx).flatMap((g) => g.entries),
		).toEqual([]);
	});

	it("lists projects before to-dos on the same day", () => {
		const t = todo(scheduled("2026-10-28"));
		const p = project(scheduled("2026-10-28"));
		expect(
			upcoming(data({ todos: [t], projects: [p] }), ctx)[2]?.entries.map(
				(e) => e.kind,
			),
		).toEqual(["project", "todo"]);
	});

	it("leaves out finished, deleted and orphaned-by-finished-project items", () => {
		const finished = project(done());
		const items = [
			todo({ ...scheduled("2026-10-27"), ...done() }),
			todo({ ...scheduled("2026-10-27"), deletedAt: 1 }),
			todo({ ...scheduled("2026-10-27"), projectId: finished.id }),
		];
		expect(
			upcoming(data({ todos: items, projects: [finished] }), ctx).flatMap(
				(g) => g.entries,
			),
		).toEqual([]);
	});
});

describe("anytime", () => {
	it("includes anytime and started to-dos, but not inbox, someday or future ones", () => {
		const anytimeTodo = todo();
		const started = todo(scheduled("2026-10-20"));
		const hidden = [
			todo({ when: "inbox" }),
			todo({ when: "someday" }),
			todo(scheduled("2026-10-30")),
		];
		expect(
			ids(
				anytime(data({ todos: [anytimeTodo, started, ...hidden] }), ctx).todos,
			).sort(),
		).toEqual([anytimeTodo.id, started.id].sort());
	});

	it("groups loose to-dos, then projects without an area, then areas", () => {
		const work = area({ title: "Work", sortKey: "b" });
		const home = area({ title: "Home", sortKey: "a" });
		const site = project({ areaId: work.id });
		const solo = project();
		const looseTodo = todo();
		const homeTodo = todo({ areaId: home.id });
		const siteTodo = todo({ projectId: site.id });
		const soloTodo = todo({ projectId: solo.id });

		const view = anytime(
			data({
				areas: [work, home],
				projects: [site, solo],
				todos: [looseTodo, homeTodo, siteTodo, soloTodo],
			}),
			ctx,
		);
		expect(ids(view.todos)).toEqual([looseTodo.id]);
		expect(view.projects.map((g) => [g.project.id, ids(g.todos)])).toEqual([
			[solo.id, [soloTodo.id]],
		]);
		expect(view.areas.map((g) => g.area.id)).toEqual([home.id, work.id]);
		expect(ids(view.areas[0]?.todos ?? [])).toEqual([homeTodo.id]);
		expect(
			view.areas[1]?.projects.map((g) => [g.project.id, ids(g.todos)]),
		).toEqual([[site.id, [siteTodo.id]]]);
	});

	it("shows active projects even when empty, but not someday or unstarted ones", () => {
		const empty = project();
		const somedayProject = project({ when: "someday" });
		const future = project(scheduled("2026-11-01"));
		const futureTodo = todo({ projectId: future.id });
		const view = anytime(
			data({ projects: [empty, somedayProject, future], todos: [futureTodo] }),
			ctx,
		);
		expect(view.projects.map((g) => g.project.id)).toEqual([empty.id]);
	});

	it("orders project to-dos: no heading first, then by heading", () => {
		const p = project();
		const h2 = heading({ projectId: p.id, sortKey: "b" });
		const h1 = heading({ projectId: p.id, sortKey: "a" });
		const underH2 = todo({ projectId: p.id, headingId: h2.id, sortKey: "a" });
		const underH1 = todo({ projectId: p.id, headingId: h1.id, sortKey: "z" });
		const loose = todo({ projectId: p.id, sortKey: "m" });
		const view = anytime(
			data({
				projects: [p],
				headings: [h1, h2],
				todos: [underH2, underH1, loose],
			}),
			ctx,
		);
		expect(ids(view.projects[0]?.todos ?? [])).toEqual([
			loose.id,
			underH1.id,
			underH2.id,
		]);
	});
});

describe("someday", () => {
	it("shows someday projects without their to-dos, and someday to-dos elsewhere", () => {
		const later = project({ when: "someday" });
		const active = project();
		const insideLater = todo({ projectId: later.id, when: "someday" });
		const insideActive = todo({ projectId: active.id, when: "someday" });
		const loose = todo({ when: "someday" });
		const view = someday(
			data({
				projects: [later, active],
				todos: [insideLater, insideActive, loose],
			}),
			ctx,
		);
		expect(ids(view.todos)).toEqual([loose.id]);
		expect(
			view.projects.map((g) => [g.project.id, ids(g.todos)]).sort(),
		).toEqual(
			[
				[later.id, []],
				[active.id, [insideActive.id]],
			].sort(),
		);
	});
});

describe("logbook", () => {
	it("groups by local completion day, newest first", () => {
		const la = { ...ctx, tz: "America/Los_Angeles" };
		const late = todo({
			status: "completed",
			completedAt: Date.UTC(2026, 9, 25, 3),
		}); // Oct 24 in LA
		const recent = todo({
			status: "canceled",
			completedAt: Date.UTC(2026, 9, 25, 18),
		});
		const { groups } = logbook(data({ todos: [late, recent] }), la);
		expect(
			groups.map((g) => [g.date, g.entries.map((e) => e.item.id)]),
		).toEqual([
			["2026-10-25", [recent.id]],
			["2026-10-24", [late.id]],
		]);
	});

	it("files a finished project's to-dos under the project", () => {
		const p = project(done());
		const child = todo({ projectId: p.id, ...done() });
		const { groups } = logbook(data({ projects: [p], todos: [child] }), ctx);
		expect(groups[0]?.entries.map((e) => e.kind)).toEqual(["project"]);
	});

	it("paginates with a stable cursor, even across identical timestamps", () => {
		const same = noon("2026-10-20");
		const items = [
			todo({ status: "completed", completedAt: same }),
			todo({ status: "completed", completedAt: same }),
			todo({ status: "completed", completedAt: same }),
			todo(done("2026-10-21")),
			todo(done("2026-10-19")),
		];
		const d = data({ todos: items });
		const seen: string[] = [];
		let cursor: LogbookCursor | undefined;
		for (let page = 0; page < 10; page++) {
			const result = logbook(d, ctx, { limit: 2, before: cursor });
			seen.push(
				...result.groups.flatMap((g) => g.entries.map((e) => e.item.id)),
			);
			if (!result.nextCursor) break;
			cursor = result.nextCursor;
		}
		expect(seen).toHaveLength(5);
		expect(new Set(seen).size).toBe(5);
	});

	it("holds back today's completions when the Logbook moves daily", () => {
		const today = todo(done(TODAY));
		const yesterday = todo(done("2026-10-24"));
		const d = data({ todos: [today, yesterday] });
		expect(
			logbook(d, daily).groups.flatMap((g) => g.entries.map((e) => e.item.id)),
		).toEqual([yesterday.id]);
		expect(logbook(d, ctx).groups.flatMap((g) => g.entries)).toHaveLength(2);
	});
});

describe("trash", () => {
	it("lists only top-level deleted items, newest first", () => {
		const deletedProject = project({ deletedAt: 30 });
		const childOfDeleted = todo({
			projectId: deletedProject.id,
			deletedAt: 30,
		});
		const live = project();
		const deletedHeading = heading({ projectId: live.id, deletedAt: 20 });
		const underHeading = todo({
			projectId: live.id,
			headingId: deletedHeading.id,
			deletedAt: 20,
		});
		const loneTodo = todo({ deletedAt: 10 });
		const deletedArea = area({ deletedAt: 40 });
		const inArea = project({ areaId: deletedArea.id, deletedAt: 40 });

		const entries = trash(
			data({
				areas: [deletedArea],
				projects: [deletedProject, live, inArea],
				headings: [deletedHeading],
				todos: [childOfDeleted, underHeading, loneTodo],
			}),
		);
		expect(entries.map((e) => [e.kind, e.item.id])).toEqual([
			["area", deletedArea.id],
			["project", deletedProject.id],
			["heading", deletedHeading.id],
			["todo", loneTodo.id],
		]);
	});
});

describe("projectView", () => {
	it("shows loose to-dos, then headings, with archived headings and templates apart", () => {
		const p = project();
		const h = heading({ projectId: p.id, sortKey: "a" });
		const archived = heading({ projectId: p.id, sortKey: "b", archived: true });
		const loose = todo({ projectId: p.id });
		const underH = todo({ projectId: p.id, headingId: h.id });
		const archivedDone = todo({
			projectId: p.id,
			headingId: archived.id,
			...done("2026-10-01"),
		});
		const finished = todo({ projectId: p.id, ...done("2026-10-01") });
		const template = todo({ projectId: p.id, repeat: rule() });

		const view = projectView(
			data({
				projects: [p],
				headings: [h, archived],
				todos: [loose, underH, archivedDone, finished, template],
			}),
			p.id,
			ctx,
		);
		expect(ids(view?.todos ?? [])).toEqual([loose.id]);
		expect(view?.headings.map((g) => [g.heading.id, ids(g.todos)])).toEqual([
			[h.id, [underH.id]],
		]);
		expect(
			view?.archivedHeadings.map((g) => [g.heading.id, ids(g.todos)]),
		).toEqual([[archived.id, [archivedDone.id]]]);
		expect(ids(view?.templates ?? [])).toEqual([template.id]);
	});

	it("keeps today's completions visible when the Logbook moves daily", () => {
		const p = project();
		const finishedToday = todo({ projectId: p.id, ...done(TODAY) });
		const d = data({ projects: [p], todos: [finishedToday] });
		expect(ids(projectView(d, p.id, daily)?.todos ?? [])).toEqual([
			finishedToday.id,
		]);
		expect(projectView(d, p.id, ctx)?.todos).toEqual([]);
	});

	it("returns null for an unknown project", () => {
		expect(projectView(data(), "01JZZZZZZZZZZZZZZZZZZZZZZZ", ctx)).toBeNull();
	});
});

describe("projectProgress", () => {
	it("counts completed over open + completed, ignoring canceled, deleted and templates", () => {
		const p = project();
		const todos: Todo[] = [
			todo({ projectId: p.id }),
			todo({ projectId: p.id, ...done() }),
			todo({ projectId: p.id, status: "canceled", completedAt: 1 }),
			todo({ projectId: p.id, deletedAt: 1 }),
			todo({ projectId: p.id, repeat: rule() }),
			todo(),
		];
		expect(projectProgress(p.id, todos)).toEqual({ completed: 1, total: 2 });
	});
});

describe("areaView", () => {
	it("lists the area's projects with progress, then its loose to-dos", () => {
		const a = area();
		const p2 = project({ areaId: a.id, sortKey: "b" });
		const p1 = project({ areaId: a.id, sortKey: "a" });
		const inP1 = todo({ projectId: p1.id, ...done() });
		const loose = todo({ areaId: a.id });
		const elsewhere = todo();
		const view = areaView(
			data({ areas: [a], projects: [p2, p1], todos: [inP1, loose, elsewhere] }),
			a.id,
			ctx,
		);
		expect(view?.projects.map((x) => [x.project.id, x.progress])).toEqual([
			[p1.id, { completed: 1, total: 1 }],
			[p2.id, { completed: 0, total: 0 }],
		]);
		expect(ids(view?.todos ?? [])).toEqual([loose.id]);
	});
});

describe("tag filter", () => {
	const errands = tag({ title: "errands" });
	const shop = tag({ title: "shop", parentId: errands.id });
	const urgent = tag({ title: "urgent" });

	it("matches child tags when filtering by a parent", () => {
		const tagged = todo({ when: "inbox", tagIds: [shop.id] });
		const untagged = todo({ when: "inbox" });
		const d = data({
			tags: [errands, shop, urgent],
			todos: [tagged, untagged],
		});
		expect(ids(inbox(d, { ...ctx, tagIds: [errands.id] }))).toEqual([
			tagged.id,
		]);
		expect(inbox(d, { ...ctx, tagIds: [urgent.id] })).toEqual([]);
	});

	it("requires every selected tag", () => {
		const both = todo({ when: "inbox", tagIds: [shop.id, urgent.id] });
		const one = todo({ when: "inbox", tagIds: [urgent.id] });
		const d = data({ tags: [errands, shop, urgent], todos: [both, one] });
		expect(ids(inbox(d, { ...ctx, tagIds: [errands.id, urgent.id] }))).toEqual([
			both.id,
		]);
	});

	it("inherits tags from the project and area", () => {
		const a = area({ tagIds: [urgent.id] });
		const p = project({ areaId: a.id, tagIds: [shop.id] });
		const inProject = todo({ projectId: p.id });
		const d = data({
			tags: [errands, shop, urgent],
			areas: [a],
			projects: [p],
			todos: [inProject],
		});
		const view = anytime(d, { ...ctx, tagIds: [errands.id, urgent.id] });
		expect(view.areas[0]?.projects[0]?.todos.map((t) => t.id)).toEqual([
			inProject.id,
		]);
	});
});

describe("tagged", () => {
	it("lists open items with the tag or a descendant, inherited from projects", () => {
		const errands = tag({ title: "errands" });
		const shop = tag({ title: "shop", parentId: errands.id });
		const p = project({ tagIds: [errands.id] });
		const inProject = todo({ projectId: p.id });
		const loose = todo({ when: "inbox", tagIds: [shop.id] });
		const someday = todo({ when: "someday", tagIds: [errands.id] });
		const finished = todo({ tagIds: [errands.id], ...done() });
		const other = todo({ when: "inbox" });
		const d = data({
			tags: [errands, shop],
			projects: [p],
			todos: [inProject, loose, someday, finished, other],
		});
		const view = tagged(d, errands.id, ctx);
		expect(ids(view.todos).sort()).toEqual([loose.id, someday.id].sort());
		expect(view.projects.map((g) => g.project.id)).toEqual([p.id]);
		expect(ids(view.projects[0]?.todos ?? [])).toEqual([inProject.id]);
	});
});

describe("sidebarTree", () => {
	it("nests open projects under live areas, keeping empty areas", () => {
		const work = area({ title: "Work", sortKey: "a1" });
		const home = area({ title: "Home", sortKey: "a0" });
		const gone = area({ deletedAt: 1 });
		const inWork = project({ areaId: work.id });
		const loose = project({ sortKey: "a1" });
		const someday = project({ when: "someday", sortKey: "a2" });
		const d = data({
			areas: [work, home, gone],
			projects: [
				inWork,
				loose,
				someday,
				project({ ...done() }),
				project({ deletedAt: 1 }),
				project({ repeat: rule({ nextDate: "2026-11-01" }) }),
			],
		});
		const tree = sidebarTree(d);
		expect(ids(tree.projects)).toEqual([loose.id, someday.id]);
		expect(tree.areas.map((g) => g.area.id)).toEqual([home.id, work.id]);
		expect(ids(tree.areas[1]?.projects ?? [])).toEqual([inWork.id]);
		expect(tree.areas[0]?.projects).toEqual([]);
	});
});

describe("sidebarCounts", () => {
	it("counts open Inbox and Today items, and due ones, ignoring the tag filter", () => {
		const t = tag();
		const d = data({
			tags: [t],
			todos: [
				todo({ when: "inbox" }),
				todo({ when: "inbox", tagIds: [t.id] }),
				todo(scheduled(TODAY)),
				todo({ deadline: "2026-10-20" }),
				todo({ ...scheduled(TODAY), deadline: TODAY, evening: true }),
				todo({ ...scheduled(TODAY), ...done() }),
			],
		});
		expect(sidebarCounts(d, { ...daily, tagIds: [t.id] })).toEqual({
			inbox: 2,
			today: 3,
			due: 2,
		});
	});
});

describe("helpers", () => {
	it("isInToday, isEvening and daysUntilDeadline", () => {
		expect(isInToday(todo({ deadline: TODAY }), TODAY)).toBe(true);
		expect(isInToday(todo(scheduled("2026-10-26")), TODAY)).toBe(false);
		expect(isEvening(todo({ ...scheduled(TODAY), evening: true }), TODAY)).toBe(
			true,
		);
		expect(
			isEvening(todo({ ...scheduled("2026-10-24"), evening: true }), TODAY),
		).toBe(false);
		expect(daysUntilDeadline(todo({ deadline: "2026-10-22" }), TODAY)).toBe(-3);
		expect(daysUntilDeadline(todo({ deadline: TODAY }), TODAY)).toBe(0);
		expect(daysUntilDeadline(todo(), TODAY)).toBeNull();
	});
});

describe("groupByProject", () => {
	it("puts loose items first, then a group per project in order of appearance", () => {
		const p1 = project({ title: "One" });
		const p2 = project({ title: "Two" });
		const entries: Entry[] = [
			{ kind: "todo", item: todo({ projectId: p2.id }) },
			{ kind: "todo", item: todo() },
			{ kind: "project", item: p1 },
			{ kind: "todo", item: todo({ projectId: p1.id }) },
			{ kind: "todo", item: todo({ projectId: p2.id }) },
		];
		const groups = groupByProject(
			entries,
			new Map([p1, p2].map((p) => [p.id, p])),
		);
		expect(groups.map((g) => g.project?.title ?? null)).toEqual([
			null,
			"Two",
			"One",
		]);
		expect(groups.map((g) => g.entries.length)).toEqual([2, 2, 1]);
		// Projects scheduled for Today sit with the loose items, not inside their own group.
		expect(groups[0]?.entries.map((e) => e.kind)).toEqual(["todo", "project"]);
	});

	it("has no loose group when every to-do is in a project", () => {
		const p = project();
		const groups = groupByProject(
			[{ kind: "todo", item: todo({ projectId: p.id }) }],
			new Map([[p.id, p]]),
		);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.project).toBe(p);
	});
});
