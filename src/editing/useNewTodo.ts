import { useLocation } from "@tanstack/react-router";
import { useCallback } from "react";
import { useListData, useTagFilter } from "../data";
import { useDndRegistry } from "../dnd/DndProvider";
import { useOps } from "../sync/hooks";
import { canCreateIn, locationFromPath, newTodoFields } from "./defaults";
import { useEditing } from "./EditingProvider";
import { insertAt, placeMutations } from "./reorder";
import { useSelection } from "./SelectionProvider";

/**
 * Adds a to-do to the current list and opens it. With `afterId` (the
 * selection) it goes right below that to-do, in the same heading or section.
 */
export function useNewTodo() {
	const { pathname } = useLocation();
	const { data, ctx, projects, areas, tags } = useListData();
	const filterTagIds = useTagFilter();
	const { expand } = useEditing();
	const { select } = useSelection();
	const { listOf } = useDndRegistry();
	const ops = useOps();

	const location = locationFromPath(pathname);
	const available =
		canCreateIn(location) &&
		(location.list === "project"
			? projects.get(location.projectId)?.deletedAt === null
			: location.list === "area"
				? areas.get(location.areaId)?.deletedAt === null
				: location.list === "tag"
					? tags.get(location.tagId)?.deletedAt === null
					: location.list !== "other");

	const create = useCallback(
		async (afterId?: string) => {
			if (!available) return;
			const fields = newTodoFields(
				location,
				ctx.today,
				data.todos,
				filterTagIds,
			);
			const list = afterId ? listOf(afterId) : undefined;
			const after = list?.items.find((item) => item.id === afterId);
			if (list && after) Object.assign(fields, list.moveInPatch?.(after) ?? {});

			const id = await ops.create("todo", fields);
			if (list && after) {
				const others = list.items.filter((item) => item.id !== id);
				const order = insertAt(
					others,
					{ entity: "todo", id, key: null },
					others.indexOf(after) + 1,
				);
				// Part of creating it: undoing the create is enough.
				await ops.apply(placeMutations(order, id, list.keyField), {
					undoable: false,
				});
			}
			select(id);
			expand(id, { fresh: true });
		},
		[
			available,
			location,
			ctx.today,
			data.todos,
			filterTagIds,
			listOf,
			ops,
			select,
			expand,
		],
	);

	return { available, create };
}
