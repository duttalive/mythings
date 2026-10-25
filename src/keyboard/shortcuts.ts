// The shortcut table (SPEC §10.6), shown in the help dialog. Handling lives in
// KeyboardProvider (and TodoCard for the open card).

export type ShortcutGroup =
	| "Create"
	| "Navigate"
	| "Edit"
	| "Schedule"
	| "Other";

export type Shortcut = {
	combos: string[];
	label: string;
	group: ShortcutGroup;
};

export const SHORTCUTS: Shortcut[] = [
	{
		combos: ["space", "alt+n"],
		label: "New to-do (below the selection)",
		group: "Create",
	},
	{
		combos: ["alt+shift+n"],
		label: "New heading (in a project)",
		group: "Create",
	},
	{ combos: ["alt+space"], label: "Quick Entry", group: "Create" },
	{ combos: ["up", "down"], label: "Move the selection", group: "Navigate" },
	{
		combos: ["shift+up", "shift+down"],
		label: "Extend the selection",
		group: "Navigate",
	},
	{
		combos: ["enter", "escape"],
		label: "Open / close the selected to-do",
		group: "Navigate",
	},
	{
		combos: ["mod+1", "mod+2", "mod+3", "mod+4", "mod+5", "mod+6"],
		label: "Inbox, Today, Upcoming, Anytime, Someday, Logbook",
		group: "Navigate",
	},
	{
		combos: ["g i", "g t", "g u", "g a", "g s", "g l"],
		label: "Go to Inbox, Today, Upcoming, Anytime, Someday, Logbook",
		group: "Navigate",
	},
	{ combos: ["a…z"], label: "Quick Find (start typing)", group: "Navigate" },
	{ combos: ["mod+,"], label: "Settings", group: "Navigate" },
	{ combos: ["mod+k"], label: "Complete", group: "Edit" },
	{ combos: ["mod+alt+k"], label: "Cancel", group: "Edit" },
	{
		combos: ["mod+up", "mod+down"],
		label: "Move up / down in the list",
		group: "Edit",
	},
	{ combos: ["mod+shift+m"], label: "Move to list…", group: "Edit" },
	{ combos: ["mod+shift+t"], label: "Tags…", group: "Edit" },
	{ combos: ["backspace"], label: "Delete", group: "Edit" },
	{ combos: ["mod+s"], label: "When…", group: "Schedule" },
	{ combos: ["mod+shift+d"], label: "Deadline…", group: "Schedule" },
	{
		combos: ["alt+t", "alt+e", "alt+r", "alt+o"],
		label: "Today, This Evening, Anytime, Someday",
		group: "Schedule",
	},
	{ combos: ["mod+z", "mod+shift+z"], label: "Undo / Redo", group: "Other" },
	{ combos: ["?"], label: "Show shortcuts", group: "Other" },
];

/** List routes for ⌘1…⌘6 and the g-sequences. */
export const LIST_KEYS: Record<string, string> = {
	"1": "/inbox",
	"2": "/today",
	"3": "/upcoming",
	"4": "/anytime",
	"5": "/someday",
	"6": "/logbook",
	i: "/inbox",
	t: "/today",
	u: "/upcoming",
	a: "/anytime",
	s: "/someday",
	l: "/logbook",
};
