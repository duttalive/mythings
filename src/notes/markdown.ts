// The Markdown saved for Task Notes.

/**
 * Drops blank lines at the start and end, but nothing else: a trailing space
 * can matter (an empty list item is "2. "), so this isn't `trim()`.
 */
export function tidyMarkdown(markdown: string): string {
	return markdown.replace(/^\n+|\n+$/g, "");
}

const ITEM = /^\s*(\d+\.|[-*+])(\s|$)/;
const BARE_ITEM = /^(\s*(?:\d+\.|[-*+]))$/;

/**
 * Notes saved by 2.4.0–2.4.1 could lose the space after an empty list item's
 * marker ("2." instead of "2. "), which then reads as text in the item above.
 * Put the space back so it opens as the empty item it was.
 */
export function repairMarkdown(markdown: string): string {
	const lines = markdown.split("\n");
	return lines
		.map((line, i) =>
			i > 0 && BARE_ITEM.test(line) && ITEM.test(lines[i - 1] ?? "")
				? `${line} `
				: line,
		)
		.join("\n");
}
