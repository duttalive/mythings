// A heading inside a project: editable title, its to-dos, and a menu to add
// a to-do, move it up or down, archive/unarchive, or delete it (SPEC §5.3).
// Active headings can also be dragged by their title bar.

import { type ReactNode, useId, useState } from "react";
import type { Heading } from "../../shared/schema";
import { bySortKey } from "../../shared/views";
import { useListData } from "../data";
import { useSortableHandle } from "../dnd/sortable";
import { headingRequest } from "../editing/deleteRequests";
import { useEditing, useTitleFocus } from "../editing/EditingProvider";
import {
	canArchiveHeading,
	newTodoUnderHeadingFields,
} from "../editing/projects";
import { placeMutations } from "../editing/reorder";
import { useOps } from "../sync/hooks";
import { useConfirmDelete } from "./ConfirmDelete";
import { EditableTitle, IconButton } from "./controls";
import {
	BoxIcon,
	ChevronIcon,
	MoreIcon,
	PlusIcon,
	RestoreIcon,
	TrashIcon,
} from "./icons";
import { Popover, PopoverOption, useFocusHandoff } from "./Popover";

export function HeadingSection({
	heading,
	children,
	readOnly = false,
}: {
	heading: Heading;
	children: ReactNode;
	readOnly?: boolean;
}) {
	const ops = useOps();
	const { data } = useListData();
	const confirmDelete = useConfirmDelete();
	const { expand } = useEditing();
	const [menuOpen, setMenuOpen] = useState(false);
	const focus = useFocusHandoff();
	const [expanded, setExpanded] = useState(false);
	const autoFocus = useTitleFocus(heading.id);
	const titleId = useId();
	const archivable = canArchiveHeading(heading.id, data.todos);
	const sortable = useSortableHandle("heading", heading.id);

	// The project's active headings in order, for Move Up / Move Down.
	const siblings = data.headings
		.filter(
			(h) =>
				h.projectId === heading.projectId &&
				h.deletedAt === null &&
				!h.archived,
		)
		.sort(bySortKey);
	const index = siblings.findIndex((h) => h.id === heading.id);
	const move = (delta: -1 | 1) => {
		setMenuOpen(false);
		const order = siblings.map((h) => ({
			entity: "heading" as const,
			id: h.id,
			key: h.sortKey,
		}));
		const [moved] = order.splice(index, 1);
		if (!moved) return;
		order.splice(index + delta, 0, moved);
		void ops
			.apply(placeMutations(order, heading.id, "sortKey"))
			.catch(console.error);
	};

	const addTodo = async () => {
		focus.handOff();
		setMenuOpen(false);
		const id = await ops.create(
			"todo",
			newTodoUnderHeadingFields(heading, data.todos),
		);
		expand(id, { fresh: true });
	};

	const menu = !readOnly && (
		<Popover
			label="Heading actions"
			returnFocus={focus.returnFocus}
			open={menuOpen}
			onOpenChange={setMenuOpen}
			trigger={
				<IconButton label={`Actions for ${heading.title || "heading"}`}>
					<MoreIcon className="size-4" />
				</IconButton>
			}
		>
			{!heading.archived && (
				<PopoverOption
					icon={<PlusIcon className="size-3.5" />}
					onSelect={addTodo}
				>
					Add To-Do
				</PopoverOption>
			)}
			{!heading.archived && index > 0 && (
				<PopoverOption
					icon={<ChevronIcon className="size-4 -rotate-90" />}
					onSelect={() => move(-1)}
				>
					Move Up
				</PopoverOption>
			)}
			{!heading.archived && index >= 0 && index < siblings.length - 1 && (
				<PopoverOption
					icon={<ChevronIcon className="size-4 rotate-90" />}
					onSelect={() => move(1)}
				>
					Move Down
				</PopoverOption>
			)}
			{heading.archived ? (
				<PopoverOption
					icon={<RestoreIcon className="size-4" />}
					onSelect={() => {
						setMenuOpen(false);
						void ops
							.update("heading", heading.id, { archived: false })
							.catch(console.error);
					}}
				>
					Unarchive
				</PopoverOption>
			) : archivable ? (
				<PopoverOption
					icon={<BoxIcon className="size-4" />}
					onSelect={() => {
						setMenuOpen(false);
						void ops
							.update("heading", heading.id, { archived: true })
							.catch(console.error);
					}}
				>
					Archive
				</PopoverOption>
			) : (
				<p className="px-2 py-1.5 text-xs text-[var(--fg-muted)]">
					Complete its to-dos to archive it.
				</p>
			)}
			<PopoverOption
				icon={<TrashIcon className="size-4 text-overdue" />}
				onSelect={async () => {
					setMenuOpen(false);
					if (!(await confirmDelete(headingRequest(heading, data)))) return;
					void ops.remove("heading", heading.id).catch(console.error);
				}}
			>
				<span className="text-overdue">Delete Heading</span>
			</PopoverOption>
		</Popover>
	);

	if (heading.archived) {
		return (
			<section aria-labelledby={titleId} className="mt-8">
				<div className="flex items-center gap-1 border-b border-[var(--border)] pb-1">
					<button
						type="button"
						aria-expanded={expanded}
						onClick={() => setExpanded((e) => !e)}
						className="flex flex-1 items-center gap-1.5 rounded px-2 text-left text-[0.9375rem] font-semibold text-[var(--fg-muted)] focus-visible:outline-2 focus-visible:outline-accent"
					>
						<ChevronIcon
							className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
						/>
						<span id={titleId}>{heading.title || "New Heading"}</span>
						<span className="text-xs font-normal">· Archived</span>
					</button>
					{menu}
				</div>
				{expanded && children}
			</section>
		);
	}

	return (
		<section
			ref={sortable.setNodeRef}
			style={sortable.style}
			aria-labelledby={titleId}
			className={`mt-8 ${sortable.isDragging ? "opacity-40" : ""}`}
		>
			<div
				{...sortable.handle}
				className="group/heading flex items-center gap-1 border-b border-[var(--border)] pb-1 pl-2"
			>
				<h2 id={titleId} className="sr-only">
					{heading.title || "New Heading"}
				</h2>
				{readOnly ? (
					<span className="flex-1 text-[0.9375rem] font-semibold">
						{heading.title || "New Heading"}
					</span>
				) : (
					<EditableTitle
						value={heading.title}
						onSave={(title) =>
							void ops
								.update("heading", heading.id, { title })
								.catch(console.error)
						}
						placeholder="New Heading"
						label="Heading title"
						autoFocus={autoFocus}
						className="text-[0.9375rem] font-semibold"
					/>
				)}
				<span className="opacity-0 group-hover/heading:opacity-100 group-focus-within/heading:opacity-100 [@media(hover:none)]:opacity-100">
					{menu}
				</span>
			</div>
			{children}
		</section>
	);
}
