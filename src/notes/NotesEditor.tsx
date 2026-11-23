// The Task Notes editor: Notion-style writing for a to-do's notes, saved as
// Markdown. Loaded on demand (see ./index.tsx) so the list views stay small.

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { editorExtensions } from "./extensions";
import { repairMarkdown, tidyMarkdown } from "./markdown";
import { SlashCommands, type SlashHandlers, type SlashState } from "./slash";

export type NotesEditorProps = {
	value: string;
	onChange: (markdown: string) => void;
	label?: string;
	placeholder?: string;
	editable?: boolean;
	autoFocus?: boolean;
	/** "card" for the open to-do, "page" for the Task Notes' full page. */
	variant?: "card" | "page";
};

export default function NotesEditor({
	value,
	onChange,
	label = "Notes",
	placeholder = "Notes, or type / for blocks",
	editable = true,
	autoFocus = false,
	variant = "card",
}: NotesEditorProps) {
	const [slash, setSlash] = useState<SlashState>(null);
	const [active, setActive] = useState(0);
	const slashRef = useRef(slash);
	const activeRef = useRef(active);
	activeRef.current = active;
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	/** The Markdown this editor last produced or loaded. */
	const current = useRef(value);
	const box = useRef<HTMLDivElement>(null);
	/** Set when Escape closed the "/" menu, so it doesn't also close the to-do. */
	const escapeClosedMenu = useRef(false);

	const handlers = useMemo<SlashHandlers>(
		() => ({
			onChange: (state) => {
				slashRef.current = state;
				setSlash(state);
				setActive(0);
			},
			onKeyDown: (event) => {
				const state = slashRef.current;
				if (!state) return false;
				const count = state.items.length;
				if (event.key === "Escape") {
					escapeClosedMenu.current = true;
					slashRef.current = null;
					setSlash(null);
					return true;
				}
				if (count === 0) return false;
				if (event.key === "ArrowDown") {
					setActive((a) => (a + 1) % count);
					return true;
				}
				if (event.key === "ArrowUp") {
					setActive((a) => (a - 1 + count) % count);
					return true;
				}
				if (event.key === "Enter" || event.key === "Tab") {
					const item = state.items[activeRef.current];
					if (item) state.select(item);
					return true;
				}
				return false;
			},
		}),
		[],
	);

	const editor = useEditor({
		extensions: [
			...editorExtensions(placeholder),
			SlashCommands.configure({ handlers }),
		],
		content: repairMarkdown(value),
		contentType: "markdown",
		editable,
		autofocus: autoFocus ? "end" : false,
		shouldRerenderOnTransaction: false,
		editorProps: {
			attributes: {
				"aria-label": label,
				"aria-multiline": "true",
				role: "textbox",
				class: `notes-editor notes-${variant}`,
			},
		},
		onUpdate: ({ editor }) => {
			const markdown = editor.isEmpty ? "" : tidyMarkdown(editor.getMarkdown());
			if (markdown === current.current) return;
			current.current = markdown;
			onChangeRef.current(markdown);
		},
	});

	// Changes from another device show up unless you're typing here.
	useEffect(() => {
		if (!editor || value === current.current || editor.isFocused) return;
		current.current = value;
		editor.commands.setContent(repairMarkdown(value), {
			contentType: "markdown",
			emitUpdate: false,
		});
	}, [editor, value]);

	useEffect(() => {
		editor?.setEditable(editable, false);
	}, [editor, editable]);

	const inTable = useEditorState({
		editor,
		selector: ({ editor }) =>
			!!editor?.isEditable && !!editor?.isActive("table"),
	});

	const origin = box.current?.getBoundingClientRect();
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: only stops an Escape that closed the block menu
		<div
			ref={box}
			className="relative"
			// Escape that closed the "/" menu shouldn't also close the to-do.
			onKeyDown={(e) => {
				if (e.key !== "Escape") return;
				if (escapeClosedMenu.current) e.stopPropagation();
				escapeClosedMenu.current = false;
			}}
		>
			<EditorContent editor={editor} />
			{editor && inTable && (
				<div
					role="toolbar"
					aria-label="Table"
					className="mt-1 flex flex-wrap gap-1 text-xs"
				>
					{(
						[
							["Add row", () => editor.chain().focus().addRowAfter().run()],
							[
								"Add column",
								() => editor.chain().focus().addColumnAfter().run(),
							],
							["Delete row", () => editor.chain().focus().deleteRow().run()],
							[
								"Delete column",
								() => editor.chain().focus().deleteColumn().run(),
							],
							[
								"Delete table",
								() => editor.chain().focus().deleteTable().run(),
							],
						] as const
					).map(([title, run]) => (
						<button
							key={title}
							type="button"
							onMouseDown={(e) => e.preventDefault()}
							onClick={run}
							className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] pointer-coarse:py-2"
						>
							{title}
						</button>
					))}
				</div>
			)}
			{slash?.rect && origin && (
				<div
					role="listbox"
					aria-label="Insert a block"
					data-popover-content
					className="absolute z-40 max-h-72 w-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 text-sm shadow-[var(--card-shadow)]"
					style={{
						// Stays inside the editor, even near the right edge of a phone.
						left: Math.max(
							0,
							Math.min(slash.rect.left - origin.left, origin.width - 256),
						),
						top: slash.rect.bottom - origin.top + 4,
					}}
				>
					{slash.items.length === 0 ? (
						<p className="px-2 py-1.5 text-xs text-[var(--fg-muted)]">
							No matching block
						</p>
					) : (
						slash.items.map((item, index) => (
							<button
								key={item.title}
								type="button"
								role="option"
								aria-selected={index === active}
								onMouseDown={(e) => e.preventDefault()}
								onMouseEnter={() => setActive(index)}
								onClick={() => slash.select(item)}
								className={`flex w-full flex-col items-start rounded-md px-2 py-1 text-left ${
									index === active ? "bg-[var(--hover)]" : ""
								}`}
							>
								<span>{item.title}</span>
								<span className="text-xs text-[var(--fg-muted)]">
									{item.hint}
								</span>
							</button>
						))
					)}
				</div>
			)}
		</div>
	);
}
