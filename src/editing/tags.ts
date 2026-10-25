// Tag shortcut keys (SPEC §10.6): one character per tag, unique among live tags.

import type { Tag } from "../../shared/schema";
import type { Mutation } from "../sync/engine";

/**
 * Sets (or clears, with null) a tag's shortcut. A key another tag already
 * has moves to this one, in the same batch (one undo step).
 */
export function tagShortcutMutations(
	tags: Tag[],
	tagId: string,
	key: string | null,
): Mutation[] {
	const mutations: Mutation[] = [];
	if (key) {
		for (const other of tags)
			if (
				other.id !== tagId &&
				other.deletedAt === null &&
				other.shortcut === key
			)
				mutations.push({
					type: "upsert",
					entity: "tag",
					id: other.id,
					patch: { shortcut: null },
				});
	}
	mutations.push({
		type: "upsert",
		entity: "tag",
		id: tagId,
		patch: { shortcut: key },
	});
	return mutations;
}

/** The live tag a key press in a tag picker toggles, if any. */
export function tagForShortcut(tags: Tag[], key: string): Tag | undefined {
	if (key.length !== 1) return undefined;
	return tags.find((t) => t.deletedAt === null && t.shortcut === key);
}
