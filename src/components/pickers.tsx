// The When, Deadline and Tags popovers' contents (SPEC §10.3).

import {
	type FormEvent,
	type KeyboardEvent,
	type ReactNode,
	useMemo,
	useState,
} from "react";
import type { LocalDate } from "../../shared/dates";
import type { Area, Project, Tag } from "../../shared/schema";
import { bySortKey } from "../../shared/views";
import {
	type WhenChoice,
	type WhenFields,
	whenPatch,
} from "../editing/schedule";
import { tagForShortcut } from "../editing/tags";
import { dayLabel } from "../lib/format";
import { fuzzyFilter } from "../lib/fuzzy";
import { parseDate, parseWhen } from "../lib/parseDate";
import { Calendar } from "./Calendar";
import {
	AreaIcon,
	BoxIcon,
	CheckIcon,
	CrossIcon,
	InboxIcon,
	MoonIcon,
	PlusIcon,
	StarIcon,
} from "./icons";
import { PopoverOption } from "./Popover";
import { ProgressRing } from "./rows";

const inputClass =
	"mb-1 w-full rounded-md border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent";

function Preview({ text }: { text: string | null }) {
	return (
		<p
			className="min-h-5 px-2 pb-1 text-xs text-[var(--fg-muted)]"
			aria-live="polite"
		>
			{text}
		</p>
	);
}

export function WhenPicker({
	value,
	today,
	weekStart,
	onChange,
	footer,
}: {
	value: WhenFields;
	today: LocalDate;
	weekStart: number;
	onChange: (fields: WhenFields) => void;
	/** Extra options under the list (Reminder, Repeat…). */
	footer?: ReactNode;
}) {
	const [text, setText] = useState("");
	const parsed = text.trim() ? parseWhen(text, today) : null;
	const choose = (choice: WhenChoice) => onChange(whenPatch(choice, today));
	const isToday = value.when === "scheduled" && value.startDate === today;

	const submit = (e: FormEvent) => {
		e.preventDefault();
		if (parsed) choose(parsed);
	};

	const preview = !text.trim()
		? null
		: !parsed
			? "Try “tomorrow”, “next fri” or “dec 3”"
			: parsed.kind === "date"
				? dayLabel(parsed.date, today)
				: {
						today: "Today",
						evening: "This Evening",
						someday: "Someday",
						anytime: "Anytime",
					}[parsed.kind];

	return (
		<div>
			<form onSubmit={submit}>
				<input
					// biome-ignore lint/a11y/noAutofocus: the popover exists to type a date
					autoFocus
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder="When"
					aria-label="When (type a date)"
					className={inputClass}
				/>
			</form>
			<Preview text={preview} />
			<PopoverOption
				icon={<StarIcon className="size-4 text-today" />}
				pressed={isToday && !value.evening}
				onSelect={() => choose({ kind: "today" })}
			>
				Today
			</PopoverOption>
			<PopoverOption
				icon={<MoonIcon className="size-4 text-evening" />}
				pressed={isToday && value.evening}
				onSelect={() => choose({ kind: "evening" })}
			>
				This Evening
			</PopoverOption>
			<div className="my-1.5 border-y border-[var(--border)] py-1.5">
				<Calendar
					value={value.when === "scheduled" ? value.startDate : null}
					today={today}
					weekStart={weekStart}
					disablePast
					onSelect={(date) => choose({ kind: "date", date })}
				/>
			</div>
			<PopoverOption
				icon={<BoxIcon className="size-4 text-amber-700" />}
				pressed={value.when === "someday"}
				onSelect={() => choose({ kind: "someday" })}
			>
				Someday
			</PopoverOption>
			{(value.when === "scheduled" || value.when === "someday") && (
				<PopoverOption
					icon={<CrossIcon className="size-3.5" />}
					onSelect={() => choose({ kind: "clear" })}
				>
					Clear
				</PopoverOption>
			)}
			{footer && (
				<div className="mt-1.5 border-t border-[var(--border)] pt-1.5">
					{footer}
				</div>
			)}
		</div>
	);
}

export function DeadlinePicker({
	value,
	today,
	weekStart,
	onChange,
}: {
	value: LocalDate | null;
	today: LocalDate;
	weekStart: number;
	onChange: (deadline: LocalDate | null) => void;
}) {
	const [text, setText] = useState("");
	const parsed = text.trim() ? parseDate(text, today) : null;
	return (
		<div>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (parsed) onChange(parsed);
				}}
			>
				<input
					// biome-ignore lint/a11y/noAutofocus: the popover exists to type a date
					autoFocus
					value={text}
					onChange={(e) => setText(e.target.value)}
					placeholder="Deadline"
					aria-label="Deadline (type a date)"
					className={inputClass}
				/>
			</form>
			<Preview
				text={
					!text.trim()
						? null
						: parsed
							? dayLabel(parsed, today)
							: "Try “friday” or “nov 30”"
				}
			/>
			<Calendar
				value={value}
				today={today}
				weekStart={weekStart}
				onSelect={onChange}
			/>
			{value && (
				<div className="mt-1.5 border-t border-[var(--border)] pt-1.5">
					<PopoverOption
						icon={<CrossIcon className="size-3.5" />}
						onSelect={() => onChange(null)}
					>
						Clear deadline
					</PopoverOption>
				</div>
			)}
		</div>
	);
}

/** Tags with nesting depth, parents before their children. */
function flattenTags(tags: Tag[]): { tag: Tag; depth: number }[] {
	const live = tags.filter((t) => t.deletedAt === null);
	const ids = new Set(live.map((t) => t.id));
	const children = new Map<string | null, Tag[]>();
	for (const tag of live) {
		const parent = tag.parentId && ids.has(tag.parentId) ? tag.parentId : null;
		children.set(parent, [...(children.get(parent) ?? []), tag]);
	}
	const out: { tag: Tag; depth: number }[] = [];
	const visit = (parent: string | null, depth: number) => {
		for (const tag of (children.get(parent) ?? []).sort(bySortKey)) {
			out.push({ tag, depth });
			if (depth < 8) visit(tag.id, depth + 1);
		}
	};
	visit(null, 0);
	return out;
}

export function TagPicker({
	tags,
	selected,
	onToggle,
	onCreate,
}: {
	tags: Tag[];
	selected: string[];
	onToggle: (tagId: string) => void;
	onCreate: (title: string) => void;
}) {
	const [query, setQuery] = useState("");
	const all = useMemo(() => flattenTags(tags), [tags]);
	const q = query.trim().toLowerCase();
	const matches = q
		? all.filter(({ tag }) => tag.title.toLowerCase().includes(q))
		: all;
	const exact = all.some(({ tag }) => tag.title.toLowerCase() === q);

	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		// A tag's shortcut key toggles it, until a search is typed (Shift types the letter).
		const shortcut =
			!query && !e.metaKey && !e.ctrlKey && !e.altKey
				? tagForShortcut(tags, e.key)
				: undefined;
		if (shortcut) {
			e.preventDefault();
			onToggle(shortcut.id);
			return;
		}
		if (e.key !== "Enter") return;
		e.preventDefault();
		if (matches.length === 1 && matches[0]) onToggle(matches[0].tag.id);
		else if (q && !exact) onCreate(query.trim());
		setQuery("");
	};

	return (
		<div>
			<input
				// biome-ignore lint/a11y/noAutofocus: the popover exists to find a tag
				autoFocus
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={onKeyDown}
				placeholder="Tags"
				aria-label="Find or create a tag"
				className={inputClass}
			/>
			<div className="max-h-60 overflow-y-auto">
				{matches.map(({ tag, depth }) => {
					const on = selected.includes(tag.id);
					return (
						<button
							key={tag.id}
							type="button"
							role="menuitemcheckbox"
							aria-checked={on}
							onClick={() => onToggle(tag.id)}
							style={{ paddingLeft: `${0.5 + (q ? 0 : depth) * 0.9}rem` }}
							className="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)] focus-visible:outline-none"
						>
							<span
								className={`flex size-4 shrink-0 items-center justify-center rounded border ${
									on
										? "border-accent bg-accent text-on-accent"
										: "border-[var(--checkbox)]"
								}`}
							>
								{on && <CheckIcon className="size-3" />}
							</span>
							<span className="min-w-0 flex-1 truncate">{tag.title}</span>
							{tag.shortcut && (
								<kbd
									aria-label={`Shortcut ${tag.shortcut}`}
									className="rounded border border-[var(--border)] px-1 font-sans text-[0.6875rem] text-[var(--fg-muted)]"
								>
									{tag.shortcut}
								</kbd>
							)}
						</button>
					);
				})}
				{q && !exact && (
					<PopoverOption
						icon={<PlusIcon className="size-3.5" />}
						onSelect={() => onCreate(query.trim())}
					>
						New tag “{query.trim()}”
					</PopoverOption>
				)}
				{!q && all.length === 0 && (
					<p className="px-2 py-1.5 text-xs text-[var(--fg-muted)]">
						Type a name to create your first tag.
					</p>
				)}
			</div>
		</div>
	);
}

export type ListChoice =
	| { type: "inbox" }
	| { type: "project"; id: string }
	| { type: "area"; id: string };

/** Pick a destination list: the Inbox, an open project, or an area. */
export function ListPicker({
	projects,
	areas,
	selected,
	onSelect,
}: {
	projects: Project[];
	areas: Area[];
	selected?: ListChoice | null;
	onSelect: (choice: ListChoice) => void;
}) {
	const [query, setQuery] = useState("");
	const options: {
		choice: ListChoice;
		title: string;
		kind: "inbox" | "project" | "area";
	}[] = [
		{ choice: { type: "inbox" }, title: "Inbox", kind: "inbox" },
		...projects
			.filter(
				(p) => p.deletedAt === null && p.status === "open" && p.repeat === null,
			)
			.sort(bySortKey)
			.map((p) => ({
				choice: { type: "project", id: p.id } as ListChoice,
				title: p.title || "New Project",
				kind: "project" as const,
			})),
		...areas
			.filter((a) => a.deletedAt === null)
			.sort(bySortKey)
			.map((a) => ({
				choice: { type: "area", id: a.id } as ListChoice,
				title: a.title || "New Area",
				kind: "area" as const,
			})),
	];
	const shown = query.trim()
		? fuzzyFilter(query, options, (o) => o.title)
		: options;
	const isSelected = (choice: ListChoice) =>
		!!selected &&
		selected.type === choice.type &&
		("id" in selected ? selected.id : null) ===
			("id" in choice ? choice.id : null);

	return (
		<div>
			<input
				// biome-ignore lint/a11y/noAutofocus: the popover exists to find a list
				autoFocus
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && shown[0]) {
						e.preventDefault();
						onSelect(shown[0].choice);
					}
				}}
				placeholder="Move to…"
				aria-label="Find a list"
				className={inputClass}
			/>
			<div className="max-h-64 overflow-y-auto">
				{shown.map((option) => (
					<PopoverOption
						key={option.kind + ("id" in option.choice ? option.choice.id : "")}
						pressed={isSelected(option.choice)}
						icon={
							option.kind === "inbox" ? (
								<InboxIcon className="size-4 text-accent" />
							) : option.kind === "area" ? (
								<AreaIcon className="size-4" />
							) : (
								<ProgressRing
									progress={{ completed: 0, total: 0 }}
									decorative
									className="size-3.5"
								/>
							)
						}
						onSelect={() => onSelect(option.choice)}
					>
						{option.title}
					</PopoverOption>
				))}
			</div>
		</div>
	);
}
