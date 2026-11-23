import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import { documentExtensions } from "../../src/notes/extensions";
import { repairMarkdown, tidyMarkdown } from "../../src/notes/markdown";

const manager = new MarkdownManager({
	extensions: documentExtensions(),
	indentation: { style: "space", size: 2 },
});
const roundTrip = (md: string) =>
	tidyMarkdown(manager.serialize(manager.parse(md)));

describe("Task Notes Markdown", () => {
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

	it("keeps an empty list item and blank lines as they are", () => {
		const doc = {
			type: "doc",
			content: [
				{ type: "paragraph", content: [{ type: "text", text: "Link" }] },
				{ type: "paragraph" },
				{
					type: "orderedList",
					content: [
						{
							type: "listItem",
							content: [
								{
									type: "paragraph",
									content: [{ type: "text", text: "Squats" }],
								},
							],
						},
						{ type: "listItem", content: [{ type: "paragraph" }] },
					],
				},
			],
		};
		const saved = tidyMarkdown(manager.serialize(doc));
		const list = manager
			.parse(saved)
			.content?.find((n) => n.type === "orderedList");
		expect(list?.content).toHaveLength(2);
		// The empty item didn't turn into text in the one before it.
		expect(JSON.stringify(list?.content?.[0])).not.toContain("2.");
	});

	it("repairs an empty list item saved without its space", () => {
		const list = manager
			.parse(repairMarkdown("Link\n\n1. Squats\n2."))
			.content?.find((n) => n.type === "orderedList");
		expect(list?.content).toHaveLength(2);
		expect(repairMarkdown("Total\n2.")).toBe("Total\n2.");
		expect(repairMarkdown("- a\n-")).toBe("- a\n- ");
	});
});
