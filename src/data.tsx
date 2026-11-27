// Live local data for the list views, loaded once for the whole shell so every
// route renders from the same snapshot.

import { useSearch } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Area, Project, Tag } from "../shared/schema";
import {
	FILTER_KINDS,
	type ListFilter,
	type ViewContext,
	type ViewData,
} from "../shared/views";
import {
	type ChecklistProgress,
	useChecklistProgress,
	useViewContext,
	useViewData,
} from "./sync/hooks";

export type ListData = {
	data: ViewData;
	ctx: ViewContext;
	checklist: ChecklistProgress;
	/** Areas only (to-dos' containers). */
	areas: Map<string, Area>;
	/** Life Buckets (projects' and areas' containers). */
	buckets: Map<string, Area>;
	projects: Map<string, Project>;
	tags: Map<string, Tag>;
};

const ListDataContext = createContext<ListData | null>(null);

export function useListData(): ListData {
	const value = useContext(ListDataContext);
	if (!value) throw new Error("Must be used inside <ListDataProvider>");
	return value;
}

/** The filter bar's search params, one per kind of list (comma-separated ids). */
export const FILTER_PARAMS = {
	buckets: "bucket",
	areas: "area",
	projects: "project",
	tags: "tags",
} as const satisfies Record<keyof ListFilter, string>;

const split = (value: string | undefined) =>
	value ? value.split(",").filter(Boolean) : [];

/** What's chosen in the filter bar (from the page's search params). */
export function useListFilter(): ListFilter {
	const { bucket, area, project, tags } = useSearch({ strict: false });
	return useMemo(() => {
		const values = { buckets: bucket, areas: area, projects: project, tags };
		const filter: ListFilter = {};
		for (const kind of FILTER_KINDS) {
			const ids = split(values[kind]);
			if (ids.length) filter[kind] = ids;
		}
		return filter;
	}, [bucket, area, project, tags]);
}

/** Tag ids chosen in the filter bar (new tasks get them). */
export function useTagFilter(): string[] {
	return useListFilter().tags ?? [];
}

/** Whether anything is chosen in the filter bar. */
export function useFiltering(): boolean {
	return Object.keys(useListFilter()).length > 0;
}

/** The view context with the filter bar's choices applied. */
export function useFilteredContext(): ViewContext {
	const { ctx } = useListData();
	const filter = useListFilter();
	return useMemo(
		() => (Object.keys(filter).length ? { ...ctx, filter } : ctx),
		[ctx, filter],
	);
}

/** Renders `fallback` until the local database has loaded. */
export function ListDataProvider({
	children,
	fallback,
}: {
	children: ReactNode;
	fallback: ReactNode;
}) {
	const data = useViewData();
	const checklist = useChecklistProgress();
	const ctx = useViewContext();
	const value = useMemo(
		() =>
			data && checklist
				? {
						data,
						ctx,
						checklist,
						areas: new Map(data.areas.map((a) => [a.id, a])),
						buckets: new Map(data.buckets.map((b) => [b.id, b])),
						projects: new Map(data.projects.map((p) => [p.id, p])),
						tags: new Map(data.tags.map((t) => [t.id, t])),
					}
				: null,
		[data, checklist, ctx],
	);
	if (!value) return fallback;
	return <ListDataContext value={value}>{children}</ListDataContext>;
}
