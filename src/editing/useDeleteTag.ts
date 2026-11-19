// Deleting a tag (and the tags nested in it) from its page or the sidebar:
// asks first, offers Undo, and leaves the page if it was one of those tags.

import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { Tag } from "../../shared/schema";
import { useConfirmDelete } from "../components/ConfirmDelete";
import { useToast } from "../components/Toast";
import { useListData } from "../data";
import { tagDescendants } from "../dnd/tagMoves";
import { useOps } from "../sync/hooks";
import { tagRequest } from "./deleteRequests";

export function useDeleteTag(): (tag: Tag) => Promise<void> {
	const ops = useOps();
	const toast = useToast();
	const navigate = useNavigate();
	const { data } = useListData();
	const confirmDelete = useConfirmDelete();
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	return async (tag) => {
		if (!(await confirmDelete(tagRequest(tag, data)))) return;
		const gone = tagDescendants(data.tags, tag.id);
		const onPage = /^\/tag\/([^/]+)/.exec(pathname)?.[1];
		if (onPage && gone.has(onPage)) void navigate({ to: "/today" });
		try {
			await ops.remove("tag", tag.id);
			toast.show(`Deleted “${tag.title}”`, {
				label: "Undo",
				run: () => void ops.undo().catch(console.error),
			});
		} catch (error) {
			console.error(error);
		}
	};
}
