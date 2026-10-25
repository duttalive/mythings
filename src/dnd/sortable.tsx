// Building blocks for draggable rows: a sortable list, and an element that is
// sortable inside such a list or merely draggable (to the sidebar) outside one.

import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	type CSSProperties,
	createContext,
	type ReactNode,
	useContext,
	useLayoutEffect,
} from "react";
import type { Placed } from "../editing/reorder";
import {
	type DragData,
	type ListDescriptor,
	useDndRegistry,
} from "./DndProvider";
import { canDrop, type DragKind } from "./drop";

const ListContext = createContext<string | null>(null);

/** Prefix for dnd ids so the same entity can appear in the sidebar and a list. */
export const dndId = (scope: string, id: string) => `${scope}:${id}`;

/**
 * Makes its rows reorderable and lets items be dropped in from other lists.
 * With `disabled` (e.g. while a tag filter hides some items) rows can still be
 * dragged to the sidebar, just not reordered.
 */
export function SortableList({
	list,
	disabled = false,
	children,
	className,
}: {
	list: ListDescriptor;
	disabled?: boolean;
	children: ReactNode;
	className?: string;
}) {
	const { register, unregister } = useDndRegistry();
	useLayoutEffect(() => {
		if (disabled) return;
		register(list);
		return () => unregister(list.id);
	});
	const { setNodeRef } = useDroppable({
		id: dndId("list", list.id),
		data: { list: list.id, isList: true } satisfies DragData,
		disabled,
	});

	if (disabled) return <div className={className}>{children}</div>;
	return (
		<ListContext value={list.id}>
			<SortableContext
				id={list.id}
				items={list.items.map((item) => dndId(list.id, item.id))}
				strategy={verticalListSortingStrategy}
			>
				<div ref={setNodeRef} className={className}>
					{children}
				</div>
			</SortableContext>
		</ListContext>
	);
}

type DragProps = {
	kind: DragKind;
	id: string;
	as?: "li" | "div";
	className?: string;
	/** Sidebar target this element also stands for (sidebar items). */
	target?: DragData["target"];
	disabled?: boolean;
	children: ReactNode;
};

/** Sortable when inside a SortableList, otherwise just draggable. */
export function DragItem(props: DragProps) {
	const list = useContext(ListContext);
	if (props.disabled) {
		const Tag = props.as ?? "li";
		return <Tag className={props.className}>{props.children}</Tag>;
	}
	return list ? (
		<SortableElement {...props} list={list} />
	) : (
		<DraggableElement {...props} />
	);
}

function SortableElement({
	kind,
	id,
	list,
	as = "li",
	className = "",
	target,
	children,
}: DragProps & { list: string }) {
	const {
		setNodeRef,
		listeners,
		transform,
		transition,
		isDragging,
		isOver,
		active,
	} = useSortable({
		id: dndId(list, id),
		data: { kind, id, list, target } satisfies DragData,
	});
	// Something of another kind hovering here will be dropped onto this item (e.g. a to-do onto a project).
	const draggedKind = (active?.data.current as DragData | undefined)?.kind;
	const dropOnto =
		isOver &&
		!!target &&
		!!draggedKind &&
		draggedKind !== kind &&
		canDrop(draggedKind, target.type);
	const style: CSSProperties = {
		transform: CSS.Translate.toString(transform),
		transition,
	};
	const Tag = as;
	// Pointer listeners only: rows keep their own keyboard handling (keyboard reordering is ⌘↑/⌘↓).
	return (
		<Tag
			ref={setNodeRef}
			style={style}
			{...listeners}
			data-drop-target={dropOnto || undefined}
			className={`${className} ${isDragging ? "opacity-40" : ""}`}
		>
			{children}
		</Tag>
	);
}

function DraggableElement({
	kind,
	id,
	as = "li",
	className = "",
	children,
}: DragProps) {
	const { setNodeRef, listeners, isDragging } = useDraggable({
		id: dndId("drag", id),
		data: { kind, id } satisfies DragData,
	});
	const Tag = as;
	return (
		<Tag
			ref={setNodeRef}
			{...listeners}
			className={`${className} ${isDragging ? "opacity-40" : ""}`}
		>
			{children}
		</Tag>
	);
}

/** Rows as Placed items for a list descriptor. */
export function placed<
	T extends { id: string; sortKey: string; todaySortKey?: string | null },
>(
	entity: "todo" | "project" | "area",
	rows: T[],
	keyField: "sortKey" | "todaySortKey",
): Placed[] {
	return rows.map((row) => ({
		entity,
		id: row.id,
		key: keyField === "sortKey" ? row.sortKey : (row.todaySortKey ?? null),
	}));
}
