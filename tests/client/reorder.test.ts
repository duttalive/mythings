import { describe, expect, it } from "vitest";
import {
	arrayMove,
	insertAt,
	isOrderable,
	type Placed,
	placeMutations,
} from "../../src/editing/reorder";

const item = (id: string, key: string | null): Placed => ({
	entity: "todo",
	id,
	key,
});

/** Applies key mutations and returns ids sorted by their resulting keys. */
function sortedAfter(
	list: Placed[],
	movedId: string,
	field: "sortKey" | "todaySortKey" = "sortKey",
) {
	const keys = new Map(list.map((i) => [i.id, i.key]));
	for (const m of placeMutations(list, movedId, field)) {
		if (m.type === "upsert") keys.set(m.id, m.patch[field] as string);
	}
	return [...keys.entries()]
		.sort((a, b) => ((a[1] ?? "") < (b[1] ?? "") ? -1 : 1))
		.map(([id]) => id);
}

describe("isOrderable", () => {
	it("needs present, valid, strictly increasing keys", () => {
		expect(isOrderable(["a0", "a1", "a2"])).toBe(true);
		expect(isOrderable([])).toBe(true);
		expect(isOrderable(["a0", "a0"])).toBe(false);
		expect(isOrderable(["a1", "a0"])).toBe(false);
		expect(isOrderable(["a0", null])).toBe(false);
		expect(isOrderable(["b"])).toBe(false);
	});
});

describe("placeMutations", () => {
	it("writes one key between clean neighbours", () => {
		const list = [item("A", "a0"), item("X", "a5"), item("B", "a1")];
		const mutations = placeMutations(list, "X", "sortKey");
		expect(mutations).toHaveLength(1);
		const key =
			mutations[0]?.type === "upsert"
				? (mutations[0].patch.sortKey as string)
				: "";
		expect(key > "a0" && key < "a1").toBe(true);
	});

	it("places at the start and the end", () => {
		expect(
			sortedAfter([item("X", "a5"), item("A", "a0"), item("B", "a1")], "X"),
		).toEqual(["X", "A", "B"]);
		expect(
			sortedAfter([item("A", "a0"), item("B", "a1"), item("X", "Zz")], "X"),
		).toEqual(["A", "B", "X"]);
	});

	it("renumbers lists with duplicate keys", () => {
		const list = [
			item("A", "a0"),
			item("B", "a0"),
			item("X", "a0"),
			item("C", "a0"),
		];
		expect(sortedAfter(list, "X")).toEqual(["A", "B", "X", "C"]);
	});

	it("renumbers lists with missing keys (unplaced Today items)", () => {
		const list = [
			item("A", null),
			item("X", "a3"),
			item("B", null),
			item("C", "a1"),
		];
		expect(sortedAfter(list, "X", "todaySortKey")).toEqual([
			"A",
			"X",
			"B",
			"C",
		]);
	});

	it("renumbers lists with keys from before fractional indexing", () => {
		expect(
			sortedAfter([item("A", "b"), item("X", "zz9"), item("B", "c")], "X"),
		).toEqual(["A", "X", "B"]);
	});

	it("only rewrites keys that change, and patches the moved item", () => {
		const list = [item("A", null), item("X", "a0")];
		const mutations = placeMutations(list, "X", "todaySortKey", {
			evening: true,
		});
		const moved = mutations.find((m) => m.id === "X");
		expect(moved?.type === "upsert" && moved.patch).toMatchObject({
			evening: true,
		});
		expect(mutations.every((m) => m.type === "upsert")).toBe(true);
	});

	it("ignores an unknown moved id", () => {
		expect(placeMutations([item("A", "a0")], "nope", "sortKey")).toEqual([]);
	});
});

describe("list helpers", () => {
	it("moves and inserts", () => {
		expect(arrayMove(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
		expect(arrayMove(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
		expect(insertAt(["a", "b"], "x", 1)).toEqual(["a", "x", "b"]);
		expect(insertAt(["a", "b"], "x", 99)).toEqual(["a", "b", "x"]);
	});
});
