// Placing items in an ordered list by fractional sort keys (SPEC §5.9).
// Normally only the moved item gets a new key. If the list's keys can't be
// used as neighbours — missing (unplaced Today items), duplicated (rows that
// all got the default key) or not valid fractional keys (older data) — the
// whole list is renumbered once, which also repairs it.

import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";
import type { EntityName } from "../../shared/schema";
import type { Mutation } from "../sync/engine";

export type KeyField = "sortKey" | "todaySortKey";

export type Placed = { entity: EntityName; id: string; key: string | null };

function isValidKey(key: string): boolean {
	try {
		generateKeyBetween(key, null);
		return true;
	} catch {
		return false;
	}
}

/** True if every key is present, valid and strictly increasing. */
export function isOrderable(keys: (string | null)[]): boolean {
	let previous: string | null = null;
	for (const key of keys) {
		if (key === null || !isValidKey(key)) return false;
		if (previous !== null && previous >= key) return false;
		previous = key;
	}
	return true;
}

/**
 * Mutations that make `list` (the desired final order, including the moved
 * item) sort that way. `movedPatch` is applied to the moved item too, e.g. a
 * new heading when it changed container.
 */
export function placeMutations(
	list: Placed[],
	movedId: string,
	keyField: KeyField,
	movedPatch: Record<string, unknown> = {},
): Mutation[] {
	const index = list.findIndex((item) => item.id === movedId);
	const moved = list[index];
	if (!moved) return [];

	const others = list.filter((item) => item.id !== movedId);
	if (isOrderable(others.map((item) => item.key))) {
		try {
			const key = generateKeyBetween(
				list[index - 1]?.key ?? null,
				list[index + 1]?.key ?? null,
			);
			return [
				{
					type: "upsert",
					entity: moved.entity,
					id: moved.id,
					patch: { ...movedPatch, [keyField]: key },
				},
			];
		} catch {
			// Fall through to renumbering.
		}
	}

	const keys = generateNKeysBetween(null, null, list.length);
	return list.flatMap((item, i): Mutation[] => {
		if (item.id === movedId) {
			return [
				{
					type: "upsert",
					entity: item.entity,
					id: item.id,
					patch: { ...movedPatch, [keyField]: keys[i] },
				},
			];
		}
		return item.key === keys[i]
			? []
			: [
					{
						type: "upsert",
						entity: item.entity,
						id: item.id,
						patch: { [keyField]: keys[i] },
					},
				];
	});
}

/** `list` with the item at `from` moved to `to` (indices in the original list). */
export function arrayMove<T>(list: T[], from: number, to: number): T[] {
	const next = [...list];
	const [item] = next.splice(from, 1);
	if (item !== undefined) next.splice(to, 0, item);
	return next;
}

/** `list` with `item` inserted before index `at` (or at the end). */
export function insertAt<T>(list: T[], item: T, at: number): T[] {
	const next = [...list];
	next.splice(Math.max(0, Math.min(at, next.length)), 0, item);
	return next;
}
