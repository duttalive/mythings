// A small fuzzy scorer for Quick Find and Quick Entry's /project token.
// Higher is better; null means no match. Every word of the query must match.

function scoreWord(q: string, text: string): number | null {
	if (text === q) return 1000;
	if (text.startsWith(q)) return 800 - text.length / 100;
	if (text.split(/[\s\-_/.,:]+/).some((word) => word.startsWith(q)))
		return 600 - text.length / 100;
	const at = text.indexOf(q);
	if (at >= 0) return 400 - at;
	// In order, with gaps (e.g. "wrl" in "website relaunch").
	let from = 0;
	let gaps = 0;
	let last = -1;
	for (const ch of q) {
		const found = text.indexOf(ch, from);
		if (found < 0) return null;
		if (last >= 0) gaps += found - last - 1;
		last = found;
		from = found + 1;
	}
	return Math.max(1, 200 - gaps * 5);
}

export function fuzzyScore(query: string, text: string): number | null {
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return 0;
	const haystack = text.toLowerCase();
	let total = 0;
	for (const word of words) {
		const score = scoreWord(word, haystack);
		if (score === null) return null;
		total += score;
	}
	return total / words.length;
}

/** Items matching the query, best first. */
export function fuzzyFilter<T>(
	query: string,
	items: T[],
	text: (item: T) => string,
): T[] {
	return items
		.map((item) => ({ item, score: fuzzyScore(query, text(item)) }))
		.filter((x): x is { item: T; score: number } => x.score !== null)
		.sort((a, b) => b.score - a.score)
		.map((x) => x.item);
}
