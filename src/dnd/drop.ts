// What dropping a dragged item onto a sidebar list does (SPEC §10.7).

import type { ViewContext, ViewData } from "../../shared/views";
import { today } from "../../shared/views";
import { insertAt, type Placed, placeMutations } from "../editing/reorder";
import { keyAfter, maxKey } from "../lib/order";
import type { Mutation } from "../sync/engine";

export type DragKind = "todo" | "project" | "area";

export type SidebarTarget =
	| { type: "inbox" | "today" | "anytime" | "someday" | "logbook" | "trash" }
	| { type: "project"; id: string }
	| { type: "area"; id: string };

/** Whether a dragged kind can be dropped on a sidebar target (for highlighting). */
export function canDrop(
	kind: DragKind,
	target: SidebarTarget["type"],
): boolean {
	if (target === "trash") return true;
	if (kind === "todo") return true;
	if (kind === "project")
		return ["today", "anytime", "someday", "area"].includes(target);
	return false;
}

const live = <T extends { deletedAt: number | null }>(rows: T[]) =>
	rows.filter((r) => r.deletedAt === null);

/** Moves an item to the top of Today's main section (SPEC §10.7). */
function toTopOfToday(
	entity: "todo" | "project",
	id: string,
	data: ViewData,
	ctx: ViewContext,
): Mutation[] {
	const entries: Placed[] = today(data, { ...ctx, tagIds: undefined })
		.main.filter((e) => e.item.id !== id)
		.map((e) => ({ entity: e.kind, id: e.item.id, key: e.item.todaySortKey }));
	const list = insertAt(entries, { entity, id, key: null }, 0);
	return placeMutations(list, id, "todaySortKey", {
		when: "scheduled",
		startDate: ctx.today,
		evening: false,
	});
}

/**
 * Mutations for dropping a to-do, project or area onto a sidebar target, or
 * null when that drop isn't supported (e.g. a project onto the Inbox).
 */
export function sidebarDropMutations(
	kind: DragKind,
	id: string,
	target: SidebarTarget,
	data: ViewData,
	ctx: ViewContext,
): Mutation[] | null {
	if (target.type === "trash") return [{ type: "delete", entity: kind, id }];

	if (kind === "todo") {
		const upsert = (patch: Record<string, unknown>): Mutation[] => [
			{ type: "upsert", entity: "todo", id, patch },
		];
		switch (target.type) {
			case "inbox": {
				const inbox = live(data.todos).filter(
					(t) => t.when === "inbox" && t.id !== id,
				);
				return upsert({
					when: "inbox",
					projectId: null,
					headingId: null,
					areaId: null,
					sortKey: keyAfter(maxKey(inbox.map((t) => t.sortKey))),
				});
			}
			case "today":
				return toTopOfToday("todo", id, data, ctx);
			case "anytime":
				return upsert({ when: "anytime" });
			case "someday":
				return upsert({ when: "someday" });
			case "logbook":
				return upsert({ status: "completed" });
			case "project": {
				const loose = live(data.todos).filter(
					(t) => t.projectId === target.id && !t.headingId && t.id !== id,
				);
				return upsert({
					projectId: target.id,
					headingId: null,
					sortKey: keyAfter(maxKey(loose.map((t) => t.sortKey))),
				});
			}
			case "area": {
				const loose = live(data.todos).filter(
					(t) => t.areaId === target.id && !t.projectId && t.id !== id,
				);
				return upsert({
					areaId: target.id,
					projectId: null,
					headingId: null,
					sortKey: keyAfter(maxKey(loose.map((t) => t.sortKey))),
				});
			}
		}
	}

	if (kind === "project") {
		const upsert = (patch: Record<string, unknown>): Mutation[] => [
			{ type: "upsert", entity: "project", id, patch },
		];
		switch (target.type) {
			case "today":
				return toTopOfToday("project", id, data, ctx);
			case "anytime":
				return upsert({ when: "anytime" });
			case "someday":
				return upsert({ when: "someday" });
			case "area": {
				const siblings = live(data.projects).filter(
					(p) => p.areaId === target.id && p.id !== id,
				);
				return upsert({
					areaId: target.id,
					sortKey: keyAfter(maxKey(siblings.map((p) => p.sortKey))),
				});
			}
			default:
				// Completing from the Logbook would skip the remaining-to-dos prompt.
				return null;
		}
	}

	return null;
}
