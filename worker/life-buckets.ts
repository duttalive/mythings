// One-time conversion of a user's data to Life Buckets (2.2.0, SPEC §5.2),
// run when their UserStore starts. Changed rows get new revs, so every device
// picks them up on its next sync.
// Later, Applier.placeInBucket keeps every area and project in a bucket.

import { ulid } from "ulid";
import { DEFAULTS } from "../shared/rows";
import type { Area, EntityName, EntityRowMap } from "../shared/schema";
import { restructure } from "../shared/structure";
import type { Store } from "./store";

const DONE_KEY = "life_buckets";

export function convertToLifeBuckets(store: Store, now = Date.now()): boolean {
	if (store.getMeta(DONE_KEY)) return false;
	const all = <E extends EntityName>(entity: E) =>
		store.where(entity, "1 = 1") as (EntityRowMap[E] &
			Record<string, unknown>)[];
	const plan = restructure(
		{ areas: all("area"), projects: all("project"), todos: all("todo") },
		{ newId: ulid, now, createDefault: true },
	);

	const save = <E extends EntityName>(entity: E, row: EntityRowMap[E]) =>
		store.put(entity, { ...row, rev: store.nextRev(), updatedAt: now });
	// Buckets first, so an area never points at one that isn't there yet.
	for (const row of plan.created.filter((r) => r.kind === "bucket"))
		save("area", { ...DEFAULTS.area, ...row } as Area);
	for (const [id, change] of plan.areas) {
		const row = store.get("area", id);
		if (row) save("area", { ...DEFAULTS.area, ...row, ...change } as Area);
	}
	for (const row of plan.created.filter((r) => r.kind !== "bucket"))
		save("area", { ...DEFAULTS.area, ...row } as Area);
	for (const [id, change] of plan.projects) {
		const row = store.get("project", id);
		if (row) save("project", { ...row, ...change });
	}
	for (const [id, change] of plan.todos) {
		const row = store.get("todo", id);
		if (row) save("todo", { ...row, ...change });
	}
	store.setMeta(DONE_KEY, String(now));
	return true;
}
