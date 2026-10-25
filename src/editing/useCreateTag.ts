import { useCallback } from "react";
import { useListData } from "../data";
import { keyAfter, maxKey } from "../lib/order";
import { useOps } from "../sync/hooks";

/** Creates a top-level tag at the end of the tag list and returns its id. */
export function useCreateTag(): (title: string) => Promise<string> {
	const ops = useOps();
	const { data } = useListData();
	return useCallback(
		(title: string) =>
			ops.create("tag", {
				title,
				sortKey: keyAfter(maxKey(data.tags.map((t) => t.sortKey))),
			}),
		[ops, data.tags],
	);
}
