// The Scratch Pad editor, loaded on demand: the first time a to-do opens,
// the editor's code arrives (it's precached, so this works offline too).

import { lazy, Suspense } from "react";
import type { NotesEditorProps } from "./NotesEditor";

const Editor = lazy(() => import("./NotesEditor"));

/** Start loading the editor early (e.g. when the app is idle). */
export function preloadNotesEditor(): void {
	void import("./NotesEditor");
}

export function NotesEditor(props: NotesEditorProps) {
	return (
		<Suspense
			fallback={
				<div
					className={`notes-editor notes-${props.variant ?? "card"} whitespace-pre-wrap text-[var(--fg-muted)]`}
				>
					{props.value || props.placeholder || " "}
				</div>
			}
		>
			<Editor {...props} />
		</Suspense>
	);
}
