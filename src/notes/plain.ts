// Scratch Pad text without its Markdown, for search results and previews.

/** Marks an escaped character while markup is stripped (a private-use character). */
const KEEP = "\uE000";
const MARKS = new RegExp(`(?<!${KEEP})[*_~\`]+`, "g");
const PIPES = new RegExp(`(?<!${KEEP})\\s*\\|\\s*`, "g");

/** Markdown → readable plain text on one line. */
export function plainText(markdown: string): string {
	return markdown
		.split("\n")
		.filter((line) => !/^\s*(:::|```|\|?\s*:?-{3,}|-{3,}\s*$)/.test(line))
		.map((line) =>
			line
				.replace(
					/^\s*(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+\.\s+)/,
					"",
				)
				.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
				// Mark escaped characters (\* \[ …) so they stay as typed.
				.replace(/\\([!-/:-@[-`{-~])/g, `${KEEP}$1`)
				.replace(MARKS, "")
				.replace(PIPES, " ")
				.replaceAll(KEEP, "")
				.trim(),
		)
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * A short piece of the text: from the start, or around the first word of
 * `query` that appears in it.
 */
export function snippet(text: string, query = "", length = 140): string {
	const lower = text.toLowerCase();
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const at = Math.min(
		...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0),
		Number.POSITIVE_INFINITY,
	);
	const start =
		at === Number.POSITIVE_INFINITY || at < length / 2
			? 0
			: Math.max(0, text.lastIndexOf(" ", at - 30) + 1);
	const piece = text.slice(start, start + length);
	return `${start > 0 ? "…" : ""}${piece}${start + length < text.length ? "…" : ""}`;
}

/** Whether every word of `query` appears in the to-do's title or notes. */
export function matchesNotes(
	query: string,
	todo: { title: string; notes: string },
): boolean {
	const haystack = `${todo.title} ${plainText(todo.notes)}`.toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((word) => haystack.includes(word));
}
