// Quick Entry (SPEC §10.4): add a to-do from anywhere. The title understands
// #tag, @when, !deadline and /list tokens; the pickers below do the same.
// Without a list it goes to the current list (or the Inbox).

import { useLocation } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import type { LocalDate } from "../../shared/dates";
import type { Todo } from "../../shared/schema";
import { useAuth } from "../auth/AuthGate";
import { ChipButton } from "../components/controls";
import {
	AreaIcon,
	CalendarIcon,
	FlagIcon,
	InboxIcon,
	TagIcon,
} from "../components/icons";
import { Modal } from "../components/Modal";
import { Popover } from "../components/Popover";
import {
	DeadlinePicker,
	type ListChoice,
	ListPicker,
	TagPicker,
	WhenPicker,
} from "../components/pickers";
import { useListData } from "../data";
import {
	type ListLocation,
	locationFromPath,
	newTodoFields,
} from "../editing/defaults";
import type { WhenFields } from "../editing/schedule";
import { useCreateTag } from "../editing/useCreateTag";
import { dayLabel, shortDate } from "../lib/format";
import { parseQuickEntry } from "../lib/quickEntry";
import { useOps } from "../sync/hooks";

type Panel = "when" | "deadline" | "tags" | "list" | null;

const WHEN_LABELS = {
	inbox: "Inbox",
	anytime: "Anytime",
	someday: "Someday",
} as const;

export function QuickEntry({
	prefill,
	onClose,
}: {
	/** Shared from another app (SPEC §11), or empty. */
	prefill?: { title: string; notes: string };
	onClose: () => void;
}) {
	const { pathname } = useLocation();
	const { data, ctx, projects, areas } = useListData();
	const { user } = useAuth();
	const ops = useOps();
	const createTag = useCreateTag();
	const weekStart = user.settings.weekStart ?? 1;

	const [title, setTitle] = useState(prefill?.title ?? "");
	const [notes, setNotes] = useState(prefill?.notes ?? "");
	const [when, setWhen] = useState<WhenFields | null>(null);
	const [deadline, setDeadline] = useState<LocalDate | null>(null);
	const [tagIds, setTagIds] = useState<string[]>([]);
	const [list, setList] = useState<ListChoice | null>(null);
	const [panel, setPanel] = useState<Panel>(null);
	const [saving, setSaving] = useState(false);

	const parsed = useMemo(
		() =>
			parseQuickEntry(title, {
				today: ctx.today,
				tags: data.tags,
				projects: data.projects,
				areas: data.areas,
			}),
		[title, ctx.today, data.tags, data.projects, data.areas],
	);
	const tokenWhen = parsed.tokens.find((t) => t.kind === "when");
	const tokenDeadline = parsed.tokens.find((t) => t.kind === "deadline");
	const tokenList = parsed.tokens.find((t) => t.kind === "list");
	const tokenTags = parsed.tokens.filter((t) => t.kind === "tag");

	// Tokens win over picker choices.
	const effectiveList: ListChoice | null = tokenList
		? tokenList.projectId
			? { type: "project", id: tokenList.projectId }
			: { type: "area", id: tokenList.areaId as string }
		: list;
	const effectiveWhen = tokenWhen?.fields ?? when;
	const effectiveDeadline = tokenDeadline?.date ?? deadline;

	const save = async () => {
		if (saving || (!parsed.title && !notes.trim())) return;
		setSaving(true);
		try {
			const location: ListLocation = effectiveList
				? effectiveList.type === "inbox"
					? { list: "inbox" }
					: effectiveList.type === "project"
						? { list: "project", projectId: effectiveList.id }
						: { list: "area", areaId: effectiveList.id }
				: locationFromPath(pathname);
			const fields: Partial<Todo> = {
				...newTodoFields(
					location.list === "logbook" || location.list === "trash"
						? { list: "inbox" }
						: location,
					ctx.today,
					data.todos,
				),
				title: parsed.title,
				notes,
			};
			if (effectiveWhen) Object.assign(fields, effectiveWhen);
			if (effectiveDeadline) fields.deadline = effectiveDeadline;
			const newTagIds = await Promise.all(
				tokenTags.filter((t) => !t.tagId).map((t) => createTag(t.title)),
			);
			const allTags = [
				...(fields.tagIds ?? []),
				...tagIds,
				...tokenTags.flatMap((t) => (t.tagId ? [t.tagId] : [])),
				...newTagIds,
			];
			fields.tagIds = [...new Set(allTags)];
			await ops.create("todo", fields);
			onClose();
		} catch (err) {
			console.error("Couldn't add to-do", err);
			setSaving(false);
		}
	};

	const open = (name: Panel) => ({
		open: panel === name,
		onOpenChange: (o: boolean) => setPanel(o ? name : null),
	});
	const listTitle = (choice: ListChoice | null) =>
		!choice
			? "Current list"
			: choice.type === "inbox"
				? "Inbox"
				: choice.type === "project"
					? projects.get(choice.id)?.title || "New Project"
					: areas.get(choice.id)?.title || "New Area";
	const whenTitle = (fields: WhenFields | null) =>
		!fields
			? "When"
			: fields.when === "scheduled" && fields.startDate
				? fields.startDate === ctx.today
					? fields.evening
						? "This Evening"
						: "Today"
					: dayLabel(fields.startDate, ctx.today)
				: WHEN_LABELS[fields.when as keyof typeof WHEN_LABELS];
	const tagTitles = [
		...tagIds.map((id) => data.tags.find((t) => t.id === id)?.title),
		...tokenTags.map((t) => t.title),
	].filter(Boolean);

	const chip = (label: ReactNode, icon: ReactNode, fromToken: boolean) => (
		<ChipButton icon={icon} className={fromToken ? "!text-accent" : undefined}>
			{label}
		</ChipButton>
	);

	return (
		<Modal title="Quick Entry" hideTitle onClose={onClose}>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					void save();
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						void save();
					}
				}}
				className="p-4"
			>
				<input
					// biome-ignore lint/a11y/noAutofocus: the dialog exists to type a to-do
					autoFocus
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					placeholder="New To-Do"
					aria-label="Title"
					aria-describedby="quick-entry-hint"
					className="w-full bg-transparent text-base font-medium outline-none placeholder:text-[var(--fg-muted)]"
				/>
				<textarea
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					rows={2}
					placeholder="Notes"
					aria-label="Notes"
					className="mt-2 w-full resize-none bg-transparent text-sm outline-none placeholder:text-[var(--fg-muted)]"
				/>
				<div className="mt-3 flex flex-wrap items-center gap-1.5">
					<Popover
						label="When"
						{...open("when")}
						trigger={chip(
							whenTitle(effectiveWhen),
							<CalendarIcon className="size-3.5" />,
							!!tokenWhen,
						)}
					>
						<WhenPicker
							value={
								effectiveWhen ?? {
									when: "anytime",
									startDate: null,
									evening: false,
								}
							}
							today={ctx.today}
							weekStart={weekStart}
							onChange={(fields) => {
								setWhen(fields);
								setPanel(null);
							}}
						/>
					</Popover>
					<Popover
						label="Deadline"
						{...open("deadline")}
						trigger={chip(
							effectiveDeadline
								? `Deadline ${shortDate(effectiveDeadline, ctx.today)}`
								: "Deadline",
							<FlagIcon className="size-3.5" />,
							!!tokenDeadline,
						)}
					>
						<DeadlinePicker
							value={effectiveDeadline}
							today={ctx.today}
							weekStart={weekStart}
							onChange={(date) => {
								setDeadline(date);
								setPanel(null);
							}}
						/>
					</Popover>
					<Popover
						label="Tags"
						{...open("tags")}
						trigger={chip(
							tagTitles.length ? tagTitles.join(", ") : "Tags",
							<TagIcon className="size-3.5" />,
							tokenTags.length > 0,
						)}
					>
						<TagPicker
							tags={data.tags}
							selected={tagIds}
							onToggle={(id) =>
								setTagIds((ids) =>
									ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
								)
							}
							onCreate={async (t) => {
								const id = await createTag(t);
								setTagIds((ids) => [...ids, id]);
							}}
						/>
					</Popover>
					<Popover
						label="List"
						{...open("list")}
						trigger={chip(
							listTitle(effectiveList),
							effectiveList?.type === "inbox" ? (
								<InboxIcon className="size-3.5" />
							) : (
								<AreaIcon className="size-3.5" />
							),
							!!tokenList,
						)}
					>
						<ListPicker
							projects={data.projects}
							areas={data.areas}
							selected={effectiveList}
							onSelect={(choice) => {
								setList(choice);
								setPanel(null);
							}}
						/>
					</Popover>
					<button
						type="submit"
						disabled={saving || (!parsed.title && !notes.trim())}
						className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-40"
					>
						Add To-Do
					</button>
				</div>
				<p
					id="quick-entry-hint"
					className="mt-3 text-xs text-[var(--fg-muted)]"
				>
					Type <code>#tag</code>, <code>@tomorrow</code>, <code>!friday</code>{" "}
					or <code>/project</code> in the title. ↩ to add, Esc to cancel.
				</p>
			</form>
		</Modal>
	);
}
