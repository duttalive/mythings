// Global keyboard shortcuts (SPEC §10.6) and the dialogs they open.

import { useLocation, useNavigate } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useBulkBar } from "../components/BulkBar";
import { useListData } from "../data";
import { useDndRegistry } from "../dnd/DndProvider";
import { locationFromPath } from "../editing/defaults";
import { useEditing } from "../editing/EditingProvider";
import { newHeadingFields } from "../editing/projects";
import { focusRow, useSelection } from "../editing/SelectionProvider";
import { whenPatch } from "../editing/schedule";
import { useBulkActions } from "../editing/useBulkActions";
import { useNewTodo } from "../editing/useNewTodo";
import { useOps } from "../sync/hooks";
import { comboFromEvent, isEditableTarget, printableChar } from "./keys";
import { QuickEntry } from "./QuickEntry";
import { QuickFind } from "./QuickFind";
import { ShortcutHelp } from "./ShortcutHelp";
import { LIST_KEYS } from "./shortcuts";

type Dialog =
	| { kind: "find"; query: string }
	| { kind: "entry"; prefill?: { title: string; notes: string } }
	| { kind: "help" }
	| null;

const KeyboardContext = createContext<{
	openQuickEntry: (prefill?: { title: string; notes: string }) => void;
	openQuickFind: () => void;
} | null>(null);

export function useKeyboard() {
	const value = useContext(KeyboardContext);
	if (!value) throw new Error("Must be used inside <KeyboardProvider>");
	return value;
}

/** How long after "g" a second key counts as a go-to sequence. */
const SEQUENCE_MS = 800;

export function KeyboardProvider({ children }: { children: ReactNode }) {
	const [dialog, setDialog] = useState<Dialog>(null);
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const ops = useOps();
	const { data, ctx } = useListData();
	const { expandedId, expand, collapse, requestTitleFocus } = useEditing();
	const selection = useSelection();
	const bulk = useBulkActions();
	const { openPanel } = useBulkBar();
	const { moveBy } = useDndRegistry();
	const newTodo = useNewTodo();
	const pendingG = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Read the latest state from the listener without re-subscribing on every render.
	const state = useRef({
		dialog,
		pathname,
		expandedId,
		selection,
		bulk,
		newTodo,
		data,
		ctx,
	});
	state.current = {
		dialog,
		pathname,
		expandedId,
		selection,
		bulk,
		newTodo,
		data,
		ctx,
	};

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const s = state.current;
			if (e.defaultPrevented || e.isComposing || s.dialog) return;
			const target = e.target as HTMLElement | null;
			// Dialogs and popovers handle their own keys.
			if (target?.closest("[role=dialog], [data-popover-content]")) return;

			const combo = comboFromEvent(e);
			const handled = () => e.preventDefault();

			if (combo === "alt+space") {
				handled();
				setDialog({ kind: "entry" });
				return;
			}
			if (isEditableTarget(target)) return;
			// Radio groups move with the arrow keys.
			if (
				/^(up|down|left|right)$/.test(combo) &&
				target?.matches("[type=radio]")
			)
				return;
			// Let buttons, links and checkboxes keep Space/Enter.
			if (
				(combo === "space" || combo === "enter") &&
				target?.matches("button, a, input, summary, select")
			)
				return;

			// The second key of a "g" sequence.
			if (pendingG.current) {
				clearTimeout(pendingG.current);
				pendingG.current = null;
				const route = LIST_KEYS[combo];
				handled();
				if (route && /^[a-z]$/.test(combo)) void navigate({ to: route });
				else setDialog({ kind: "find", query: `g${printableChar(e) ?? ""}` });
				return;
			}

			const ids = s.selection.selectedIds();
			const one = ids.length === 1 ? ids[0] : undefined;
			const schedule = (kind: "today" | "evening" | "anytime" | "someday") => {
				if (ids.length) s.bulk.schedule(ids, whenPatch({ kind }, s.ctx.today));
			};

			switch (combo) {
				case "mod+z":
					handled();
					void ops.undo().catch(console.error);
					return;
				case "mod+shift+z":
				case "mod+y":
					handled();
					void ops.redo().catch(console.error);
					return;
				case "mod+,":
					handled();
					void navigate({ to: "/settings" });
					return;
				case "?":
					handled();
					setDialog({ kind: "help" });
					return;
				case "space":
				case "alt+n":
					handled();
					void s.newTodo.create(ids.at(-1)).catch(console.error);
					return;
				case "alt+shift+n": {
					const location = locationFromPath(s.pathname);
					if (location.list !== "project") return;
					handled();
					void ops
						.create(
							"heading",
							newHeadingFields(location.projectId, s.data.headings),
						)
						.then(requestTitleFocus)
						.catch(console.error);
					return;
				}
				case "up":
				case "down":
				case "shift+up":
				case "shift+down": {
					handled();
					const id = s.selection.step(
						combo.endsWith("up") ? -1 : 1,
						combo.startsWith("shift"),
					);
					if (id) focusRow(id);
					return;
				}
				case "mod+up":
				case "mod+down":
					if (!one) return;
					handled();
					moveBy(one, combo === "mod+up" ? -1 : 1);
					return;
				case "enter":
					if (!one) return;
					handled();
					expand(one);
					return;
				case "escape":
					if (s.expandedId) collapse();
					else s.selection.clear();
					return;
				case "mod+k":
					if (!ids.length) return;
					handled();
					s.bulk.toggleComplete(ids);
					return;
				case "mod+alt+k":
					if (!ids.length) return;
					handled();
					s.bulk.cancel(ids);
					return;
				case "mod+s":
					// Never the browser's "Save page".
					handled();
					if (ids.length) openPanel("when");
					return;
				case "mod+shift+d":
				case "mod+shift+t":
				case "mod+shift+m":
					if (!ids.length) return;
					handled();
					openPanel(
						combo === "mod+shift+d"
							? "deadline"
							: combo === "mod+shift+t"
								? "tags"
								: "move",
					);
					return;
				case "alt+t":
				case "alt+e":
				case "alt+r":
				case "alt+o":
					if (!ids.length) return;
					handled();
					schedule(
						(
							{
								"alt+t": "today",
								"alt+e": "evening",
								"alt+r": "anytime",
								"alt+o": "someday",
							} as const
						)[combo],
					);
					return;
				case "backspace":
				case "delete":
					if (!ids.length) return;
					handled();
					s.bulk.remove(ids);
					s.selection.clear();
					return;
			}

			const listKey = combo.startsWith("mod+")
				? LIST_KEYS[combo.slice(4)]
				: undefined;
			if (listKey && /^mod\+[1-6]$/.test(combo)) {
				handled();
				void navigate({ to: listKey });
				return;
			}

			// Any other printable key starts Quick Find (after "g", wait briefly for a sequence).
			const char = printableChar(e);
			if (char && char !== "?") {
				handled();
				if (char === "g") {
					pendingG.current = setTimeout(() => {
						pendingG.current = null;
						setDialog({ kind: "find", query: "g" });
					}, SEQUENCE_MS);
				} else {
					setDialog({ kind: "find", query: char });
				}
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [navigate, ops, expand, collapse, requestTitleFocus, openPanel, moveBy]);

	const value = useMemo(
		() => ({
			openQuickEntry: (prefill?: { title: string; notes: string }) =>
				setDialog({ kind: "entry", prefill }),
			openQuickFind: () => setDialog({ kind: "find", query: "" }),
		}),
		[],
	);

	const close = () => setDialog(null);
	return (
		<KeyboardContext value={value}>
			{children}
			{dialog?.kind === "find" && (
				<QuickFind initialQuery={dialog.query} onClose={close} />
			)}
			{dialog?.kind === "entry" && (
				<QuickEntry prefill={dialog.prefill} onClose={close} />
			)}
			{dialog?.kind === "help" && <ShortcutHelp onClose={close} />}
		</KeyboardContext>
	);
}
