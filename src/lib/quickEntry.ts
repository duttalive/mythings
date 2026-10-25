// Inline tokens in Quick Entry titles (SPEC §10.4):
//   #tag            add a tag (created if it doesn't exist)
//   @today, @tmrw, @someday, @next fri …   when
//   !friday, !dec 3 …                      deadline
//   /Project Name                          move to a project (or area), fuzzy
// Tokens start at the beginning or after a space; a phrase runs to the next
// token. Tokens that don't parse stay in the title.

import type { LocalDate } from "../../shared/dates";
import type { Area, Project, Tag } from "../../shared/schema";
import { type WhenFields, whenPatch } from "../editing/schedule";
import { fuzzyFilter } from "./fuzzy";
import { parseDate, parseWhen } from "./parseDate";

export type QuickEntryToken =
	| { kind: "tag"; raw: string; tagId: string | null; title: string }
	| { kind: "when"; raw: string; fields: WhenFields; label: string }
	| { kind: "deadline"; raw: string; date: LocalDate }
	| {
			kind: "list";
			raw: string;
			projectId: string | null;
			areaId: string | null;
			title: string;
	  };

export type ParsedQuickEntry = {
	title: string;
	tokens: QuickEntryToken[];
};

export type QuickEntryContext = {
	today: LocalDate;
	tags: Tag[];
	projects: Project[];
	areas: Area[];
};

const TOKEN_START = /(^|\s)([#@!/])(?=\S)/g;

export function parseQuickEntry(
	text: string,
	ctx: QuickEntryContext,
): ParsedQuickEntry {
	const starts = [...text.matchAll(TOKEN_START)].map(
		(m) => (m.index ?? 0) + (m[1]?.length ?? 0),
	);
	if (starts.length === 0) return { title: text.trim(), tokens: [] };

	const titleParts = [text.slice(0, starts[0]).trim()];
	const tokens: QuickEntryToken[] = [];
	const liveTags = ctx.tags.filter((t) => t.deletedAt === null);
	const liveProjects = ctx.projects.filter(
		(p) => p.deletedAt === null && p.status === "open",
	);
	const liveAreas = ctx.areas.filter((a) => a.deletedAt === null);

	starts.forEach((start, i) => {
		const raw = text.slice(start, starts[i + 1] ?? text.length).trim();
		const marker = raw[0];
		const value = raw.slice(1).trim();

		if (marker === "#") {
			// Tags are one word; anything after it is title text.
			const [name = "", ...rest] = value.split(/\s+/);
			const existing = liveTags.find(
				(t) => t.title.toLowerCase() === name.toLowerCase(),
			);
			tokens.push({
				kind: "tag",
				raw: `#${name}`,
				tagId: existing?.id ?? null,
				title: existing?.title ?? name,
			});
			if (rest.length) titleParts.push(rest.join(" "));
			return;
		}
		if (marker === "@") {
			const parsed = parseWhen(value, ctx.today);
			if (parsed) {
				const label =
					parsed.kind === "date"
						? parsed.date
						: {
								today: "Today",
								evening: "This Evening",
								someday: "Someday",
								anytime: "Anytime",
							}[parsed.kind];
				tokens.push({
					kind: "when",
					raw,
					fields: whenPatch(parsed, ctx.today),
					label,
				});
				return;
			}
		}
		if (marker === "!") {
			const date = parseDate(value, ctx.today);
			if (date) {
				tokens.push({ kind: "deadline", raw, date });
				return;
			}
		}
		if (marker === "/") {
			const project = fuzzyFilter(value, liveProjects, (p) => p.title)[0];
			const area = project
				? undefined
				: fuzzyFilter(value, liveAreas, (a) => a.title)[0];
			if (project || area) {
				tokens.push({
					kind: "list",
					raw,
					projectId: project?.id ?? null,
					areaId: area?.id ?? null,
					title: (project?.title ?? area?.title) || "",
				});
				return;
			}
		}
		titleParts.push(raw);
	});

	return { title: titleParts.filter(Boolean).join(" ").trim(), tokens };
}
