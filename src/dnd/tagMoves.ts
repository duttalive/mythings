// Moving a tag in the sidebar by dragging: drop it on the middle of another
// tag to nest it inside, or near that tag's top or bottom edge to put it just
// before or after it (among the same parent's tags).

import type { Tag } from "../../shared/schema";
import { bySortKey } from "../../shared/views";
import { insertAt, type Placed, placeMutations } from "../editing/reorder";
import type { Mutation } from "../sync/engine";

export type TagZone = "before" | "after" | "inside";

/** Which part of a row the pointer is over: the outer quarters reorder, the middle nests. */
export function tagZone(
	pointerY: number,
	rect: { top: number; height: number },
): TagZone {
	const offset = (pointerY - rect.top) / rect.height;
	if (offset < 0.25) return "before";
	if (offset > 0.75) return "after";
	return "inside";
}

/** `id` and every tag nested below it (a tag can't move into these). */
export function tagDescendants(tags: Tag[], id: string): Set<string> {
	const out = new Set<string>([id]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const t of tags)
			if (t.parentId && out.has(t.parentId) && !out.has(t.id)) {
				out.add(t.id);
				grew = true;
			}
	}
	return out;
}

/** The parent the sidebar shows a tag under: none if its parent is gone. */
function shownParent(tag: Tag, live: Map<string, Tag>): string | null {
	return tag.parentId && live.has(tag.parentId) ? tag.parentId : null;
}

/** Whether dropping `draggedId` on `targetId` does anything (not onto itself or inside itself). */
export function canMoveTag(
	tags: Tag[],
	draggedId: string,
	targetId: string,
): boolean {
	return !tagDescendants(tags, draggedId).has(targetId);
}

/**
 * Mutations that move a tag before, after or inside another one, or null when
 * the drop isn't allowed or changes nothing.
 */
export function tagMoveMutations(
	tags: Tag[],
	draggedId: string,
	targetId: string,
	zone: TagZone,
): Mutation[] | null {
	const live = new Map(
		tags.filter((t) => t.deletedAt === null).map((t) => [t.id, t]),
	);
	const dragged = live.get(draggedId);
	const target = live.get(targetId);
	if (!dragged || !target || !canMoveTag(tags, draggedId, targetId))
		return null;

	const parentId = zone === "inside" ? target.id : shownParent(target, live);
	const siblings = [...live.values()]
		.filter((t) => shownParent(t, live) === parentId)
		.sort(bySortKey);
	const toPlaced = (t: Tag): Placed => ({
		entity: "tag",
		id: t.id,
		key: t.sortKey,
	});
	const others = siblings.filter((t) => t.id !== draggedId).map(toPlaced);
	const at =
		zone === "inside"
			? others.length
			: others.findIndex((p) => p.id === target.id) +
				(zone === "after" ? 1 : 0);
	const list = insertAt(others, toPlaced(dragged), at);

	const sameParent = shownParent(dragged, live) === parentId;
	const unchanged =
		sameParent &&
		list.map((p) => p.id).join() === siblings.map((t) => t.id).join();
	if (unchanged) return null;

	const mutations = placeMutations(
		list,
		draggedId,
		"sortKey",
		sameParent ? {} : { parentId },
	);
	// Open a collapsed tag that something was just put inside, so it shows.
	if (zone === "inside" && target.collapsed)
		mutations.push({
			type: "upsert",
			entity: "tag",
			id: target.id,
			patch: { collapsed: false },
		});
	return mutations;
}
