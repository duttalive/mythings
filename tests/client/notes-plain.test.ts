import { describe, expect, it } from "vitest";
import { matchesNotes, plainText, snippet } from "../../src/notes/plain";

describe("Scratch Pad text", () => {
	it("drops Markdown but keeps what was typed", () => {
		expect(
			plainText(
				"# Plan\n\n- [ ] buy \\[2\\] boxes\n- [x] **book** van\n\n:::toggle\n\nMovers at [9](https://x.y)\n\n:::\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n2 \\* 3",
			),
		).toBe("Plan buy [2] boxes book van Movers at 9 A B 1 2 2 * 3");
	});

	it("shows the part of long text that matches", () => {
		const text = `${"word ".repeat(60)}needle and more`;
		expect(snippet(text, "needle", 40)).toMatch(/^….*needle/);
		expect(snippet("short", "", 40)).toBe("short");
	});

	it("matches every word in the title or notes", () => {
		const todo = { title: "Move", notes: "Call the **movers** on Friday" };
		expect(matchesNotes("movers friday", todo)).toBe(true);
		expect(matchesNotes("move movers", todo)).toBe(true);
		expect(matchesNotes("movers sunday", todo)).toBe(false);
	});
});
