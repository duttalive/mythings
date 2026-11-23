// A to-do's checklist (SPEC §10.2): editable items that can be reordered by
// dragging their handle, or with ⌘↑ / ⌘↓ while typing in one. Used by the
// open to-do card and by a to-do's Task Notes page.

import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	type Modifier,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChecklistItem } from "../../shared/schema";
import { comboFromEvent } from "../keyboard/keys";
import { keyAfter, keyBetween, keyForMove } from "../lib/order";
import { useOps } from "../sync/hooks";
import { useAutoGrow } from "./controls";
import { GripIcon } from "./icons";

/** Items only move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Adds an empty item after `after` (or at the end) and returns its id. */
export function useAddChecklistItem(
	todoId: string,
	items: ChecklistItem[] | undefined,
) {
	const ops = useOps();
	return useCallback(
		async (after?: ChecklistItem) => {
			const list = items ?? [];
			const index = after
				? list.findIndex((i) => i.id === after.id)
				: list.length - 1;
			const before = index >= 0 ? list[index] : undefined;
			const next = index >= 0 ? list[index + 1] : undefined;
			return ops.create("checklist", {
				todoId,
				title: "",
				sortKey: next
					? keyBetween(before?.sortKey, next.sortKey)
					: keyAfter(before?.sortKey),
			});
		},
		[ops, todoId, items],
	);
}

export function Checklist({
	items,
	focusId,
	onFocusId,
	onAdd,
	onLeaveTop,
	readOnly = false,
	className = "",
}: {
	items: ChecklistItem[];
	/** The item to focus (e.g. one just added). */
	focusId: string | null;
	onFocusId: (id: string | null) => void;
	onAdd: (after: ChecklistItem) => void;
	/** Backspace in the first item, once it's empty, removes it and lands here. */
	onLeaveTop?: () => void;
	readOnly?: boolean;
	className?: string;
}) {
	const ops = useOps();
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);
	// Shown in the new order straight away, before the write comes back.
	const [order, setOrder] = useState<string[] | null>(null);
	const [orderFor, setOrderFor] = useState(items);
	if (orderFor !== items) {
		setOrderFor(items);
		setOrder(null);
	}
	const shown = order
		? order
				.map((id) => items.find((i) => i.id === id))
				.filter((i): i is ChecklistItem => !!i)
		: items;

	const move = (from: number, to: number) => {
		const sortKey = keyForMove(
			shown.map((i) => i.sortKey),
			from,
			to,
		);
		const item = shown[from];
		if (!sortKey || !item) return;
		const ids = shown.map((i) => i.id);
		ids.splice(from, 1);
		ids.splice(to, 0, item.id);
		setOrder(ids);
		void ops.update("checklist", item.id, { sortKey }).catch(console.error);
	};

	const onDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return;
		move(
			shown.findIndex((i) => i.id === active.id),
			shown.findIndex((i) => i.id === over.id),
		);
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			modifiers={[verticalOnly]}
			onDragEnd={onDragEnd}
			accessibility={{
				screenReaderInstructions: {
					draggable:
						"To move a checklist item, press Space or Enter, use the arrow keys, then press Space or Enter again. Escape cancels.",
				},
			}}
		>
			<SortableContext
				items={shown.map((i) => i.id)}
				strategy={verticalListSortingStrategy}
				disabled={readOnly}
			>
				<ul
					aria-label="Checklist"
					className={`border-t border-[var(--border)] ${className}`}
				>
					{shown.map((item, index) => (
						<ChecklistRow
							key={item.id}
							item={item}
							readOnly={readOnly}
							autoFocus={item.id === focusId}
							onEnter={() => onAdd(item)}
							onMove={(by) => {
								const to = index + by;
								if (to < 0 || to >= shown.length) return;
								move(index, to);
							}}
							onRemove={() => {
								const previous = shown[index - 1];
								void ops.purge("checklist", item.id).catch(console.error);
								if (previous) onFocusId(previous.id);
								else onLeaveTop?.();
							}}
						/>
					))}
				</ul>
			</SortableContext>
		</DndContext>
	);
}

function ChecklistRow({
	item,
	readOnly,
	autoFocus,
	onEnter,
	onMove,
	onRemove,
}: {
	item: ChecklistItem;
	readOnly: boolean;
	autoFocus: boolean;
	onEnter: () => void;
	onMove: (by: -1 | 1) => void;
	onRemove: () => void;
}) {
	const ops = useOps();
	const [title, setTitle] = useState(item.title);
	const input = useRef<HTMLTextAreaElement>(null);
	const saved = useRef(item.title);
	useAutoGrow(input, title);
	const {
		setNodeRef,
		setActivatorNodeRef,
		attributes,
		listeners,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.id, disabled: readOnly });

	useEffect(() => {
		if (autoFocus) input.current?.focus();
	}, [autoFocus]);

	const latest = useRef(title);
	latest.current = title;
	const save = useCallback(() => {
		if (latest.current === saved.current) return;
		saved.current = latest.current;
		void ops
			.update("checklist", item.id, { title: latest.current })
			.catch(console.error);
	}, [ops, item.id]);
	// Inputs don't blur when they unmount, so save on the way out too.
	useEffect(() => save, [save]);
	// Keep up with edits from elsewhere (another device, or the other view) while nothing's waiting to save.
	useEffect(() => {
		if (latest.current === saved.current && item.title !== saved.current) {
			saved.current = item.title;
			setTitle(item.title);
		}
	}, [item.title]);

	const label = title || "checklist item";
	return (
		<li
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform), transition }}
			className={`group/item relative flex items-start gap-2 border-b border-[var(--border)] py-1 pointer-coarse:py-2.5 ${
				isDragging ? "z-10 opacity-70 shadow-[var(--card-shadow)]" : ""
			}`}
		>
			{!readOnly && (
				<button
					type="button"
					ref={setActivatorNodeRef}
					{...attributes}
					{...listeners}
					aria-label={`Move: ${label}`}
					title="Drag to reorder"
					className="-ml-5 mt-[0.1rem] shrink-0 cursor-grab touch-none rounded text-[var(--fg-muted)] opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing pointer-coarse:-ml-7 pointer-coarse:-my-1.5 pointer-coarse:p-1.5 pointer-coarse:opacity-60"
				>
					<GripIcon className="size-3.5" />
				</button>
			)}
			<input
				type="checkbox"
				checked={item.done}
				disabled={readOnly}
				aria-label={`Done: ${label}`}
				onChange={() =>
					void ops
						.update("checklist", item.id, { done: !item.done })
						.catch(console.error)
				}
				className="mt-[0.2rem] size-3.5 shrink-0 cursor-pointer appearance-none rounded-full border border-[var(--checkbox)] checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-default"
			/>
			{/* One line that wraps onto more as it grows, like the title. */}
			<textarea
				ref={input}
				value={title}
				rows={1}
				readOnly={readOnly}
				onChange={(e) => setTitle(e.target.value.replace(/\s*\n\s*/g, " "))}
				onBlur={save}
				onKeyDown={(e) => {
					if (readOnly) return;
					const combo = comboFromEvent(e.nativeEvent);
					if (combo === "mod+up" || combo === "mod+down") {
						e.preventDefault();
						e.stopPropagation();
						save();
						onMove(combo === "mod+up" ? -1 : 1);
						// Keep typing in the moved item.
						requestAnimationFrame(() => input.current?.focus());
					} else if (e.key === "Enter") {
						e.preventDefault();
						save();
						onEnter();
					} else if (e.key === "Backspace" && title === "") {
						e.preventDefault();
						onRemove();
					}
				}}
				placeholder="Checklist item"
				aria-label="Checklist item"
				className={`min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-sm break-words outline-none placeholder:text-[var(--fg-muted)] ${
					item.done ? "text-[var(--fg-muted)] line-through" : ""
				}`}
			/>
		</li>
	);
}
