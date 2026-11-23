import { describe, expect, it } from "vitest";
import { keyForMove } from "../../src/lib/order";

/** Applies a move: the moved key replaced, then everything sorted. */
function moved(keys: string[], from: number, to: number) {
	const key = keyForMove(keys, from, to);
	if (key === null) return null;
	const ids = keys.map((_, i) => `i${i}`);
	const next = keys.map((k, i) => (i === from ? key : k));
	return ids
		.map((id, i) => ({ id, key: next[i] as string }))
		.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
		.map((x) => x.id);
}

describe("keyForMove", () => {
	const keys = ["a0", "a1", "a2", "a3"];

	it("moves an item down", () => {
		expect(moved(keys, 0, 2)).toEqual(["i1", "i2", "i0", "i3"]);
	});

	it("moves an item up", () => {
		expect(moved(keys, 3, 1)).toEqual(["i0", "i3", "i1", "i2"]);
	});

	it("moves to the very top and bottom", () => {
		expect(moved(keys, 2, 0)).toEqual(["i2", "i0", "i1", "i3"]);
		expect(moved(keys, 1, 3)).toEqual(["i0", "i2", "i3", "i1"]);
	});

	it("returns null when nothing moves or the target is out of range", () => {
		expect(keyForMove(keys, 1, 1)).toBeNull();
		expect(keyForMove(keys, 1, 4)).toBeNull();
		expect(keyForMove(keys, -1, 0)).toBeNull();
	});

	it("works with keys from before fractional indexing", () => {
		const old = ["0001", "0002", "0003"];
		expect(moved(old, 0, 1)).toEqual(["i1", "i0", "i2"]);
		expect(moved(old, 0, 2)).toEqual(["i1", "i2", "i0"]);
	});
});
