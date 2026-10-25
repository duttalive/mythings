// The changelog (CHANGELOG.md at the repo root), parsed at build time. The
// newest entry is the app's version: MAJOR.MINOR.PATCH (see CLAUDE.md).

import source from "../CHANGELOG.md?raw";

export type Release = {
	version: string;
	date: string;
	/** Paragraphs and bullet lists, in order. */
	blocks: (
		| { kind: "text"; text: string }
		| { kind: "list"; items: string[] }
	)[];
};

const HEADING = /^## Version (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})\s*$/;

/** Orders "1.10.0" after "1.9.2". Shorter forms ("1") count missing parts as 0. */
export function compareVersions(a: string, b: string): number {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

export function parseChangelog(markdown: string): Release[] {
	const releases: Release[] = [];
	let current: Release | null = null;
	for (const line of markdown.split("\n")) {
		const heading = line.match(HEADING);
		if (heading) {
			current = {
				version: heading[1] as string,
				date: heading[2] as string,
				blocks: [],
			};
			releases.push(current);
			continue;
		}
		if (!current || !line.trim()) continue;
		const last = current.blocks.at(-1);
		if (line.startsWith("- ")) {
			if (last?.kind === "list") last.items.push(line.slice(2).trim());
			else current.blocks.push({ kind: "list", items: [line.slice(2).trim()] });
		} else {
			current.blocks.push({ kind: "text", text: line.trim() });
		}
	}
	return releases.sort((a, b) => compareVersions(b.version, a.version));
}

export const releases = parseChangelog(source);

/** This build's version (the newest changelog entry). */
export const APP_VERSION = releases[0]?.version ?? "0.0.0";
