// Derived lists (SPEC §6). Pure functions from entity arrays to view models;
// the client runs them against its local copy of the data.

import {
	addDays,
	diffDays,
	type LocalDate,
	lastDayOfMonth,
	localDateOf,
	monthOf,
} from "./dates";
import type { Area, Heading, Project, Tag, Todo } from "./schema";

export type ViewData = {
	areas: Area[];
	projects: Project[];
	headings: Heading[];
	todos: Todo[];
	tags: Tag[];
};

export type ViewContext = {
	today: LocalDate;
	tz: string;
	/**
	 * "immediately" (default): completed items leave their lists for the Logbook.
	 * "daily": items completed today stay in their lists (struck through) and
	 * reach the Logbook tomorrow.
	 */
	logbookTiming?: "immediately" | "daily";
	/** Only include items carrying all of these tags (or a descendant of each). */
	tagIds?: string[];
};

type Item = Todo | Project;

// ---------------------------------------------------------------------------
// Ordering

type Sortable = { id: string; sortKey: string };

// Fractional-index keys must be compared by code unit, not with localeCompare.
function compareStrings(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

export function bySortKey(a: Sortable, b: Sortable): number {
	return compareStrings(a.sortKey, b.sortKey) || compareStrings(a.id, b.id);
}

/** Today's manual order. Items that have never been placed in Today come first, oldest first. */
function byTodayOrder(a: Item, b: Item): number {
	if (a.todaySortKey === null || b.todaySortKey === null) {
		if (a.todaySortKey !== b.todaySortKey)
			return a.todaySortKey === null ? -1 : 1;
		return a.createdAt - b.createdAt || compareStrings(a.id, b.id);
	}
	return (
		compareStrings(a.todaySortKey, b.todaySortKey) || compareStrings(a.id, b.id)
	);
}

// ---------------------------------------------------------------------------
// Predicates

export function isOpen(item: Item): boolean {
	return (
		item.status === "open" && item.deletedAt === null && item.repeat === null
	);
}

function completedToday(item: Item, ctx: ViewContext): boolean {
	return (
		item.completedAt !== null &&
		localDateOf(item.completedAt, ctx.tz) === ctx.today
	);
}

/** In the Logbook: done or canceled, and past the "daily" grace period if that's on. */
export function isLogged(item: Item, ctx: ViewContext): boolean {
	return (
		item.deletedAt === null &&
		item.repeat === null &&
		item.status !== "open" &&
		item.completedAt !== null &&
		!(ctx.logbookTiming === "daily" && completedToday(item, ctx))
	);
}

/** Newest completed first. */
const byCompletedDesc = (a: Item, b: Item) =>
	(b.completedAt ?? 0) - (a.completedAt ?? 0) || compareStrings(b.id, a.id);

/** Shown in the regular lists: open, or completed today when the Logbook moves daily. */
function isListed(item: Item, ctx: ViewContext): boolean {
	if (item.deletedAt !== null || item.repeat !== null) return false;
	if (item.status === "open") return true;
	return ctx.logbookTiming === "daily" && completedToday(item, ctx);
}

function startedBy(item: Item, today: LocalDate): boolean {
	return (
		item.when === "scheduled" &&
		item.startDate !== null &&
		item.startDate <= today
	);
}

function dueBy(item: Item, today: LocalDate): boolean {
	return item.deadline !== null && item.deadline <= today;
}

/** A project whose to-dos can show in Today and Anytime. */
function isActiveProject(project: Project, today: LocalDate): boolean {
	return (
		isOpen(project) && (project.when === "anytime" || startedBy(project, today))
	);
}

/** Whether the item belongs in Today (ignoring its parent project); drives the ★ in other lists. */
export function isInToday(item: Item, today: LocalDate): boolean {
	return startedBy(item, today) || dueBy(item, today);
}

/** Evening only applies on the day the item is scheduled for. */
export function isEvening(item: Item, today: LocalDate): boolean {
	return item.evening && item.when === "scheduled" && item.startDate === today;
}

/** Days until the deadline: 0 = due today, negative = overdue by that many days. */
export function daysUntilDeadline(item: Item, today: LocalDate): number | null {
	return item.deadline === null ? null : diffDays(today, item.deadline);
}

// ---------------------------------------------------------------------------
// Lookup and tag filtering

type Index = {
	projects: Map<string, Project>;
	areas: Map<string, Area>;
	headings: Map<string, Heading>;
};

function buildIndex(data: ViewData): Index {
	return {
		projects: new Map(data.projects.map((p) => [p.id, p])),
		areas: new Map(data.areas.map((a) => [a.id, a])),
		headings: new Map(data.headings.map((h) => [h.id, h])),
	};
}

function projectOf(todo: Todo, idx: Index): Project | undefined {
	return todo.projectId ? idx.projects.get(todo.projectId) : undefined;
}

/** Item tags plus those inherited from its project and area. */
function effectiveTags(item: Item, idx: Index): string[] {
	const project = "projectId" in item ? projectOf(item, idx) : undefined;
	const areaId = project ? project.areaId : item.areaId;
	const area = areaId ? idx.areas.get(areaId) : undefined;
	return [...item.tagIds, ...(project?.tagIds ?? []), ...(area?.tagIds ?? [])];
}

function tagMatcher(
	tags: Tag[],
	selected: string[],
): (tagIds: string[]) => boolean {
	const children = new Map<string, string[]>();
	for (const tag of tags) {
		if (tag.parentId && tag.deletedAt === null) {
			children.set(tag.parentId, [
				...(children.get(tag.parentId) ?? []),
				tag.id,
			]);
		}
	}
	const withDescendants = selected.map((id) => {
		const set = new Set<string>();
		const stack = [id];
		while (stack.length > 0) {
			const next = stack.pop() as string;
			if (set.has(next)) continue;
			set.add(next);
			stack.push(...(children.get(next) ?? []));
		}
		return set;
	});
	return (tagIds) =>
		withDescendants.every((set) => tagIds.some((t) => set.has(t)));
}

/** The index (over all data) and the to-dos and projects that pass the tag filter. */
function prepare(data: ViewData, ctx: ViewContext) {
	const idx = buildIndex(data);
	if (!ctx.tagIds?.length)
		return { idx, todos: data.todos, projects: data.projects };
	const matches = tagMatcher(data.tags, ctx.tagIds);
	return {
		idx,
		todos: data.todos.filter((t) => matches(effectiveTags(t, idx))),
		projects: data.projects.filter((p) => matches(effectiveTags(p, idx))),
	};
}

// ---------------------------------------------------------------------------
// Grouping by area → project (Anytime, Someday)

export type ProjectGroup = { project: Project; todos: Todo[] };
export type AreaGroup = { area: Area; todos: Todo[]; projects: ProjectGroup[] };
/** Loose to-dos first, then projects without an area, then each area. */
export type GroupedList = {
	todos: Todo[];
	projects: ProjectGroup[];
	areas: AreaGroup[];
};

/** Project order: to-dos without a heading first, then by heading order. */
function byProjectOrder(idx: Index) {
	return (a: Todo, b: Todo): number => {
		const ha = a.headingId ? idx.headings.get(a.headingId) : undefined;
		const hb = b.headingId ? idx.headings.get(b.headingId) : undefined;
		if (ha !== hb) {
			if (!ha) return -1;
			if (!hb) return 1;
			return bySortKey(ha, hb);
		}
		return bySortKey(a, b);
	};
}

function liveArea(id: string | null, idx: Index): Area | undefined {
	const area = id ? idx.areas.get(id) : undefined;
	return area && area.deletedAt === null ? area : undefined;
}

function groupByArea(
	todos: Todo[],
	projects: Project[],
	idx: Index,
): GroupedList {
	const projectGroups = new Map<string, ProjectGroup>();
	for (const project of projects)
		projectGroups.set(project.id, { project, todos: [] });

	const loose: Todo[] = [];
	const areaLoose = new Map<string, Todo[]>();
	for (const todo of todos) {
		const project = projectOf(todo, idx);
		if (project) {
			let group = projectGroups.get(project.id);
			if (!group) {
				group = { project, todos: [] };
				projectGroups.set(project.id, group);
			}
			group.todos.push(todo);
		} else if (liveArea(todo.areaId, idx)) {
			const areaId = todo.areaId as string;
			areaLoose.set(areaId, [...(areaLoose.get(areaId) ?? []), todo]);
		} else {
			loose.push(todo);
		}
	}

	const order = byProjectOrder(idx);
	const rootProjects: ProjectGroup[] = [];
	const areaProjects = new Map<string, ProjectGroup[]>();
	for (const group of projectGroups.values()) {
		group.todos.sort(order);
		const area = liveArea(group.project.areaId, idx);
		if (area)
			areaProjects.set(area.id, [...(areaProjects.get(area.id) ?? []), group]);
		else rootProjects.push(group);
	}

	const byProject = (a: ProjectGroup, b: ProjectGroup) =>
		bySortKey(a.project, b.project);
	const areaIds = new Set([...areaLoose.keys(), ...areaProjects.keys()]);
	const areas = [...areaIds]
		.map((id) => idx.areas.get(id) as Area)
		.sort(bySortKey)
		.map((area) => ({
			area,
			todos: (areaLoose.get(area.id) ?? []).sort(bySortKey),
			projects: (areaProjects.get(area.id) ?? []).sort(byProject),
		}));

	return {
		todos: loose.sort(bySortKey),
		projects: rootProjects.sort(byProject),
		areas,
	};
}

// ---------------------------------------------------------------------------
// Lists

export function inbox(data: ViewData, ctx: ViewContext): Todo[] {
	const { todos } = prepare(data, ctx);
	return todos
		.filter((t) => isListed(t, ctx) && t.when === "inbox")
		.sort(bySortKey);
}

export type Entry =
	| { kind: "todo"; item: Todo }
	| { kind: "project"; item: Project };
export type TodayView = { main: Entry[]; evening: Entry[] };

export function today(data: ViewData, ctx: ViewContext): TodayView {
	const { idx, todos, projects } = prepare(data, ctx);
	const entries: Entry[] = [
		...projects
			.filter((p) => isListed(p, ctx) && isInToday(p, ctx.today))
			.map((item) => ({ kind: "project" as const, item })),
		...todos
			.filter((t) => {
				if (!isListed(t, ctx) || !isInToday(t, ctx.today)) return false;
				const project = projectOf(t, idx);
				return !project || isActiveProject(project, ctx.today);
			})
			.map((item) => ({ kind: "todo" as const, item })),
	].sort((a, b) => byTodayOrder(a.item, b.item));

	return {
		main: entries.filter((e) => !isEvening(e.item, ctx.today)),
		evening: entries.filter((e) => isEvening(e.item, ctx.today)),
	};
}

export type TodayGroup = { project: Project | null; entries: Entry[] };

/**
 * Today's entries grouped under their projects ("Group to-dos in Today by
 * project", SPEC §10.9): loose items first, then one group per project in the
 * order its first to-do appears.
 */
export function groupByProject(
	entries: Entry[],
	projects: ReadonlyMap<string, Project>,
): TodayGroup[] {
	const loose: Entry[] = [];
	const groups = new Map<string, TodayGroup>();
	for (const entry of entries) {
		const project =
			entry.kind === "todo" && entry.item.projectId
				? projects.get(entry.item.projectId)
				: undefined;
		if (!project) {
			loose.push(entry);
			continue;
		}
		const group = groups.get(project.id) ?? { project, entries: [] };
		group.entries.push(entry);
		groups.set(project.id, group);
	}
	return [
		...(loose.length > 0 ? [{ project: null, entries: loose }] : []),
		...groups.values(),
	];
}

export type UpcomingEntry = Entry & { date: LocalDate; template: boolean };
export type UpcomingGroup =
	| { kind: "day"; date: LocalDate; entries: UpcomingEntry[] }
	| {
			kind: "restOfMonth";
			month: string;
			from: LocalDate;
			to: LocalDate;
			entries: UpcomingEntry[];
	  }
	| { kind: "month"; month: string; entries: UpcomingEntry[] };

/** Number of days after today that get their own header. */
export const UPCOMING_DAYS = 7;

/**
 * Future scheduled items plus repeat templates at their next date. The next
 * seven days always render (even empty), then the rest of the month that the
 * seventh day falls in, then one group per month that has items.
 */
export function upcoming(data: ViewData, ctx: ViewContext): UpcomingGroup[] {
	const { idx, todos, projects } = prepare(data, ctx);
	const date = (item: Item): LocalDate | null => {
		if (item.deletedAt !== null || item.status !== "open") return null;
		const rule = item.repeat;
		if (rule?.endsOn && rule.nextDate > rule.endsOn) return null; // series has ended
		const d = rule
			? rule.nextDate
			: item.when === "scheduled"
				? item.startDate
				: null;
		return d !== null && d > ctx.today ? d : null;
	};
	const parentOk = (t: Todo) => {
		const project = projectOf(t, idx);
		return (
			!project || (project.deletedAt === null && project.status === "open")
		);
	};

	const entries: UpcomingEntry[] = [];
	for (const item of projects) {
		const d = date(item);
		if (d)
			entries.push({
				kind: "project",
				item,
				date: d,
				template: item.repeat !== null,
			});
	}
	for (const item of todos) {
		const d = date(item);
		if (d && parentOk(item)) {
			entries.push({
				kind: "todo",
				item,
				date: d,
				template: item.repeat !== null,
			});
		}
	}
	entries.sort(
		(a, b) =>
			compareStrings(a.date, b.date) ||
			(a.kind === b.kind ? 0 : a.kind === "project" ? -1 : 1) ||
			bySortKey(a.item, b.item),
	);

	const groups: UpcomingGroup[] = [];
	for (let i = 1; i <= UPCOMING_DAYS; i++) {
		const day = addDays(ctx.today, i);
		groups.push({
			kind: "day",
			date: day,
			entries: entries.filter((e) => e.date === day),
		});
	}

	const lastDay = addDays(ctx.today, UPCOMING_DAYS);
	const restFrom = addDays(lastDay, 1);
	const restTo = lastDayOfMonth(lastDay);
	const later = entries.filter((e) => e.date > lastDay);
	if (restFrom <= restTo) {
		const rest = later.filter((e) => e.date <= restTo);
		if (rest.length > 0) {
			groups.push({
				kind: "restOfMonth",
				month: monthOf(lastDay),
				from: restFrom,
				to: restTo,
				entries: rest,
			});
		}
	}
	const months = new Map<string, UpcomingEntry[]>();
	for (const entry of later.filter((e) => e.date > restTo)) {
		const month = monthOf(entry.date);
		months.set(month, [...(months.get(month) ?? []), entry]);
	}
	for (const [month, monthEntries] of months) {
		groups.push({ kind: "month", month, entries: monthEntries });
	}
	return groups;
}

/** Things you could do now: anytime to-dos and started scheduled ones, in active projects. */
export function anytime(data: ViewData, ctx: ViewContext): GroupedList {
	const { idx, todos, projects } = prepare(data, ctx);
	const activeProjects = projects.filter((p) => isActiveProject(p, ctx.today));
	const visible = todos.filter((t) => {
		if (!isListed(t, ctx) || !(t.when === "anytime" || startedBy(t, ctx.today)))
			return false;
		const project = projectOf(t, idx);
		return !project || isActiveProject(project, ctx.today);
	});
	return groupByArea(visible, activeProjects, idx);
}

/**
 * Someday projects (shown as projects, without their to-dos) and someday
 * to-dos that sit outside them.
 */
export function someday(data: ViewData, ctx: ViewContext): GroupedList {
	const { idx, todos, projects } = prepare(data, ctx);
	const somedayProjects = projects.filter(
		(p) => isListed(p, ctx) && p.when === "someday",
	);
	const visible = todos.filter((t) => {
		if (!isListed(t, ctx) || t.when !== "someday") return false;
		const project = projectOf(t, idx);
		return !project || (isOpen(project) && project.when !== "someday");
	});
	return groupByArea(visible, somedayProjects, idx);
}

/** Open to-dos and projects carrying a tag (or a descendant), grouped by area → project. */
export function tagged(
	data: ViewData,
	tagId: string,
	ctx: ViewContext,
): GroupedList {
	const { idx, todos, projects } = prepare(data, { ...ctx, tagIds: [tagId] });
	return groupByArea(
		todos.filter((t) => isListed(t, ctx)),
		projects.filter((p) => isListed(p, ctx)),
		idx,
	);
}

export type TagView = {
	/** Open items with the tag or one nested in it, as in Anytime. */
	list: GroupedList;
	/** Repeating to-dos and projects, soonest next date first. */
	templates: Entry[];
	/** Its items in the Logbook, newest first; a logged project carries its to-dos. */
	logged: Entry[];
};

export function tagView(
	data: ViewData,
	tagId: string,
	ctx: ViewContext,
): TagView {
	const { todos, projects } = prepare(data, { ...ctx, tagIds: [tagId] });
	const live = <T extends Item>(items: T[]) =>
		items.filter((i) => i.deletedAt === null);
	const loggedProjects = projects.filter((p) => isLogged(p, ctx));
	const loggedProjectIds = new Set(loggedProjects.map((p) => p.id));
	const nextDate = (e: Entry) => e.item.repeat?.nextDate ?? "";
	return {
		list: tagged(data, tagId, ctx),
		templates: [
			...live(todos)
				.filter((t) => t.repeat !== null)
				.map((item) => ({ kind: "todo" as const, item })),
			...live(projects)
				.filter((p) => p.repeat !== null)
				.map((item) => ({ kind: "project" as const, item })),
		].sort(
			(a, b) =>
				compareStrings(nextDate(a), nextDate(b)) || bySortKey(a.item, b.item),
		),
		logged: [
			...loggedProjects.map((item) => ({ kind: "project" as const, item })),
			...todos
				.filter(
					(t) =>
						isLogged(t, ctx) &&
						!(t.projectId && loggedProjectIds.has(t.projectId)),
				)
				.map((item) => ({ kind: "todo" as const, item })),
		].sort((a, b) => byCompletedDesc(a.item, b.item)),
	};
}

export type LogbookEntry = Entry & { completedAt: number };
export type LogbookGroup = { date: LocalDate; entries: LogbookEntry[] };
export type LogbookCursor = { completedAt: number; id: string };

/**
 * Completed and canceled items, newest first, grouped by local completion
 * day. To-dos of a logged project appear under the project, not on their own.
 */
export function logbook(
	data: ViewData,
	ctx: ViewContext,
	{ limit = 100, before }: { limit?: number; before?: LogbookCursor } = {},
): { groups: LogbookGroup[]; nextCursor: LogbookCursor | null } {
	const { idx, todos, projects } = prepare(data, ctx);
	const logged = (item: Item) => isLogged(item, ctx);

	const entries: LogbookEntry[] = [
		...projects.filter(logged).map((item) => ({
			kind: "project" as const,
			item,
			completedAt: item.completedAt as number,
		})),
		...todos
			.filter((t) => {
				if (!logged(t)) return false;
				const project = projectOf(t, idx);
				return !project || !logged(project);
			})
			.map((item) => ({
				kind: "todo" as const,
				item,
				completedAt: item.completedAt as number,
			})),
	]
		.filter(
			(e) =>
				!before ||
				e.completedAt < before.completedAt ||
				(e.completedAt === before.completedAt && e.item.id < before.id),
		)
		.sort(
			(a, b) =>
				b.completedAt - a.completedAt || compareStrings(b.item.id, a.item.id),
		);

	const page = entries.slice(0, limit);
	const groups: LogbookGroup[] = [];
	for (const entry of page) {
		const date = localDateOf(entry.completedAt, ctx.tz);
		const last = groups.at(-1);
		if (last?.date === date) last.entries.push(entry);
		else groups.push({ date, entries: [entry] });
	}
	const lastEntry = page.at(-1);
	return {
		groups,
		nextCursor:
			entries.length > limit && lastEntry
				? { completedAt: lastEntry.completedAt, id: lastEntry.item.id }
				: null,
	};
}

export type TrashEntry =
	| { kind: "area"; item: Area }
	| { kind: "project"; item: Project }
	| { kind: "heading"; item: Heading }
	| { kind: "todo"; item: Todo };

/** Deleted items, newest first. Children of a deleted parent are restored with it, so only the parent is listed. */
export function trash(data: ViewData): TrashEntry[] {
	const idx = buildIndex(data);
	const deleted = (x: { deletedAt: number | null } | undefined) =>
		x !== undefined && x.deletedAt !== null;
	const area = (id: string | null) => (id ? idx.areas.get(id) : undefined);

	const entries: TrashEntry[] = [
		...data.areas
			.filter(deleted)
			.map((item) => ({ kind: "area" as const, item })),
		...data.projects
			.filter((p) => deleted(p) && !deleted(area(p.areaId)))
			.map((item) => ({ kind: "project" as const, item })),
		...data.headings
			.filter((h) => deleted(h) && !deleted(idx.projects.get(h.projectId)))
			.map((item) => ({ kind: "heading" as const, item })),
		...data.todos
			.filter((t) => {
				if (!deleted(t)) return false;
				const project = projectOf(t, idx);
				const heading = t.headingId ? idx.headings.get(t.headingId) : undefined;
				return (
					!deleted(project) &&
					!deleted(heading) &&
					!deleted(area(project ? project.areaId : t.areaId))
				);
			})
			.map((item) => ({ kind: "todo" as const, item })),
	];
	return entries.sort(
		(a, b) =>
			(b.item.deletedAt as number) - (a.item.deletedAt as number) ||
			compareStrings(a.item.id, b.item.id),
	);
}

export type Progress = { completed: number; total: number };

/** Completed ÷ (open + completed) over the project's to-dos; canceled ones don't count. */
export function projectProgress(projectId: string, todos: Todo[]): Progress {
	let completed = 0;
	let total = 0;
	for (const t of todos) {
		if (t.projectId !== projectId || t.deletedAt !== null || t.repeat !== null)
			continue;
		if (t.status === "canceled") continue;
		total++;
		if (t.status === "completed") completed++;
	}
	return { completed, total };
}

export type HeadingGroup = { heading: Heading; todos: Todo[] };
export type ProjectView = {
	project: Project;
	progress: Progress;
	todos: Todo[];
	headings: HeadingGroup[];
	/** Archived headings keep all their to-dos, done or not. */
	archivedHeadings: HeadingGroup[];
	/** Repeat templates in this project. */
	templates: Todo[];
	/** Its to-dos in the Logbook, newest first (not those under archived headings, which show there). */
	logged: Todo[];
};

export function projectView(
	data: ViewData,
	projectId: string,
	ctx: ViewContext,
): ProjectView | null {
	const { idx, todos } = prepare(data, ctx);
	const project = idx.projects.get(projectId);
	if (!project) return null;

	const inProject = todos.filter(
		(t) => t.projectId === projectId && t.deletedAt === null,
	);
	const headings = data.headings
		.filter((h) => h.projectId === projectId && h.deletedAt === null)
		.sort(bySortKey);
	const listed = inProject.filter((t) => isListed(t, ctx));
	const under = (heading: Heading, pool: Todo[]) =>
		pool.filter((t) => t.headingId === heading.id).sort(bySortKey);

	return {
		project,
		progress: projectProgress(projectId, data.todos),
		todos: listed
			.filter((t) => !t.headingId || !idx.headings.has(t.headingId))
			.sort(bySortKey),
		headings: headings
			.filter((h) => !h.archived)
			.map((heading) => ({ heading, todos: under(heading, listed) })),
		archivedHeadings: headings
			.filter((h) => h.archived)
			.map((heading) => ({
				heading,
				todos: under(
					heading,
					inProject.filter((t) => t.repeat === null),
				),
			})),
		templates: inProject.filter((t) => t.repeat !== null).sort(bySortKey),
		logged: inProject
			.filter(
				(t) =>
					isLogged(t, ctx) &&
					!(t.headingId && idx.headings.get(t.headingId)?.archived),
			)
			.sort(byCompletedDesc),
	};
}

export type AreaView = {
	area: Area;
	projects: { project: Project; progress: Progress }[];
	todos: Todo[];
	/** Its projects and loose to-dos in the Logbook, newest first. */
	logged: Entry[];
};

export function areaView(
	data: ViewData,
	areaId: string,
	ctx: ViewContext,
): AreaView | null {
	const { idx, todos, projects } = prepare(data, ctx);
	const area = idx.areas.get(areaId);
	if (!area) return null;
	return {
		area,
		projects: projects
			.filter((p) => p.areaId === areaId && isListed(p, ctx))
			.sort(bySortKey)
			.map((project) => ({
				project,
				progress: projectProgress(project.id, data.todos),
			})),
		todos: todos
			.filter((t) => t.areaId === areaId && !t.projectId && isListed(t, ctx))
			.sort(bySortKey),
		logged: [
			...projects
				.filter((p) => p.areaId === areaId && isLogged(p, ctx))
				.map((item) => ({ kind: "project" as const, item })),
			...todos
				.filter((t) => t.areaId === areaId && !t.projectId && isLogged(t, ctx))
				.map((item) => ({ kind: "todo" as const, item })),
		].sort((a, b) => byCompletedDesc(a.item, b.item)),
	};
}

export type SidebarCounts = {
	inbox: number;
	today: number;
	/** Open Today items whose deadline is today or past (shown as a red badge). */
	due: number;
};

export function sidebarCounts(data: ViewData, ctx: ViewContext): SidebarCounts {
	const base = { ...ctx, tagIds: undefined };
	const { main, evening } = today(data, base);
	const todayItems = [...main, ...evening].filter(
		(e) => e.item.status === "open",
	);
	return {
		inbox: inbox(data, base).filter((t) => t.status === "open").length,
		today: todayItems.length,
		due: todayItems.filter((e) => dueBy(e.item, ctx.today)).length,
	};
}

export type SidebarTree = {
	/** Open projects outside any area. */
	projects: Project[];
	areas: { area: Area; projects: Project[] }[];
};

/** Areas (even empty ones) with their open projects nested, for the sidebar. */
export function sidebarTree(data: ViewData): SidebarTree {
	const idx = buildIndex(data);
	const areas = data.areas
		.filter((a) => a.deletedAt === null)
		.sort(bySortKey)
		.map((area) => ({ area, projects: [] as Project[] }));
	const byArea = new Map(areas.map((group) => [group.area.id, group]));
	const root: Project[] = [];
	for (const project of [...data.projects].sort(bySortKey)) {
		if (!isOpen(project)) continue;
		const group =
			liveArea(project.areaId, idx) && byArea.get(project.areaId as string);
		if (group) group.projects.push(project);
		else root.push(project);
	}
	return { projects: root, areas };
}
