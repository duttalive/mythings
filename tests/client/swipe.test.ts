import { describe, expect, it } from "vitest";
import {
	decide,
	offsetFor,
	SWIPE_THRESHOLD,
	swipeResult,
} from "../../src/components/swipe";
import { importSummary } from "../../src/lib/transfer";

describe("swipe gestures", () => {
	it("waits for a few pixels before deciding", () => {
		expect(decide(5, 3)).toBe("pending");
	});

	it("swipes when the move is mostly sideways, otherwise scrolls", () => {
		expect(decide(-30, 4)).toBe("swiping");
		expect(decide(20, 18)).toBe("scrolling");
		expect(decide(2, 40)).toBe("scrolling");
	});

	it("follows the finger, with resistance past the limit", () => {
		expect(offsetFor(50)).toBe(50);
		expect(offsetFor(-120)).toBe(-120);
		expect(offsetFor(220)).toBe(140);
	});

	it("acts only past the threshold, in the swipe's direction", () => {
		expect(swipeResult(SWIPE_THRESHOLD - 1)).toBeNull();
		expect(swipeResult(SWIPE_THRESHOLD)).toBe("right");
		expect(swipeResult(-SWIPE_THRESHOLD)).toBe("left");
	});
});

describe("importSummary", () => {
	it("reports what was imported and left out", () => {
		expect(importSummary({ imported: 1, skipped: 0, errors: [] })).toBe(
			"Imported 1 item.",
		);
		expect(importSummary({ imported: 12, skipped: 2, errors: [{}] })).toBe(
			"Imported 12 items. 2 items in the Trash or incomplete were left out. 1 item couldn't be imported.",
		);
	});
});
