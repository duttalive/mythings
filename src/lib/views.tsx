// The built-in views: their names, the one line that says what each is, and
// which of them the sidebar may hide (Settings → Sidebar, SPEC §10.9). Every
// view can be found from search, shown in the sidebar or not.

import type { ReactNode } from "react";
import {
	DEFAULT_SIDEBAR_VIEWS,
	OPTIONAL_VIEWS,
	type OptionalView,
	type Settings,
} from "../../shared/schema";
import {
	BoxIcon,
	CalendarIcon,
	FlagIcon,
	InboxIcon,
	LayersIcon,
	LogbookIcon,
	NotesIcon,
	StarIcon,
	TrashIcon,
} from "../components/icons";

export type ViewId = "inbox" | "today" | OptionalView | "logbook" | "trash";

export type BuiltInView = {
	id: ViewId;
	title: string;
	to: string;
	/** One line under the view's title saying what it is. */
	description: string;
	/** The view's icon at a given size class. */
	icon: (size: string) => ReactNode;
};

export const VIEWS: Record<ViewId, BuiltInView> = {
	inbox: {
		id: "inbox",
		title: "Inbox",
		to: "/inbox",
		description: "New tasks land here until you give them a day or a list.",
		icon: (size) => <InboxIcon className={`${size} text-accent`} />,
	},
	today: {
		id: "today",
		title: "Today",
		to: "/today",
		description: "Tasks planned for today.",
		icon: (size) => <StarIcon className={`${size} text-today`} />,
	},
	upcoming: {
		id: "upcoming",
		title: "Upcoming",
		to: "/upcoming",
		description: "Tasks scheduled for a future day, by date.",
		icon: (size) => <CalendarIcon className={`${size} text-accent`} />,
	},
	anytime: {
		id: "anytime",
		title: "Anytime",
		to: "/anytime",
		description: "Tasks you could do now, with no set day.",
		icon: (size) => <LayersIcon className={`${size} text-anytime`} />,
	},
	someday: {
		id: "someday",
		title: "Someday",
		to: "/someday",
		description: "Tasks and projects parked for later.",
		icon: (size) => <BoxIcon className={`${size} text-someday`} />,
	},
	overdue: {
		id: "overdue",
		title: "Overdue",
		to: "/overdue",
		description: "Tasks whose planned day or deadline has passed.",
		icon: (size) => <FlagIcon className={`${size} text-overdue`} />,
	},
	deadlines: {
		id: "deadlines",
		title: "Deadlines",
		to: "/deadlines",
		description: "Every open task and project with a deadline, soonest first.",
		icon: (size) => <FlagIcon className={`${size} text-overdue`} />,
	},
	notes: {
		id: "notes",
		title: "Task Notes",
		to: "/notes",
		description: "Every task that has notes, in one place.",
		icon: (size) => <NotesIcon className={`${size} text-accent`} />,
	},
	logbook: {
		id: "logbook",
		title: "Logbook",
		to: "/logbook",
		description: "Tasks and projects you've completed or canceled.",
		icon: (size) => <LogbookIcon className={`${size} text-done`} />,
	},
	trash: {
		id: "trash",
		title: "Trash",
		to: "/trash",
		description: "Deleted items. They're removed for good after 30 days.",
		icon: (size) => <TrashIcon className={`${size} text-[var(--fg-muted)]`} />,
	},
};

/** Search order: the sidebar's order, with Task Notes and Deadlines after Overdue. */
export const VIEW_ORDER: ViewId[] = [
	"inbox",
	"today",
	"upcoming",
	"anytime",
	"someday",
	"overdue",
	"deadlines",
	"notes",
	"logbook",
	"trash",
];

/** The optional views the sidebar shows, per the account's setting. */
export function sidebarViews(settings: Settings): Set<OptionalView> {
	const chosen = settings.sidebarViews ?? DEFAULT_SIDEBAR_VIEWS;
	return new Set(OPTIONAL_VIEWS.filter((v) => chosen.includes(v)));
}
