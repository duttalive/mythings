// Which to-dos are selected (SPEC §10.7): click, ⌘/Ctrl-click and
// Shift-click, or the arrow keys. Ranges follow the order rows appear on the
// page. Cleared when leaving the list or clicking elsewhere.

import { useLocation } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

export type SelectMode = "only" | "toggle" | "range";

type SelectionValue = {
	selected: ReadonlySet<string>;
	/** Selected ids in page order. */
	selectedIds: () => string[];
	isSelected: (id: string) => boolean;
	select: (id: string, mode?: SelectMode) => void;
	/** Moves (or with `extend`, grows) the selection to the previous/next row. Returns the newly focused id. */
	step: (delta: -1 | 1, extend: boolean) => string | null;
	clear: () => void;
};

const SelectionContext = createContext<SelectionValue | null>(null);

export function useSelection(): SelectionValue {
	const value = useContext(SelectionContext);
	if (!value) throw new Error("Must be used inside <SelectionProvider>");
	return value;
}

/** To-do rows on the page, in order. Rows mark themselves with data-row-id. */
export function visibleRowIds(): string[] {
	return [...document.querySelectorAll<HTMLElement>("main [data-row-id]")].map(
		(el) => el.dataset.rowId as string,
	);
}

export function focusRow(id: string) {
	document
		.querySelector<HTMLElement>(`main [data-row-id="${CSS.escape(id)}"]`)
		?.focus();
}

export function SelectionProvider({ children }: { children: ReactNode }) {
	const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
	const [anchor, setAnchor] = useState<string | null>(null);
	const [cursor, setCursor] = useState<string | null>(null);

	const clear = useCallback(() => {
		setSelected(new Set());
		setAnchor(null);
		setCursor(null);
	}, []);

	// A new list starts with nothing selected.
	const { pathname } = useLocation();
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs on route change
	useEffect(() => clear(), [pathname]);

	// Clicking anywhere that isn't a row (or a menu acting on the selection) clears it.
	useEffect(() => {
		if (selected.size === 0) return;
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Element | null;
			if (
				target?.closest(
					"[data-row-id], [data-bulk-bar], [data-popover-content], [role=dialog], [role=alertdialog], [data-dialog-overlay]",
				)
			)
				return;
			clear();
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [selected, clear]);

	const select = useCallback(
		(id: string, mode: SelectMode = "only") => {
			if (mode === "toggle") {
				setSelected((current) => {
					const next = new Set(current);
					if (next.has(id)) next.delete(id);
					else next.add(id);
					return next;
				});
				setAnchor(id);
			} else if (mode === "range" && anchor) {
				const order = visibleRowIds();
				const a = order.indexOf(anchor);
				const b = order.indexOf(id);
				if (a < 0 || b < 0) {
					setSelected(new Set([id]));
					setAnchor(id);
				} else {
					setSelected(new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1)));
				}
			} else {
				setSelected(new Set([id]));
				setAnchor(id);
			}
			setCursor(id);
		},
		[anchor],
	);

	const step = useCallback(
		(delta: -1 | 1, extend: boolean): string | null => {
			const order = visibleRowIds();
			if (order.length === 0) return null;
			const from = cursor ? order.indexOf(cursor) : -1;
			const index =
				from < 0
					? delta > 0
						? 0
						: order.length - 1
					: Math.min(order.length - 1, Math.max(0, from + delta));
			const id = order[index] as string;
			if (extend && anchor) select(id, "range");
			else select(id, "only");
			return id;
		},
		[cursor, anchor, select],
	);

	const value = useMemo<SelectionValue>(
		() => ({
			selected,
			selectedIds: () => visibleRowIds().filter((id) => selected.has(id)),
			isSelected: (id) => selected.has(id),
			select,
			step,
			clear,
		}),
		[selected, select, step, clear],
	);

	return <SelectionContext value={value}>{children}</SelectionContext>;
}
