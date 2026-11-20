// An Area: an ongoing part of life (like Health or Home) holding to-dos that
// keep coming, with no deadline or end. It sits in a Life Bucket.

import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import type { Area } from "../../shared/schema";
import { areaView, bySortKey } from "../../shared/views";
import { useConfirmDelete } from "../components/ConfirmDelete";
import { ChipButton, EditableTitle, IconButton } from "../components/controls";
import {
	AreaIcon,
	BucketIcon,
	MoreIcon,
	RestoreIcon,
	TagIcon,
	TrashIcon,
} from "../components/icons";
import { Empty, ListPage } from "../components/ListPage";
import { LoggedItems } from "../components/LoggedItems";
import { Popover, PopoverOption, useFocusHandoff } from "../components/Popover";
import { TagPicker } from "../components/pickers";
import { RowList, TodoRow } from "../components/rows";
import { useFilteredContext, useListData, useTagFilter } from "../data";
import { placed, SortableList } from "../dnd/sortable";
import { areaRequest } from "../editing/deleteRequests";
import { useTitleFocus } from "../editing/EditingProvider";
import { newAreaFields } from "../editing/projects";
import { useCreateTag } from "../editing/useCreateTag";
import { useOps } from "../sync/hooks";
import { Missing } from "./not-found";

export function AreaPage() {
	const { areaId } = useParams({ strict: false });
	const { data } = useListData();
	const filtering = useTagFilter().length > 0;
	const view = areaView(data, areaId ?? "", useFilteredContext());
	if (!view) return <Missing what="area" />;
	const readOnly = view.area.deletedAt !== null;
	const reorderable = !readOnly && !filtering;
	return (
		<ListPage
			title={view.area.title || "New Area"}
			titleNode={readOnly ? undefined : <ListTitle list={view.area} />}
			icon={<AreaIcon className="size-7 shrink-0 text-[var(--fg-muted)]" />}
			header={<ListDetails list={view.area} bucket={view.bucket} />}
			filterable
		>
			{view.todos.length === 0 && view.logged.length === 0 && (
				<Empty>
					Nothing in this area yet. Add the to-dos that keep coming up here.
				</Empty>
			)}
			{view.todos.length > 0 && (
				<SortableList
					disabled={!reorderable}
					list={{
						id: `area:${view.area.id}:todos`,
						accepts: ["todo"],
						keyField: "sortKey",
						items: placed("todo", view.todos, "sortKey"),
						moveInPatch: () => ({
							areaId: view.area.id,
							projectId: null,
							headingId: null,
						}),
					}}
				>
					<RowList label="To-dos">
						{view.todos.map((todo) => (
							<TodoRow key={todo.id} todo={todo} showStar readOnly={readOnly} />
						))}
					</RowList>
				</SortableList>
			)}
			<LoggedItems key={view.area.id} entries={view.logged} />
		</ListPage>
	);
}

/** The editable title of an area or Life Bucket. */
export function ListTitle({ list }: { list: Area }) {
	const ops = useOps();
	const autoFocus = useTitleFocus(list.id);
	const bucket = list.kind === "bucket";
	return (
		<EditableTitle
			value={list.title}
			onSave={(title) =>
				void ops.update("area", list.id, { title }).catch(console.error)
			}
			placeholder={bucket ? "New Life Bucket" : "New Area"}
			label={bucket ? "Life Bucket title" : "Area title"}
			autoFocus={autoFocus}
		/>
	);
}

/**
 * Under an area's or Life Bucket's title: the bucket an area is in (and a
 * menu to move it), tags, and actions. `actions` adds options to the menu.
 */
export function ListDetails({
	list,
	bucket,
	actions,
}: {
	list: Area;
	bucket?: Area | undefined;
	actions?: (close: () => void, handOff: () => void) => ReactNode;
}) {
	const ops = useOps();
	const navigate = useNavigate();
	const { data } = useListData();
	const confirmDelete = useConfirmDelete();
	const createTag = useCreateTag();
	const [popover, setPopover] = useState<"tags" | "more" | "move" | null>(null);
	const focus = useFocusHandoff();
	const isBucket = list.kind === "bucket";
	const update = (patch: Partial<Area>) =>
		void ops.update("area", list.id, patch).catch(console.error);
	const tags = list.tagIds
		.map((id) => data.tags.find((t) => t.id === id))
		.filter((t) => t && t.deletedAt === null);
	const liveBuckets = data.buckets
		.filter((b) => b.deletedAt === null)
		.sort(bySortKey);
	// The last Life Bucket stays: every area and project needs one.
	const lastBucket = isBucket && liveBuckets.length <= 1;

	if (list.deletedAt !== null) {
		return (
			<div className="mt-2 flex items-center gap-2 text-sm text-[var(--fg-muted)]">
				In Trash
				<button
					type="button"
					onClick={() => void ops.restore("area", list.id).catch(console.error)}
					className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium hover:bg-[var(--hover)]"
				>
					<RestoreIcon className="size-3.5" />
					Restore
				</button>
			</div>
		);
	}

	const tagsPopover = (trigger: ReactNode) => (
		<Popover
			label="Tags"
			open={popover === "tags"}
			onOpenChange={(o) => setPopover(o ? "tags" : null)}
			trigger={trigger}
		>
			<TagPicker
				tags={data.tags}
				selected={list.tagIds}
				onToggle={(tagId) =>
					update({
						tagIds: list.tagIds.includes(tagId)
							? list.tagIds.filter((t) => t !== tagId)
							: [...list.tagIds, tagId],
					})
				}
				onCreate={async (title) =>
					update({ tagIds: [...list.tagIds, await createTag(title)] })
				}
			/>
		</Popover>
	);

	return (
		<div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--fg-muted)]">
			{bucket && (
				<Link
					to="/bucket/$bucketId"
					params={{ bucketId: bucket.id }}
					className="flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-[var(--hover)] hover:text-[var(--fg)]"
				>
					<BucketIcon className="size-3.5" />
					{bucket.title || "New Life Bucket"}
				</Link>
			)}
			{tags.length > 0 &&
				tagsPopover(
					<ChipButton icon={<TagIcon className="size-3.5" />}>
						{tags.map((t) => t?.title).join(", ")}
					</ChipButton>,
				)}
			<div className="flex items-center">
				{tags.length === 0 &&
					tagsPopover(
						<IconButton label="Tags">
							<TagIcon className="size-4" />
						</IconButton>,
					)}
				<Popover
					label={isBucket ? "Life Bucket actions" : "Area actions"}
					returnFocus={focus.returnFocus}
					open={popover === "more"}
					onOpenChange={(o) => setPopover(o ? "more" : null)}
					trigger={
						<IconButton
							label={isBucket ? "Life Bucket actions" : "Area actions"}
						>
							<MoreIcon className="size-4" />
						</IconButton>
					}
				>
					{actions?.(() => setPopover(null), focus.handOff)}
					{!isBucket && liveBuckets.length > 1 && (
						<>
							<p className="px-2 pt-1 pb-0.5 text-xs font-semibold text-[var(--fg-muted)]">
								Move to Life Bucket
							</p>
							{liveBuckets.map((b) => (
								<PopoverOption
									key={b.id}
									icon={<BucketIcon className="size-4" />}
									pressed={b.id === list.bucketId}
									onSelect={() => {
										setPopover(null);
										if (b.id === list.bucketId) return;
										// At the end of that bucket's areas; the title stays.
										const { bucketId, sortKey } = newAreaFields(
											b.id,
											data.areas,
										);
										update({ bucketId, sortKey });
									}}
								>
									{b.title || "New Life Bucket"}
								</PopoverOption>
							))}
							<div className="my-1 border-t border-[var(--border)]" />
						</>
					)}
					{lastBucket ? (
						<p className="px-2 py-1.5 text-xs text-[var(--fg-muted)]">
							This is your only Life Bucket, so it can't be deleted.
						</p>
					) : (
						<PopoverOption
							icon={<TrashIcon className="size-4 text-overdue" />}
							onSelect={async () => {
								setPopover(null);
								if (!(await confirmDelete(areaRequest(list, data)))) return;
								void ops.remove("area", list.id).catch(console.error);
								void navigate({ to: "/anytime" });
							}}
						>
							<span className="text-overdue">
								{isBucket ? "Delete Life Bucket" : "Delete Area"}
							</span>
						</PopoverOption>
					)}
				</Popover>
			</div>
		</div>
	);
}
