// The Task Notes editor's building blocks (SPEC §10.2): Notion-style blocks
// that are saved as Markdown in a to-do's `notes`, so sync, encryption, export
// and repeats keep working on plain text. Toggles and callouts use Pandoc-style
// `:::toggle` / `:::callout` blocks; tables and checkboxes use GitHub Markdown.

import {
	type AnyExtension,
	createBlockMarkdownSpec,
	mergeAttributes,
	Node,
} from "@tiptap/core";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		toggle: { setToggle: () => ReturnType };
		callout: { setCallout: () => ReturnType };
	}
}

/**
 * A toggle: its first block is the summary, the rest shows only while it's
 * open. Saved as `:::toggle {open="false"}` … `:::`.
 */
export const Toggle = Node.create({
	name: "toggle",
	group: "block",
	content: "block+",
	defining: true,
	addAttributes() {
		return {
			open: {
				default: true,
				parseHTML: (el) => el.getAttribute("data-open") !== "false",
				renderHTML: (attrs) => ({ "data-open": attrs.open ? "true" : "false" }),
			},
		};
	},
	parseHTML: () => [{ tag: "div[data-toggle]" }],
	renderHTML: ({ HTMLAttributes }) => [
		"div",
		mergeAttributes(HTMLAttributes, { "data-toggle": "" }),
		0,
	],
	...createBlockMarkdownSpec({
		nodeName: "toggle",
		allowedAttributes: ["open"],
		parseAttributes: (attrs) => ({ open: !/open="?false"?/.test(attrs) }),
		serializeAttributes: (attrs) =>
			attrs.open === false ? 'open="false"' : "",
	}),
	addCommands() {
		return {
			setToggle:
				() =>
				({ commands }) =>
					commands.wrapIn(this.name),
		};
	},
	addNodeView() {
		return ({ node, getPos, editor }) => {
			const dom = document.createElement("div");
			dom.setAttribute("data-toggle", "");
			dom.setAttribute("data-open", node.attrs.open ? "true" : "false");
			const button = document.createElement("button");
			button.type = "button";
			button.contentEditable = "false";
			button.className = "toggle-button";
			button.setAttribute("aria-label", "Show or hide");
			button.setAttribute("aria-expanded", String(node.attrs.open));
			button.addEventListener("mousedown", (e) => e.preventDefault());
			button.addEventListener("click", () => {
				const pos = typeof getPos === "function" ? getPos() : undefined;
				if (pos === undefined) return;
				const open = dom.getAttribute("data-open") !== "true";
				editor.view.dispatch(
					editor.view.state.tr.setNodeAttribute(pos, "open", open),
				);
			});
			const content = document.createElement("div");
			content.className = "toggle-content";
			dom.append(button, content);
			return {
				dom,
				contentDOM: content,
				update: (updated) => {
					if (updated.type.name !== "toggle") return false;
					dom.setAttribute("data-open", updated.attrs.open ? "true" : "false");
					button.setAttribute("aria-expanded", String(updated.attrs.open));
					return true;
				},
				// Toggling only changes an attribute; don't rebuild for it.
				ignoreMutation: (m) => m.type === "attributes" && m.target === dom,
			};
		};
	},
});

/** A highlighted box for something to notice. Saved as `:::callout` … `:::`. */
export const Callout = Node.create({
	name: "callout",
	group: "block",
	content: "block+",
	defining: true,
	parseHTML: () => [{ tag: "div[data-callout]" }],
	renderHTML: ({ HTMLAttributes }) => [
		"div",
		mergeAttributes(HTMLAttributes, { "data-callout": "" }),
		0,
	],
	...createBlockMarkdownSpec({
		nodeName: "callout",
		allowedAttributes: [],
	}),
	addCommands() {
		return {
			setCallout:
				() =>
				({ commands }) =>
					commands.wrapIn(this.name),
		};
	},
});

/** Everything that defines the document and its Markdown (no UI). */
export function documentExtensions(): AnyExtension[] {
	return [
		StarterKit.configure({
			heading: { levels: [1, 2, 3] },
			link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
			// Markdown has no underline; keep notes portable.
			underline: false,
		}),
		TaskList,
		TaskItem.configure({ nested: true }),
		TableKit.configure({ table: { resizable: false } }),
		Toggle,
		Callout,
		Markdown.configure({ indentation: { style: "space", size: 2 } }),
	];
}

export function editorExtensions(placeholder: string): AnyExtension[] {
	return [
		...documentExtensions(),
		Placeholder.configure({
			// The full hint while the note is empty; a short one on other empty lines.
			placeholder: ({ editor, node }) =>
				node.type.name === "heading"
					? "Heading"
					: editor.isEmpty
						? placeholder
						: "Type / for blocks",
			showOnlyCurrent: true,
		}),
	];
}
