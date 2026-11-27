// The "/" menu: type / in Task Notes to insert a block. The menu itself
// is drawn by NotesEditor from the state this reports.

import { type Editor, Extension, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";

export type BlockCommand = {
	title: string;
	hint: string;
	/** Extra words to match when searching, e.g. "h1" or "checkbox". */
	keywords: string;
	run: (editor: Editor, range: Range) => void;
};

const chain = (editor: Editor, range: Range) =>
	editor.chain().focus().deleteRange(range);

export const BLOCKS: BlockCommand[] = [
	{
		title: "Text",
		hint: "Plain text",
		keywords: "paragraph p",
		run: (e, r) => chain(e, r).setParagraph().run(),
	},
	{
		title: "Heading 1",
		hint: "Big section heading",
		keywords: "h1 title #",
		run: (e, r) => chain(e, r).setHeading({ level: 1 }).run(),
	},
	{
		title: "Heading 2",
		hint: "Medium section heading",
		keywords: "h2 subtitle ##",
		run: (e, r) => chain(e, r).setHeading({ level: 2 }).run(),
	},
	{
		title: "Heading 3",
		hint: "Small section heading",
		keywords: "h3 ###",
		run: (e, r) => chain(e, r).setHeading({ level: 3 }).run(),
	},
	{
		title: "Bulleted list",
		hint: "A simple list",
		keywords: "ul bullet unordered -",
		run: (e, r) => chain(e, r).toggleBulletList().run(),
	},
	{
		title: "Numbered list",
		hint: "A list with numbers",
		keywords: "ol ordered 1.",
		run: (e, r) => chain(e, r).toggleOrderedList().run(),
	},
	{
		title: "Task list",
		hint: "Checkboxes to tick off",
		keywords: "task todo to-do checkbox check []",
		run: (e, r) => chain(e, r).toggleTaskList().run(),
	},
	{
		title: "Toggle",
		hint: "Hide details under a line",
		keywords: "collapse details fold",
		run: (e, r) => chain(e, r).setToggle().run(),
	},
	{
		title: "Callout",
		hint: "Make something stand out",
		keywords: "note info highlight box",
		run: (e, r) => chain(e, r).setCallout().run(),
	},
	{
		title: "Quote",
		hint: "A quotation",
		keywords: "blockquote >",
		run: (e, r) => chain(e, r).toggleBlockquote().run(),
	},
	{
		title: "Code",
		hint: "A block of code",
		keywords: "codeblock pre ```",
		run: (e, r) => chain(e, r).toggleCodeBlock().run(),
	},
	{
		title: "Table",
		hint: "Rows and columns",
		keywords: "grid",
		run: (e, r) =>
			chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
	},
	{
		title: "Divider",
		hint: "A line between sections",
		keywords: "hr rule separator ---",
		run: (e, r) => chain(e, r).setHorizontalRule().run(),
	},
];

export function matchBlocks(query: string): BlockCommand[] {
	const q = query.trim().toLowerCase();
	if (!q) return BLOCKS;
	return BLOCKS.filter((b) =>
		`${b.title} ${b.keywords}`.toLowerCase().includes(q),
	);
}

export type SlashState = {
	items: BlockCommand[];
	/** Where the "/" is, in viewport coordinates. */
	rect: DOMRect | null;
	select: (item: BlockCommand) => void;
} | null;

export type SlashHandlers = {
	onChange: (state: SlashState) => void;
	/** Arrow keys, Enter and Escape while the menu is open; true if handled. */
	onKeyDown: (event: KeyboardEvent) => boolean;
};

export const SlashCommands = Extension.create<{ handlers: SlashHandlers }>({
	name: "slashCommands",
	addOptions() {
		return {
			handlers: { onChange: () => {}, onKeyDown: () => false },
		};
	},
	addProseMirrorPlugins() {
		const { handlers } = this.options;
		const report = (props: SuggestionProps<BlockCommand>) =>
			handlers.onChange({
				items: props.items,
				rect: props.clientRect?.() ?? null,
				select: (item) => props.command(item),
			});
		return [
			Suggestion<BlockCommand>({
				editor: this.editor,
				pluginKey: new PluginKey("slashCommands"),
				char: "/",
				allowSpaces: false,
				startOfLine: false,
				// Not inside code, where "/" is just a character.
				allow: ({ state }) => !state.selection.$from.parent.type.spec.code,
				items: ({ query }) => matchBlocks(query),
				command: ({ editor, range, props }) => props.run(editor, range),
				render: () => ({
					onStart: report,
					onUpdate: report,
					onExit: () => handlers.onChange(null),
					onKeyDown: ({ event }) => handlers.onKeyDown(event),
				}),
			}),
		];
	},
});
