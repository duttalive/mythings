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
	/** Areas: ongoing lists of to-dos, each inside a Life Bucket. */
	areas: Area[];
	/** Life Buckets: they group areas and projects (area rows of kind "bucket"). */
	buckets: Area[];
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
	/** The filter bar's choices (see `ListFilter`). */
	filter?: ListFilter;
};

/**
 * The filter bar at the top of a list (SPEC §6.6). Within one kind any of the
 * chosen ones matches; the kinds combine (an item must match every kind that
 * has a choice). A tag also matches its nested tags.
 */
export type ListFilter = {
	buckets?: string[];
	areas?: string[];
	projects?: string[];
	tags?: string[];
};

export const FILTER_KINDS = ["buckets", "areas", "projects", "tags"] as const;
export type FilterKind = (typeof FILTER_KINDS)[number];

export function isFiltering(filter: ListFilter | undefined): boolean {
	return !!filter && FILTER_KINDS.some((k) => (filter[k]?.length ?? 0) > 0);
}

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

/** Its deadline was before today. */
export function isOverdue(item: Item, today: LocalDate): boolean {
	return item.deadline !== null && item.deadline < today;
}

/** It was planned for an earlier day (and isn't done, where it's listed). */
export function isMissed(item: Item, today: LocalDate): boolean {
	return (
		item.when === "scheduled" &&
		item.startDate !== null &&
		item.startDate < today
	);
}

/** Its deadline passed or its planned day went by: it belongs in Overdue. */
export function isLate(item: Item, today: LocalDate): boolean {
	return isOverdue(item, today) || isMissed(item, today);
}

/** Why an item is in Overdue, and the day it slipped (the earlier one, if both). */
export function lateness(
	item: Item,
	today: LocalDate,
): { date: LocalDate; reason: "deadline" | "planned" } | null {
	const deadline = isOverdue(item, today) ? item.deadline : null;
	const planned = isMissed(item, today) ? item.startDate : null;
	if (deadline && (!planned || deadline <= planned))
		return { date: deadline, reason: "deadline" };
	if (planned) return { date: planned, reason: "planned" };
	return null;
}

/** A project whose to-dos can show in Today and Anytime. */
function isActiveProject(project: Project, today: LocalDate): boolean {
	return (
		isOpen(project) && (project.when === "anytime" || startedBy(project, today))
	);
}

/**
 * Whether the item belongs in Today (ignoring its parent project); drives the ★
 * in other lists. Today means today: scheduled for this very day. A planned
 * day that went by, or a deadline that passed, sends it to Overdue instead,
 * and being due today alone doesn't put it here.
 */
export function isInToday(item: Item, today: LocalDate): boolean {
	return (
		item.when === "scheduled" &&
		item.startDate === today &&
		!isOverdue(item, today)
	);
}

/** Days until the deadline: 0 = due today, negative = overdue by that many days. */
export function daysUntilDeadline(item: Item, today: LocalDate): number | null {
	return item.deadline === null ? null : diffDays(today, item.deadline);
}

// ---------------------------------------------------------------------------
// Lookup and tag filtering

type Index = {
	projects: Map<string, Project>;
	/** Areas and Life Buckets by id. */
	areas: Map<string, Area>;
	headings: Map<string, Heading>;
};

function buildIndex(data: ViewData): Index {
	return {
		projects: new Map(data.projects.map((p) => [p.id, p])),
		areas: new Map([...data.areas, ...data.buckets].map((a) => [a.id, a])),
		headings: new Map(data.headings.map((h) => [h.id, h])),
	};
}

function projectOf(todo: Todo, idx: Index): Project | undefined {
	return todo.projectId ? idx.projects.get(todo.projectId) : undefined;
}

/**
 * Item tags plus those inherited from its project or area, and from the Life
 * Bucket that holds that project or area.
 */
function effectiveTags(item: Item, idx: Index): string[] {
	const project = "projectId" in item ? projectOf(item, idx) : undefined;
	const holder = project ?? item;
	const area =
		"projectId" in holder && holder.areaId
			? idx.areas.get(holder.areaId)
			: undefined;
	const bucketId = project ? project.areaId : (area?.bucketId ?? null);
	const bucket = bucketId ? idx.areas.get(bucketId) : undefined;
	return [
		...item.tagIds,
		...(project?.tagIds ?? []),
		...(area?.tagIds ?? []),
		...(bucket?.tagIds ?? []),
	];
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

/** The tag ids with every tag nested inside them. */
function withNested(tags: Tag[], selected: string[]): Set<string> {
	const children = new Map<string, string[]>();
	for (const tag of tags) {
		if (tag.parentId && tag.deletedAt === null) {
			children.set(tag.parentId, [
				...(children.get(tag.parentId) ?? []),
				tag.id,
			]);
		}
	}
	const set = new Set<string>();
	const stack = [...selected];
	while (stack.length > 0) {
		const next = stack.pop() as string;
		if (set.has(next)) continue;
		set.add(next);
		stack.push(...(children.get(next) ?? []));
	}
	return set;
}

/** Something a list can show, as the filter bar sees it. */
export type FilterableEntry =
	| { kind: "todo"; item: Todo }
	| { kind: "project"; item: Project }
	| { kind: "area"; item: Area }
	| { kind: "heading"; item: Heading };

type Placement = {
	bucketId: string | null;
	areaId: string | null;
	projectId: string | null;
	tags: string[];
};

function placementOf(entry: FilterableEntry, idx: Index): Placement {
	switch (entry.kind) {
		case "todo": {
			const todo = entry.item;
			const project = projectOf(todo, idx);
			const area =
				!project && todo.areaId ? idx.areas.get(todo.areaId) : undefined;
			return {
				bucketId: project
					? project.areaId
					: area?.kind === "bucket"
						? area.id
						: (area?.bucketId ?? null),
				areaId: area?.kind === "area" ? area.id : null,
				projectId: project?.id ?? null,
				tags: effectiveTags(todo, idx),
			};
		}
		case "project":
			return {
				bucketId: entry.item.areaId,
				areaId: null,
				projectId: entry.item.id,
				tags: effectiveTags(entry.item, idx),
			};
		case "heading": {
			const project = idx.projects.get(entry.item.projectId);
			return {
				bucketId: project?.areaId ?? null,
				areaId: null,
				projectId: entry.item.projectId,
				tags: project ? effectiveTags(project, idx) : [],
			};
		}
		case "area": {
			const area = entry.item;
			if (area.kind === "bucket")
				return {
					bucketId: area.id,
					areaId: null,
					projectId: null,
					tags: area.tagIds,
				};
			const bucket = area.bucketId ? idx.areas.get(area.bucketId) : undefined;
			return {
				bucketId: area.bucketId,
				areaId: area.id,
				projectId: null,
				tags: [...area.tagIds, ...(bucket?.tagIds ?? [])],
			};
		}
	}
}

/**
 * The filter bar's Life Bucket → Area / Project choices, linked (SPEC §6.6):
 * an Area or Project counts only under its own Life Bucket, which is added if
 * a link names the Area or Project without it. Picking Areas or Projects in a
 * bucket narrows that bucket to them; a bucket with none picked stays whole.
 */
export function linkedFilter(
	data: Pick<ViewData, "areas" | "buckets" | "projects">,
	filter: ListFilter | undefined,
): {
	buckets: string[];
	areas: string[];
	projects: string[];
	/** Bucket id → the Areas and Projects picked in it. */
	within: Map<string, Set<string>>;
} {
	const areaBucket = new Map(data.areas.map((a) => [a.id, a.bucketId]));
	const projectBucket = new Map(data.projects.map((p) => [p.id, p.areaId]));
	const buckets = [...(filter?.buckets ?? [])];
	const within = new Map<string, Set<string>>();
	const keep = (
		ids: string[] | undefined,
		bucketOf: Map<string, string | null>,
	) =>
		(ids ?? []).filter((id) => {
			const bucket = bucketOf.get(id);
			if (!bucket) return false;
			if (!buckets.includes(bucket)) buckets.push(bucket);
			within.set(bucket, (within.get(bucket) ?? new Set()).add(id));
			return true;
		});
	const areas = keep(filter?.areas, areaBucket);
	const projects = keep(filter?.projects, projectBucket);
	return { buckets, areas, projects, within };
}

/** Whether an entry passes the filter bar's choices. */
export function filterMatcher(
	data: ViewData,
	filter: ListFilter | undefined,
	idx: Index = buildIndex(data),
): (entry: FilterableEntry) => boolean {
	if (!isFiltering(filter)) return () => true;
	const f = filter as ListFilter;
	const linked = linkedFilter(data, f);
	const buckets = linked.buckets.length ? new Set(linked.buckets) : null;
	// Names in the link that no longer exist match nothing.
	const lost =
		(f.areas?.length ?? 0) + (f.projects?.length ?? 0) >
		linked.areas.length + linked.projects.length;
	const tags = f.tags?.length ? withNested(data.tags, f.tags) : null;
	return (entry) => {
		const p = placementOf(entry, idx);
		if (buckets || lost) {
			if (p.bucketId === null || !buckets?.has(p.bucketId)) return false;
			const picked = linked.within.get(p.bucketId);
			if (
				picked &&
				!(
					(p.areaId !== null && picked.has(p.areaId)) ||
					(p.projectId !== null && picked.has(p.projectId))
				)
			)
				return false;
		}
		return !tags || p.tags.some((t) => tags.has(t));
	};
}

/** The index (over all data) and the to-dos and projects that pass the tag filter and filter bar. */
function prepare(data: ViewData, ctx: ViewContext) {
	const idx = buildIndex(data);
	let { todos, projects } = data;
	if (ctx.tagIds?.length) {
		const matches = tagMatcher(data.tags, ctx.tagIds);
		todos = todos.filter((t) => matches(effectiveTags(t, idx)));
		projects = projects.filter((p) => matches(effectiveTags(p, idx)));
	}
	if (isFiltering(ctx.filter)) {
		const matches = filterMatcher(data, ctx.filter, idx);
		todos = todos.filter((item) => matches({ kind: "todo", item }));
		projects = projects.filter((item) => matches({ kind: "project", item }));
	}
	return { idx, todos, projects };
}

// ---------------------------------------------------------------------------
// Grouping by Life Bucket → area / project (Anytime, Someday, tag pages)

export type ProjectGroup = { project: Project; todos: Todo[] };
export type AreaGroup = { area: Area; todos: Todo[] };
/** A Life Bucket's areas, then its projects. `bucket` is null for anything not in a live bucket. */
export type BucketGroup = {
	bucket: Area | null;
	areas: AreaGroup[];
	projects: ProjectGroup[];
};
/** Loose to-dos first, then each Life Bucket. */
export type GroupedList = {
	todos: Todo[];
	buckets: BucketGroup[];
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

/** The live Life Bucket an area or project sits in. */
export function bucketOf(
	item: Area | Project,
	idx: { areas: Map<string, Area> },
): Area | undefined {
	const id = "kind" in item ? item.bucketId : item.areaId;
	const bucket = id ? idx.areas.get(id) : undefined;
	return bucket && bucket.deletedAt === null && bucket.kind === "bucket"
		? bucket
		: undefined;
}

function groupByBucket(
	todos: Todo[],
	projects: Project[],
	idx: Index,
): GroupedList {
	const projectGroups = new Map<string, ProjectGroup>();
	for (const project of projects)
		projectGroups.set(project.id, { project, todos: [] });

	const loose: Todo[] = [];
	const areaTodos = new Map<string, Todo[]>();
	for (const todo of todos) {
		const project = projectOf(todo, idx);
		if (project) {
			let group = projectGroups.get(project.id);
			if (!group) {
				group = { project, todos: [] };
				projectGroups.set(project.id, group);
			}
			group.todos.push(todo);
		} else if (liveArea(todo.areaId, idx)?.kind === "area") {
			const areaId = todo.areaId as string;
			areaTodos.set(areaId, [...(areaTodos.get(areaId) ?? []), todo]);
		} else {
			loose.push(todo);
		}
	}

	const groups = new Map<string, BucketGroup>();
	const groupFor = (bucket: Area | undefined) => {
		const key = bucket?.id ?? "";
		let group = groups.get(key);
		if (!group) {
			group = { bucket: bucket ?? null, areas: [], projects: [] };
			groups.set(key, group);
		}
		return group;
	};
	const order = byProjectOrder(idx);
	for (const [areaId, list] of areaTodos) {
		const area = idx.areas.get(areaId) as Area;
		groupFor(bucketOf(area, idx)).areas.push({
			area,
			todos: list.sort(bySortKey),
		});
	}
	for (const group of projectGroups.values()) {
		group.todos.sort(order);
		groupFor(bucketOf(group.project, idx)).projects.push(group);
	}
	const buckets = [...groups.values()].sort((a, b) =>
		!a.bucket || !b.bucket
			? a.bucket
				? 1
				: -1
			: bySortKey(a.bucket, b.bucket),
	);
	for (const group of buckets) {
		group.areas.sort((a, b) => bySortKey(a.area, b.area));
		group.projects.sort((a, b) => bySortKey(a.project, b.project));
	}
	return { todos: loose.sort(bySortKey), buckets };
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
export type TodayView = { main: Entry[] };

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
		main: entries,
	};
}

/**
 * Tags worth offering in a list's tag bar: those its items carry (including
 * from their project or area), plus the tags they're nested in.
 */
export function tagsInUse(data: ViewData, entries: Entry[]): Set<string> {
	const idx = buildIndex(data);
	const tags = new Map(data.tags.map((t) => [t.id, t]));
	const used = new Set<string>();
	for (const { item } of entries)
		for (const id of effectiveTags(item, idx)) {
			let tag = tags.get(id);
			while (tag && tag.deletedAt === null && !used.has(tag.id)) {
				used.add(tag.id);
				tag = tag.parentId ? tags.get(tag.parentId) : undefined;
			}
		}
	return used;
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
	return groupByBucket(visible, activeProjects, idx);
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
	return groupByBucket(visible, somedayProjects, idx);
}

/** Open to-dos and projects carrying a tag (or a descendant), grouped by Life Bucket. */
export function tagged(
	data: ViewData,
	tagId: string,
	ctx: ViewContext,
): GroupedList {
	const { idx, todos, projects } = prepare(data, { ...ctx, tagIds: [tagId] });
	return groupByBucket(
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

export type DeadlineGroup =
	| { kind: "overdue"; entries: Entry[] }
	| { kind: "day"; date: LocalDate; entries: Entry[] };

/**
 * Open to-dos and projects with a deadline, soonest first: everything overdue
 * together, then one group per deadline day. `query` narrows it to items whose
 * title, notes, project, area or tags contain every word.
 */
export function deadlines(
	data: ViewData,
	ctx: ViewContext,
	query = "",
): DeadlineGroup[] {
	const { idx, todos, projects } = prepare(data, ctx);
	const tagTitles = new Map(data.tags.map((t) => [t.id, t.title]));
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const matches = (item: Item) => {
		if (words.length === 0) return true;
		const project = "projectId" in item ? projectOf(item, idx) : undefined;
		const areaId = project ? project.areaId : item.areaId;
		const text = [
			item.title,
			item.notes,
			project?.title,
			areaId ? idx.areas.get(areaId)?.title : undefined,
			...effectiveTags(item, idx).map((id) => tagTitles.get(id)),
		]
			.join(" ")
			.toLowerCase();
		return words.every((w) => text.includes(w));
	};
	const due = (item: Item) =>
		isOpen(item) && item.deadline !== null && matches(item);

	const entries: Entry[] = [
		...projects.filter(due).map((item) => ({ kind: "project" as const, item })),
		...todos
			.filter((t) => {
				if (!due(t)) return false;
				// Not inside a finished, deleted or repeating project.
				const project = projectOf(t, idx);
				return !project || isOpen(project);
			})
			.map((item) => ({ kind: "todo" as const, item })),
	].sort(
		(a, b) =>
			compareStrings(a.item.deadline ?? "", b.item.deadline ?? "") ||
			a.item.createdAt - b.item.createdAt ||
			compareStrings(a.item.id, b.item.id),
	);

	const groups: DeadlineGroup[] = [];
	const overdue = entries.filter((e) => (e.item.deadline ?? "") < ctx.today);
	if (overdue.length) groups.push({ kind: "overdue", entries: overdue });
	for (const entry of entries) {
		const date = entry.item.deadline as LocalDate;
		if (date < ctx.today) continue;
		const last = groups.at(-1);
		if (last?.kind === "day" && last.date === date) last.entries.push(entry);
		else groups.push({ kind: "day", date, entries: [entry] });
	}
	return groups;
}

export type OverdueGroup = { date: LocalDate; entries: Entry[] };

/**
 * To-dos and projects whose deadline passed or whose planned day went by, most
 * overdue first, one group per day they slipped (see `lateness`). Items ticked
 * off today stay until they move to the Logbook, like in the other lists.
 */
export function overdue(data: ViewData, ctx: ViewContext): OverdueGroup[] {
	const { idx, todos, projects } = prepare(data, ctx);
	const late = (item: Item) => isListed(item, ctx) && isLate(item, ctx.today);
	const slipped = (item: Item) => lateness(item, ctx.today)?.date ?? ctx.today;
	const entries: Entry[] = [
		...projects
			.filter(late)
			.map((item) => ({ kind: "project" as const, item })),
		...todos
			.filter((t) => {
				if (!late(t)) return false;
				// Not inside a finished, deleted or repeating project.
				const project = projectOf(t, idx);
				return !project || isOpen(project);
			})
			.map((item) => ({ kind: "todo" as const, item })),
	].sort(
		(a, b) =>
			compareStrings(slipped(a.item), slipped(b.item)) ||
			a.item.createdAt - b.item.createdAt ||
			compareStrings(a.item.id, b.item.id),
	);

	const groups: OverdueGroup[] = [];
	for (const entry of entries) {
		const date = slipped(entry.item);
		const last = groups.at(-1);
		if (last?.date === date) last.entries.push(entry);
		else groups.push({ date, entries: [entry] });
	}
	return groups;
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
export function trash(data: ViewData, filter?: ListFilter): TrashEntry[] {
	const idx = buildIndex(data);
	const matches = filterMatcher(data, filter, idx);
	const deleted = (x: { deletedAt: number | null } | undefined) =>
		x !== undefined && x.deletedAt !== null;
	const area = (id: string | null) => (id ? idx.areas.get(id) : undefined);

	const entries: TrashEntry[] = [
		...[...data.buckets, ...data.areas]
			.filter((a) => deleted(a) && !deleted(area(a.bucketId)))
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
	return entries
		.filter(matches)
		.sort(
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
	/** The Life Bucket it's in. */
	bucket: Area | undefined;
	todos: Todo[];
	/** Its to-dos in the Logbook, newest first. */
	logged: Entry[];
};

export function areaView(
	data: ViewData,
	areaId: string,
	ctx: ViewContext,
): AreaView | null {
	const { idx, todos } = prepare(data, ctx);
	const area = idx.areas.get(areaId);
	if (!area || area.kind === "bucket") return null;
	return {
		area,
		bucket: bucketOf(area, idx),
		todos: todos
			.filter((t) => t.areaId === areaId && !t.projectId && isListed(t, ctx))
			.sort(bySortKey),
		logged: todos
			.filter((t) => t.areaId === areaId && !t.projectId && isLogged(t, ctx))
			.sort(byCompletedDesc)
			.map((item) => ({ kind: "todo" as const, item })),
	};
}

export type BucketView = {
	bucket: Area;
	/** Its areas, each with how many open to-dos it has. */
	areas: { area: Area; open: number }[];
	projects: { project: Project; progress: Progress }[];
	/** Its finished projects, newest first. */
	logged: Entry[];
};

/** A Life Bucket's page: its areas, then its projects. */
export function bucketView(
	data: ViewData,
	bucketId: string,
	ctx: ViewContext,
): BucketView | null {
	const { idx, todos, projects } = prepare(data, ctx);
	const bucket = idx.areas.get(bucketId);
	if (bucket?.kind !== "bucket") return null;
	const live = bucket.deletedAt === null;
	return {
		bucket,
		areas: data.areas
			.filter(
				(a) =>
					a.bucketId === bucketId &&
					(live ? a.deletedAt === null : a.deletedAt === bucket.deletedAt),
			)
			.sort(bySortKey)
			.map((area) => ({
				area,
				open: todos.filter(
					(t) =>
						t.areaId === area.id &&
						!t.projectId &&
						isOpen(t) &&
						t.deletedAt === area.deletedAt,
				).length,
			})),
		projects: projects
			.filter((p) => p.areaId === bucketId && isListed(p, ctx))
			.sort(bySortKey)
			.map((project) => ({
				project,
				progress: projectProgress(project.id, data.todos),
			})),
		logged: projects
			.filter((p) => p.areaId === bucketId && isLogged(p, ctx))
			.sort(byCompletedDesc)
			.map((item) => ({ kind: "project" as const, item })),
	};
}

export type SidebarCounts = {
	inbox: number;
	today: number;
	/** Open Today items whose deadline is today or past (shown as a red badge). */
	due: number;
	/** Open to-dos and projects whose deadline or planned day has passed (red badge on Overdue). */
	overdue: number;
};

export function sidebarCounts(data: ViewData, ctx: ViewContext): SidebarCounts {
	const base = { ...ctx, tagIds: undefined };
	const { main } = today(data, base);
	const todayItems = main.filter((e) => e.item.status === "open");
	return {
		inbox: inbox(data, base).filter((t) => t.status === "open").length,
		today: todayItems.length,
		due: todayItems.filter((e) => dueBy(e.item, ctx.today)).length,
		overdue: overdue(data, base)
			.flatMap((g) => g.entries)
			.filter((e) => e.item.status === "open").length,
	};
}

export type SidebarTree = {
	/** Each Life Bucket (even empty ones) with its areas and open projects. */
	buckets: { bucket: Area; areas: Area[]; projects: Project[] }[];
	/** Areas and open projects not in a live bucket (only until the server places them). */
	loose: { areas: Area[]; projects: Project[] };
};

/** Life Buckets with their areas and open projects nested, for the sidebar. */
export function sidebarTree(data: ViewData): SidebarTree {
	const idx = buildIndex(data);
	const buckets = data.buckets
		.filter((b) => b.deletedAt === null)
		.sort(bySortKey)
		.map((bucket) => ({
			bucket,
			areas: [] as Area[],
			projects: [] as Project[],
		}));
	const byBucket = new Map(buckets.map((group) => [group.bucket.id, group]));
	const loose: SidebarTree["loose"] = { areas: [], projects: [] };
	for (const area of [...data.areas].sort(bySortKey)) {
		if (area.deletedAt !== null) continue;
		const group = byBucket.get(bucketOf(area, idx)?.id ?? "");
		(group ?? loose).areas.push(area);
	}
	for (const project of [...data.projects].sort(bySortKey)) {
		if (!isOpen(project)) continue;
		const group = byBucket.get(bucketOf(project, idx)?.id ?? "");
		(group ?? loose).projects.push(project);
	}
	return { buckets, loose };
}
