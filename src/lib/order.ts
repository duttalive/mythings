// Sort keys (SPEC §5.9) via fractional indexing. Keys written before keys
// came from this library may not be valid fractional keys, so these helpers
// fall back to plain string tricks that still sort correctly.

import { generateKeyBetween } from "fractional-indexing";

/** A key that sorts after `last` (or a first key when there is none). */
export function keyAfter(last: string | null | undefined): string {
	try {
		return generateKeyBetween(last ?? null, null);
	} catch {
		return `${last}V`;
	}
}

/** A key that sorts before `first`. */
export function keyBefore(first: string | null | undefined): string {
	try {
		return generateKeyBetween(null, first ?? null);
	} catch {
		// Strings sorting before an arbitrary key aren't always possible; take the smallest valid key.
		return generateKeyBetween(null, null).replace(/^a/, "Z");
	}
}

/** A key between two neighbours (either may be missing). */
export function keyBetween(
	before: string | null | undefined,
	after: string | null | undefined,
): string {
	try {
		return generateKeyBetween(before ?? null, after ?? null);
	} catch {
		return before ? `${before}V` : keyBefore(after);
	}
}

/** The largest key among items, by code unit. */
export function maxKey(
	keys: Iterable<string | null | undefined>,
): string | null {
	let max: string | null = null;
	for (const key of keys) if (key && (max === null || key > max)) max = key;
	return max;
}
