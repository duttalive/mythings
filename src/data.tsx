// Live local data for the list views, loaded once for the whole shell so every
// route renders from the same snapshot.

import { useSearch } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Area, Project, Tag } from "../shared/schema";
import type { ViewContext, ViewData } from "../shared/views";
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
	areas: Map<string, Area>;
	projects: Map<string, Project>;
	tags: Map<string, Tag>;
};

const ListDataContext = createContext<ListData | null>(null);

export function useListData(): ListData {
	const value = useContext(ListDataContext);
	if (!value) throw new Error("Must be used inside <ListDataProvider>");
	return value;
}

/** Tag ids selected in the tag bar (the `tags` search param). */
export function useTagFilter(): string[] {
	const { tags } = useSearch({ strict: false });
	return useMemo(() => (tags ? tags.split(",").filter(Boolean) : []), [tags]);
}

/** The view context with the tag bar's filter applied. */
export function useFilteredContext(): ViewContext {
	const { ctx } = useListData();
	const tagIds = useTagFilter();
	return useMemo(
		() => (tagIds.length ? { ...ctx, tagIds } : ctx),
		[ctx, tagIds],
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
						projects: new Map(data.projects.map((p) => [p.id, p])),
						tags: new Map(data.tags.map((t) => [t.id, t])),
					}
				: null,
		[data, checklist, ctx],
	);
	if (!value) return fallback;
	return <ListDataContext value={value}>{children}</ListDataContext>;
}
