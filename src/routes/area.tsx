import { useNavigate, useParams } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import type { Area } from "../../shared/schema";
import { areaView } from "../../shared/views";
import { ChipButton, EditableTitle, IconButton } from "../components/controls";
import {
	AreaIcon,
	MoreIcon,
	PlusIcon,
	RestoreIcon,
	TagIcon,
	TrashIcon,
} from "../components/icons";
import { Empty, ListPage } from "../components/ListPage";
import { Popover, PopoverOption, useFocusHandoff } from "../components/Popover";
import { TagPicker } from "../components/pickers";
import { ProjectRow, RowList, TodoRow } from "../components/rows";
import { useFilteredContext, useListData, useTagFilter } from "../data";
import { placed, SortableList } from "../dnd/sortable";
import { useTitleFocus } from "../editing/EditingProvider";
import { useCreateList } from "../editing/useCreateList";
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
			titleNode={readOnly ? undefined : <AreaTitle area={view.area} />}
			icon={<AreaIcon className="size-7 shrink-0 text-[var(--fg-muted)]" />}
			header={<AreaDetails area={view.area} />}
			filterable
		>
			{view.projects.length === 0 && view.todos.length === 0 && (
				<Empty>Nothing in this area yet.</Empty>
			)}
			{view.projects.length > 0 && (
				<SortableList
					disabled={!reorderable}
					list={{
						id: `area:${view.area.id}:projects`,
						accepts: ["project"],
						keyField: "sortKey",
						items: placed(
							"project",
							view.projects.map(({ project }) => project),
							"sortKey",
						),
						moveInPatch: () => ({ areaId: view.area.id }),
					}}
				>
					<RowList label="Projects">
						{view.projects.map(({ project }) => (
							<ProjectRow key={project.id} project={project} showStar />
						))}
					</RowList>
				</SortableList>
			)}
			{view.todos.length > 0 && (
				<SortableList
					disabled={!reorderable}
					className={view.projects.length > 0 ? "mt-8" : ""}
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
		</ListPage>
	);
}

function AreaTitle({ area }: { area: Area }) {
	const ops = useOps();
	const autoFocus = useTitleFocus(area.id);
	return (
		<EditableTitle
			value={area.title}
			onSave={(title) =>
				void ops.update("area", area.id, { title }).catch(console.error)
			}
			placeholder="New Area"
			label="Area title"
			autoFocus={autoFocus}
		/>
	);
}

function AreaDetails({ area }: { area: Area }) {
	const ops = useOps();
	const navigate = useNavigate();
	const { data } = useListData();
	const createTag = useCreateTag();
	const { createProject } = useCreateList();
	const [popover, setPopover] = useState<"tags" | "more" | null>(null);
	const focus = useFocusHandoff();
	const update = (patch: Partial<Area>) =>
		void ops.update("area", area.id, patch).catch(console.error);
	const tags = area.tagIds
		.map((id) => data.tags.find((t) => t.id === id))
		.filter((t) => t && t.deletedAt === null);

	if (area.deletedAt !== null) {
		return (
			<div className="mt-2 flex items-center gap-2 text-sm text-[var(--fg-muted)]">
				In Trash
				<button
					type="button"
					onClick={() => void ops.restore("area", area.id).catch(console.error)}
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
				selected={area.tagIds}
				onToggle={(tagId) =>
					update({
						tagIds: area.tagIds.includes(tagId)
							? area.tagIds.filter((t) => t !== tagId)
							: [...area.tagIds, tagId],
					})
				}
				onCreate={async (title) =>
					update({ tagIds: [...area.tagIds, await createTag(title)] })
				}
			/>
		</Popover>
	);

	return (
		<div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--fg-muted)]">
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
					label="Area actions"
					returnFocus={focus.returnFocus}
					open={popover === "more"}
					onOpenChange={(o) => setPopover(o ? "more" : null)}
					trigger={
						<IconButton label="Area actions">
							<MoreIcon className="size-4" />
						</IconButton>
					}
				>
					<PopoverOption
						icon={<PlusIcon className="size-3.5" />}
						onSelect={() => {
							focus.handOff();
							setPopover(null);
							void createProject(area.id).catch(console.error);
						}}
					>
						New Project in Area
					</PopoverOption>
					<PopoverOption
						icon={<TrashIcon className="size-4 text-overdue" />}
						onSelect={() => {
							setPopover(null);
							void ops.remove("area", area.id).catch(console.error);
							void navigate({ to: "/anytime" });
						}}
					>
						<span className="text-overdue">Delete Area</span>
					</PopoverOption>
				</Popover>
			</div>
		</div>
	);
}
