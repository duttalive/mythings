import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import { documentExtensions } from "../../src/notes/extensions";

const manager = new MarkdownManager({
	extensions: documentExtensions(),
	indentation: { style: "space", size: 2 },
});
const roundTrip = (md: string) => manager.serialize(manager.parse(md)).trim();

describe("Scratch Pad Markdown", () => {
	it.each([
		["plain", "Call the garage before Friday."],
		["two lines", "First line\nSecond line"],
		["paragraphs", "One\n\nTwo"],
		["heading and list", "# Plan\n\n- one\n- two"],
		["numbered", "1. first\n2. second"],
		["tasks", "- [ ] buy tape\n- [x] book van"],
		["quote", "> keep calm"],
		["code", "```\nlet x = 1\n```"],
		["divider", "Above\n\n---\n\nBelow"],
		["marks", "**bold** *italic* ~~gone~~ `code` [link](https://example.com)"],
		["table", "| A   | B   |\n| --- | --- |\n| 1   | 2   |"],
		["callout", ":::callout\n\nRemember the keys\n\n:::"],
		["toggle", ':::toggle {open="false"}\n\nDetails\n\nHidden part\n\n:::'],
	])("keeps %s as it was", (_, md) => {
		expect(roundTrip(md)).toBe(md);
	});

	it("reads a toggle's open state and a callout's blocks", () => {
		const doc = manager.parse(':::toggle {open="false"}\nSummary\n\nMore\n:::');
		expect(doc.content?.[0]).toMatchObject({
			type: "toggle",
			attrs: { open: false },
		});
		expect(doc.content?.[0]?.content).toHaveLength(2);
		expect(roundTrip(":::toggle\nOpen one\n:::")).toBe(
			":::toggle\n\nOpen one\n\n:::",
		);
	});
});
