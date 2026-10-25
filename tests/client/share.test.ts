import { describe, expect, it } from "vitest";
import { sharedEntry } from "../../src/lib/share";

describe("sharedEntry", () => {
	it("uses the shared title and keeps the link in notes", () => {
		expect(
			sharedEntry({ title: "Great article", url: "https://example.com/a" }),
		).toEqual({
			title: "Great article",
			notes: "https://example.com/a",
		});
	});

	it("finds a link inside the text when there's no url field", () => {
		expect(
			sharedEntry({ text: "Read this later https://example.com/b" }),
		).toEqual({
			title: "Read this later",
			notes: "https://example.com/b",
		});
	});

	it("uses the first line of text as the title and the rest as notes", () => {
		expect(sharedEntry({ text: "Groceries\nmilk\neggs" })).toEqual({
			title: "Groceries",
			notes: "milk\neggs",
		});
	});

	it("falls back to the link as the title", () => {
		expect(sharedEntry({ url: "https://example.com/c" })).toEqual({
			title: "https://example.com/c",
			notes: "",
		});
	});

	it("handles nothing", () => {
		expect(sharedEntry({})).toEqual({ title: "", notes: "" });
	});
});
