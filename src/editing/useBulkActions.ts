// Actions on the selected to-dos, as one batch (one undo step).

import { useMemo } from "react";
import type { LocalDate } from "../../shared/dates";
import type { Todo } from "../../shared/schema";
import { useConfirmDelete } from "../components/ConfirmDelete";
import { useListData } from "../data";
import { type SidebarTarget, sidebarDropMutations } from "../dnd/drop";
import type { Mutation } from "../sync/engine";
import { useOps } from "../sync/hooks";
import { todosRequest } from "./deleteRequests";
import type { WhenFields } from "./schedule";

export function useBulkActions() {
	const ops = useOps();
	const { data, ctx } = useListData();
	const confirmDelete = useConfirmDelete();

	return useMemo(() => {
		const todosFor = (ids: string[]) =>
			ids
				.map((id) => data.todos.find((t) => t.id === id))
				.filter((t): t is Todo => !!t && t.deletedAt === null);
		const run = (mutations: Mutation[]) => {
			if (mutations.length > 0) void ops.apply(mutations).catch(console.error);
		};
		const patchAll = (
			ids: string[],
			patch: (todo: Todo) => Record<string, unknown>,
		) =>
			run(
				todosFor(ids).map((todo) => ({
					type: "upsert",
					entity: "todo",
					id: todo.id,
					patch: patch(todo),
				})),
			);

		return {
			/** Completes them, or reopens them if they're all done already (⌘K). */
			toggleComplete: (ids: string[]) => {
				const allDone = todosFor(ids).every((t) => t.status === "completed");
				patchAll(ids, () => ({ status: allDone ? "open" : "completed" }));
			},
			cancel: (ids: string[]) => patchAll(ids, () => ({ status: "canceled" })),
			schedule: (ids: string[], fields: WhenFields) =>
				patchAll(ids, () => fields),
			setDeadline: (ids: string[], deadline: LocalDate | null) =>
				patchAll(ids, () => ({ deadline })),
			/** Adds the tag to all of them, or removes it if they all have it. */
			toggleTag: (ids: string[], tagId: string) => {
				const all = todosFor(ids).every((t) => t.tagIds.includes(tagId));
				patchAll(ids, (t) => ({
					tagIds: all
						? t.tagIds.filter((x) => x !== tagId)
						: [...new Set([...t.tagIds, tagId])],
				}));
			},
			moveTo: async (ids: string[], target: SidebarTarget) => {
				if (
					target.type === "trash" &&
					!(await confirmDelete(todosRequest(todosFor(ids))))
				)
					return;
				run(
					todosFor(ids).flatMap(
						(t) => sidebarDropMutations("todo", t.id, target, data, ctx) ?? [],
					),
				);
			},
			/** Moves them to Trash once confirmed. Resolves whether they went. */
			remove: async (ids: string[]): Promise<boolean> => {
				const todos = todosFor(ids);
				if (todos.length === 0 || !(await confirmDelete(todosRequest(todos))))
					return false;
				run(
					todos.map(
						(t): Mutation => ({ type: "delete", entity: "todo", id: t.id }),
					),
				);
				return true;
			},
		};
	}, [ops, data, ctx, confirmDelete]);
}
