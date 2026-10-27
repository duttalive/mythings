import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useId, useState } from "react";
import type { Tag } from "../../shared/schema";
import { bySortKey, tagged } from "../../shared/views";
import { useConfirmDelete } from "../components/ConfirmDelete";
import { EditableTitle, IconButton } from "../components/controls";
import { MoreIcon, TagIcon, TrashIcon } from "../components/icons";
import {
	Empty,
	GroupedListView,
	isEmptyGroupedList,
	ListPage,
} from "../components/ListPage";
import { Popover, PopoverOption } from "../components/Popover";
import { useToast } from "../components/Toast";
import { useListData } from "../data";
import { tagRequest } from "../editing/deleteRequests";
import { tagShortcutMutations } from "../editing/tags";
import { useOps } from "../sync/hooks";
import { Missing } from "./not-found";

export function TagPage() {
	const { tagId } = useParams({ strict: false });
	const { data, ctx, tags } = useListData();
	const tag = tagId ? tags.get(tagId) : undefined;
	if (!tag || tag.deletedAt !== null) return <Missing what="tag" />;

	const parent = tag.parentId ? tags.get(tag.parentId) : undefined;
	const children = data.tags
		.filter((t) => t.parentId === tag.id && t.deletedAt === null)
		.sort(bySortKey);
	const list = tagged(data, tag.id, ctx);
	const chip =
		"rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--hover)]";

	return (
		<ListPage
			title={tag.title}
			titleNode={<TagTitle tag={tag} />}
			icon={<TagIcon className="size-7 shrink-0 text-[var(--fg-muted)]" />}
			header={
				<div className="mt-3 flex flex-wrap items-center gap-1.5">
					{parent && (
						<Link
							to="/tag/$tagId"
							params={{ tagId: parent.id }}
							className={chip}
						>
							↑ {parent.title}
						</Link>
					)}
					{children.map((child) => (
						<Link
							key={child.id}
							to="/tag/$tagId"
							params={{ tagId: child.id }}
							className={chip}
						>
							{child.title}
						</Link>
					))}
					{tag.shortcut && (
						<span className="text-xs text-[var(--fg-muted)]">
							Shortcut{" "}
							<kbd className="rounded border border-[var(--border)] px-1 font-sans">
								{tag.shortcut}
							</kbd>
						</span>
					)}
					<TagActions tag={tag} />
				</div>
			}
		>
			{isEmptyGroupedList(list) ? (
				<Empty>Nothing is tagged “{tag.title}”.</Empty>
			) : (
				<GroupedListView list={list} showStar />
			)}
		</ListPage>
	);
}

function TagTitle({ tag }: { tag: Tag }) {
	const ops = useOps();
	return (
		<EditableTitle
			value={tag.title}
			// Tags always need a name; an emptied field keeps the old one.
			onSave={(title) => {
				if (title.trim())
					void ops
						.update("tag", tag.id, { title: title.trim() })
						.catch(console.error);
			}}
			placeholder="Tag name"
			label="Tag name"
		/>
	);
}

/** Every tag below `id` (so it can't become its own ancestor). */
function descendants(tags: Tag[], id: string): Set<string> {
	const out = new Set<string>([id]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const t of tags)
			if (t.parentId && out.has(t.parentId) && !out.has(t.id)) {
				out.add(t.id);
				grew = true;
			}
	}
	return out;
}

function TagActions({ tag }: { tag: Tag }) {
	const ops = useOps();
	const toast = useToast();
	const navigate = useNavigate();
	const { data } = useListData();
	const confirmDelete = useConfirmDelete();
	const [open, setOpen] = useState(false);
	const shortcutId = useId();
	const parentId = useId();
	const excluded = descendants(data.tags, tag.id);
	const parents = data.tags
		.filter((t) => t.deletedAt === null && !excluded.has(t.id))
		.sort(bySortKey);

	return (
		<Popover
			label="Tag actions"
			open={open}
			onOpenChange={setOpen}
			trigger={
				<IconButton label="Tag actions">
					<MoreIcon className="size-4" />
				</IconButton>
			}
		>
			<div className="flex flex-col gap-2 px-2 py-1.5">
				<label htmlFor={shortcutId} className="flex items-center gap-2">
					<span className="flex-1">Shortcut key</span>
					<input
						id={shortcutId}
						value={tag.shortcut ?? ""}
						maxLength={1}
						aria-describedby={`${shortcutId}-hint`}
						onChange={(e) => {
							const key = e.target.value.slice(-1).toLowerCase() || null;
							void ops
								.apply(tagShortcutMutations(data.tags, tag.id, key))
								.catch(console.error);
						}}
						className="w-9 rounded-md border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5 text-center"
					/>
				</label>
				<p id={`${shortcutId}-hint`} className="text-xs text-[var(--fg-muted)]">
					Press it in a tag list to toggle this tag.
				</p>
				<label htmlFor={parentId} className="flex items-center gap-2">
					<span className="flex-1">Inside</span>
					<select
						id={parentId}
						value={tag.parentId ?? ""}
						onChange={(e) =>
							void ops
								.update("tag", tag.id, { parentId: e.target.value || null })
								.catch(console.error)
						}
						className="max-w-36 rounded-md border border-[var(--border)] bg-[var(--bg)] px-1 py-0.5"
					>
						<option value="">No parent</option>
						{parents.map((t) => (
							<option key={t.id} value={t.id}>
								{t.title}
							</option>
						))}
					</select>
				</label>
			</div>
			<div className="my-1 border-t border-[var(--border)]" />
			<PopoverOption
				icon={<TrashIcon className="size-4 text-overdue" />}
				onSelect={async () => {
					setOpen(false);
					if (!(await confirmDelete(tagRequest(tag, data)))) return;
					void ops
						.remove("tag", tag.id)
						.then(() =>
							toast.show(`Deleted “${tag.title}”`, {
								label: "Undo",
								run: () => void ops.undo().catch(console.error),
							}),
						)
						.catch(console.error);
					void navigate({ to: "/today" });
				}}
			>
				<span className="text-overdue">Delete Tag</span>
			</PopoverOption>
		</Popover>
	);
}
