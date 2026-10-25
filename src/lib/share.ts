// What another app shared to us (Web Share Target, SPEC §11) as a to-do.
// Apps disagree on where things go: the link may come as `url` or inside
// `text`, and `title` may be missing.

const URL_RE = /\bhttps?:\/\/\S+/i;

export function sharedEntry(params: {
	title?: string | null;
	text?: string | null;
	url?: string | null;
}): {
	title: string;
	notes: string;
} {
	const rawText = (params.text ?? "").trim();
	const url = (params.url ?? "").trim() || rawText.match(URL_RE)?.[0] || "";
	// The text without the link (if the link was inside it).
	const text = url ? rawText.replace(url, "").trim() : rawText;
	const [firstLine = "", ...rest] = text.split("\n");
	const title = (params.title ?? "").trim() || firstLine.trim() || url;
	const body = (params.title ?? "").trim() ? text : rest.join("\n").trim();
	return {
		title,
		notes: [body, url !== title ? url : ""].filter(Boolean).join("\n\n"),
	};
}
