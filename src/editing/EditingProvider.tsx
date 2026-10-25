// UI state for editing lists: which to-do is expanded into a card, and
// completions that are still "lingering" (shown checked for a moment before the
// item leaves its list, SPEC §10.2).

import { useLocation } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Status } from "../../shared/schema";
import { useOps } from "../sync/hooks";

/** How long a just-completed to-do stays in place, struck through. */
export const LINGER_MS = 1500;

/** What the open card reports so collapsing can tidy up after it. */
export type CardHandle = {
	/** Writes any unsaved title/notes edits. */
	flush: () => void;
	/** True when the to-do has no title, notes or checklist. */
	isBlank: () => boolean;
};

type EditingContextValue = {
	expandedId: string | null;
	expand: (id: string, options?: { fresh?: boolean }) => void;
	collapse: () => void;
	/** Whether the expanded card belongs to a to-do created a moment ago. */
	isFresh: (id: string) => boolean;
	registerCard: (id: string, handle: CardHandle | null) => void;
	/** The status to show for a to-do, accounting for lingering completions. */
	displayStatus: (id: string, status: Status) => Status;
	toggleComplete: (id: string, status: Status) => void;
	/** Ask the title of a just-created project, area or heading to take focus (see useTitleFocus). */
	requestTitleFocus: (id: string) => void;
	/** The id whose title should take focus, if any. */
	titleFocusId: string | null;
	clearTitleFocus: () => void;
};

const EditingContext = createContext<EditingContextValue | null>(null);

export function useEditing(): EditingContextValue {
	const value = useContext(EditingContext);
	if (!value) throw new Error("Must be used inside <EditingProvider>");
	return value;
}

export function EditingProvider({ children }: { children: ReactNode }) {
	const ops = useOps();
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const freshId = useRef<string | null>(null);
	const cards = useRef(new Map<string, CardHandle>());
	const [lingering, setLingering] = useState<ReadonlyMap<string, Status>>(
		new Map(),
	);
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
	// State, not a ref: the new row may already be on screen when the request arrives.
	const [titleFocusId, setTitleFocusId] = useState<string | null>(null);
	const expandedRef = useRef(expandedId);
	expandedRef.current = expandedId;

	const collapse = useCallback(() => {
		const id = expandedRef.current;
		if (!id) return;
		const card = cards.current.get(id);
		card?.flush();
		// A new to-do left blank was never really wanted (as in Things): drop it.
		if (id === freshId.current && card?.isBlank()) {
			void ops.purge("todo", id).catch(console.error);
		}
		freshId.current = null;
		setExpandedId(null);
		// Keep the keyboard on the row the card came from (if focus would otherwise be lost).
		setTimeout(() => {
			const active = document.activeElement;
			if (active && active !== document.body && active.isConnected) return;
			document
				.querySelector<HTMLElement>(`main [data-row-id="${CSS.escape(id)}"]`)
				?.focus();
		}, 0);
	}, [ops]);

	const expand = useCallback(
		(id: string, options?: { fresh?: boolean }) => {
			if (expandedRef.current && expandedRef.current !== id) collapse();
			if (options?.fresh) freshId.current = id;
			setExpandedId(id);
		},
		[collapse],
	);

	// Leaving the list closes the card.
	const { pathname } = useLocation();
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs on route change
	useEffect(() => collapse(), [pathname]);

	const commit = useCallback(
		(id: string, status: Status) => {
			timers.current.delete(id);
			setLingering((current) => {
				const next = new Map(current);
				next.delete(id);
				return next;
			});
			void ops.update("todo", id, { status }).catch(console.error);
		},
		[ops],
	);

	const toggleComplete = useCallback(
		(id: string, status: Status) => {
			const pending = timers.current.get(id);
			if (pending) {
				// Unchecked again before it left: nothing to save.
				clearTimeout(pending);
				timers.current.delete(id);
				setLingering((current) => {
					const next = new Map(current);
					next.delete(id);
					return next;
				});
				return;
			}
			if (status !== "open") {
				void ops.update("todo", id, { status: "open" }).catch(console.error);
				return;
			}
			setLingering((current) => new Map(current).set(id, "completed"));
			timers.current.set(
				id,
				setTimeout(() => commit(id, "completed"), LINGER_MS),
			);
		},
		[ops, commit],
	);

	// Don't lose a completion if the page goes away mid-linger.
	useEffect(() => {
		const flushAll = () => {
			for (const [id, timer] of timers.current) {
				clearTimeout(timer);
				commit(id, "completed");
			}
		};
		const onHide = () => {
			if (document.visibilityState === "hidden") flushAll();
		};
		window.addEventListener("pagehide", flushAll);
		document.addEventListener("visibilitychange", onHide);
		return () => {
			window.removeEventListener("pagehide", flushAll);
			document.removeEventListener("visibilitychange", onHide);
		};
	}, [commit]);

	const value = useMemo<EditingContextValue>(
		() => ({
			expandedId,
			expand,
			collapse,
			isFresh: (id) => freshId.current === id,
			registerCard: (id, handle) => {
				if (handle) cards.current.set(id, handle);
				else cards.current.delete(id);
			},
			displayStatus: (id, status) => lingering.get(id) ?? status,
			toggleComplete,
			requestTitleFocus: setTitleFocusId,
			titleFocusId,
			clearTitleFocus: () => setTitleFocusId(null),
		}),
		[expandedId, expand, collapse, lingering, toggleComplete, titleFocusId],
	);

	return <EditingContext value={value}>{children}</EditingContext>;
}

/**
 * True while a focus request for `id` is pending; the request is cleared once
 * seen. Pass the result as an EditableTitle's autoFocus.
 */
export function useTitleFocus(id: string): boolean {
	const { titleFocusId, clearTitleFocus } = useEditing();
	const wanted = titleFocusId === id;
	useEffect(() => {
		// Child effects (the title's focus) run before this, so clearing here is safe.
		if (wanted) clearTitleFocus();
	}, [wanted, clearTitleFocus]);
	return wanted;
}
