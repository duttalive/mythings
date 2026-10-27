// Drag and drop for the whole shell (SPEC §10.7): reorder within a list, move
// between lists on the same page (e.g. headings, Today ↔ This Evening), and
// drop onto sidebar lists. Lists describe themselves through SortableList.

import {
	type CollisionDetection,
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	PointerSensor,
	pointerWithin,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { useConfirmDelete } from "../components/ConfirmDelete";
import { useListData } from "../data";
import { dragToTrashRequest } from "../editing/deleteRequests";
import {
	arrayMove,
	insertAt,
	type KeyField,
	type Placed,
	placeMutations,
} from "../editing/reorder";
import { useOps } from "../sync/hooks";
import {
	type DragKind,
	type SidebarTarget,
	sidebarDropMutations,
} from "./drop";

/** What a sortable list tells the drop handler about itself. */
export type ListDescriptor = {
	id: string;
	accepts: DragKind[];
	keyField: KeyField;
	/** Items in display order. */
	items: Placed[];
	/** Fields to set on an item moved in from another list. */
	moveInPatch?: (item: Placed) => Record<string, unknown>;
};

/** `data` attached to draggables and droppables. */
export type DragData = {
	kind?: DragKind;
	/** Entity id (dnd ids may be prefixed to stay unique). */
	id?: string;
	/** The list it sits in, if sortable. */
	list?: string;
	/** A droppable standing for a whole (possibly empty) list. */
	isList?: boolean;
	/** Sidebar target this item stands for. */
	target?: SidebarTarget;
};

type DndRegistry = {
	register: (list: ListDescriptor) => void;
	unregister: (id: string) => void;
	/** True right after a drag ends, so the click that ends it can be ignored. */
	justDragged: () => boolean;
	activeKind: DragKind | null;
	/** The sortable list on screen that contains an item, if any. */
	listOf: (id: string) => ListDescriptor | undefined;
	/** Moves an item up (-1) or down (+1) within its list (⌘↑ / ⌘↓). */
	moveBy: (id: string, delta: number) => void;
};

const DndRegistryContext = createContext<DndRegistry | null>(null);

export function useDndRegistry(): DndRegistry {
	const value = useContext(DndRegistryContext);
	if (!value) throw new Error("Must be used inside <DndProvider>");
	return value;
}

// Prefer an item under the pointer over the list around it. In a gap between
// rows, fall back to the nearest row of the dragged item's own list — never to
// some other target, or dropping over e.g. Upcoming (not a target) would land
// on a neighbouring sidebar list.
const collisionDetection: CollisionDetection = (args) => {
	// A heading only moves among its project's headings, never into a to-do list.
	const dragged = args.active.data.current as DragData | undefined;
	if (dragged?.kind === "heading")
		return closestCenter({
			...args,
			droppableContainers: args.droppableContainers.filter((c) => {
				const data = c.data.current as DragData | undefined;
				return data?.list === dragged.list && !data?.isList;
			}),
		});
	const within = pointerWithin(args);
	const items = within.filter(
		(c) =>
			!(c.data?.droppableContainer.data.current as DragData | undefined)
				?.isList,
	);
	if (items.length > 0) return items;
	if (within.length > 0) return within;
	const list = (args.active.data.current as DragData | undefined)?.list;
	if (!list) return [];
	return closestCenter({
		...args,
		droppableContainers: args.droppableContainers.filter(
			(c) => (c.data.current as DragData | undefined)?.list === list,
		),
	});
};

/**
 * Mouse and pen drags. Touches are left to the TouchSensor (long press), so a
 * swipe on a row is only a swipe: otherwise it would also start a drag, and
 * dnd-kit swallows the click that follows a drag (e.g. on the delete dialog).
 */
class MouseSensor extends PointerSensor {
	static activators = PointerSensor.activators.map((activator) => ({
		...activator,
		handler: (
			event: React.PointerEvent,
			options: Parameters<typeof activator.handler>[1],
		) =>
			event.nativeEvent.pointerType !== "touch" &&
			activator.handler(event, options),
	}));
}

export function DndProvider({ children }: { children: ReactNode }) {
	const ops = useOps();
	const { data, ctx } = useListData();
	const confirmDelete = useConfirmDelete();
	const lists = useRef(new Map<string, ListDescriptor>());
	const lastDragEnd = useRef(0);
	const [active, setActive] = useState<DragData | null>(null);

	const sensors = useSensors(
		// A few pixels of movement before dragging, so clicks still open rows.
		useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
		// Long-press on touch, so scrolling still works.
		useSensor(TouchSensor, {
			activationConstraint: { delay: 250, tolerance: 6 },
		}),
	);

	const apply = useCallback(
		(mutations: Parameters<typeof ops.apply>[0] | null) => {
			if (mutations && mutations.length > 0)
				void ops.apply(mutations).catch(console.error);
		},
		[ops],
	);

	const onDragEnd = useCallback(
		({ active: activeItem, over }: DragEndEvent) => {
			lastDragEnd.current = Date.now();
			setActive(null);
			const dragged = activeItem.data.current as DragData | undefined;
			const target = over?.data.current as DragData | undefined;
			if (!dragged?.kind || !dragged.id || !target) return;
			if (
				target.id === dragged.id &&
				!target.isList &&
				target.list === dragged.list
			)
				return;

			// Into a sortable list that takes this kind of item.
			const dest = target.list ? lists.current.get(target.list) : undefined;
			if (dest?.accepts.includes(dragged.kind)) {
				const source = dragged.list
					? lists.current.get(dragged.list)
					: undefined;
				const others = dest.items.filter((item) => item.id !== dragged.id);
				const overIndex = target.isList
					? others.length
					: others.findIndex((item) => item.id === target.id);

				if (source?.id === dest.id) {
					const from = dest.items.findIndex((item) => item.id === dragged.id);
					const to = target.isList
						? dest.items.length - 1
						: dest.items.findIndex((item) => item.id === target.id);
					if (from < 0 || to < 0 || from === to) return;
					apply(
						placeMutations(
							arrayMove(dest.items, from, to),
							dragged.id,
							dest.keyField,
						),
					);
				} else {
					const moved = source?.items.find(
						(item) => item.id === dragged.id,
					) ?? {
						entity: dragged.kind,
						id: dragged.id,
						key: null,
					};
					// Coming from another list there's no natural direction, so go by
					// which half of the target row the dragged item was dropped on.
					const draggedRect = activeItem.rect.current.translated;
					const below =
						!!draggedRect &&
						!!over &&
						draggedRect.top + draggedRect.height / 2 >
							over.rect.top + over.rect.height / 2;
					const at =
						overIndex < 0
							? others.length
							: overIndex + (below && !target.isList ? 1 : 0);
					const list = insertAt(others, moved, at);
					apply(
						placeMutations(
							list,
							dragged.id,
							dest.keyField,
							dest.moveInPatch?.(moved) ?? {},
						),
					);
				}
				return;
			}

			// Onto a sidebar list (headings only reorder in their project). Trash asks first.
			if (target.target && dragged.kind !== "heading") {
				const mutations = sidebarDropMutations(
					dragged.kind,
					dragged.id,
					target.target,
					data,
					ctx,
				);
				if (target.target.type !== "trash") return apply(mutations);
				const request = dragToTrashRequest(dragged.kind, dragged.id, data);
				if (!request) return;
				void confirmDelete(request).then((ok) => ok && apply(mutations));
			}
		},
		[apply, data, ctx, confirmDelete],
	);

	const registry = useMemo<DndRegistry>(
		() => ({
			register: (list) => lists.current.set(list.id, list),
			unregister: (id) => lists.current.delete(id),
			justDragged: () => Date.now() - lastDragEnd.current < 200,
			activeKind: active?.kind ?? null,
			listOf: (id) =>
				[...lists.current.values()].find((list) =>
					list.items.some((item) => item.id === id),
				),
			moveBy: (id, delta) => {
				const list = [...lists.current.values()].find((l) =>
					l.items.some((item) => item.id === id),
				);
				if (!list) return;
				const from = list.items.findIndex((item) => item.id === id);
				const to = from + delta;
				if (to < 0 || to >= list.items.length) return;
				apply(
					placeMutations(arrayMove(list.items, from, to), id, list.keyField),
				);
			},
		}),
		[active, apply],
	);

	const title = active?.id
		? active.kind === "todo"
			? data.todos.find((t) => t.id === active.id)?.title || "New To-Do"
			: active.kind === "project"
				? data.projects.find((p) => p.id === active.id)?.title || "New Project"
				: active.kind === "heading"
					? data.headings.find((h) => h.id === active.id)?.title ||
						"New Heading"
					: data.areas.find((a) => a.id === active.id)?.title || "New Area"
		: "";

	return (
		<DndRegistryContext value={registry}>
			<DndContext
				sensors={sensors}
				collisionDetection={collisionDetection}
				onDragStart={({ active: a }: DragStartEvent) =>
					setActive((a.data.current as DragData) ?? null)
				}
				onDragCancel={() => {
					lastDragEnd.current = Date.now();
					setActive(null);
				}}
				onDragEnd={onDragEnd}
			>
				{children}
				<DragOverlay dropAnimation={null}>
					{active && (
						<div className="pointer-events-none max-w-72 truncate rounded-lg bg-[var(--card)] px-3 py-1.5 text-sm font-medium shadow-[var(--card-shadow)] ring-1 ring-[var(--border)]">
							{title}
						</div>
					)}
				</DragOverlay>
			</DndContext>
		</DndRegistryContext>
	);
}
