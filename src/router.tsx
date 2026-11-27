import {
	createRootRoute,
	createRoute,
	createRouter,
	lazyRouteComponent,
	redirect,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Shell } from "./components/Shell";
import { AnytimePage } from "./routes/anytime";
import { AreaPage } from "./routes/area";
import { BucketPage } from "./routes/bucket";
import { DeadlinesPage } from "./routes/deadlines";
import { InboxPage } from "./routes/inbox";
import { LogbookPage } from "./routes/logbook";
import { NotFound } from "./routes/not-found";
import { TaskNotePage, TaskNotesPage } from "./routes/notes";
import { OverduePage } from "./routes/overdue";
import { ProjectPage } from "./routes/project";
import { SharePage } from "./routes/share";
import { SomedayPage } from "./routes/someday";
import { TagPage } from "./routes/tag";
import { TodayPage } from "./routes/today";
import { TrashPage } from "./routes/trash";
import { UpcomingPage } from "./routes/upcoming";

/** The filter bar's choices: comma-separated ids per kind (see FILTER_PARAMS). */
type ListSearch = {
	bucket?: string;
	area?: string;
	project?: string;
	tags?: string;
};

const LIST_SEARCH_KEYS = ["bucket", "area", "project", "tags"] as const;

const rootRoute = createRootRoute({
	component: Shell,
	notFoundComponent: NotFound,
	validateSearch: (search: Record<string, unknown>): ListSearch => {
		const out: ListSearch = {};
		for (const key of LIST_SEARCH_KEYS) {
			const value = search[key];
			if (typeof value === "string" && value) out[key] = value;
		}
		return out;
	},
});

const page = <P extends string>(path: P, component: () => ReactNode) =>
	createRoute({ getParentRoute: () => rootRoute, path, component });

const routeTree = rootRoute.addChildren([
	createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		beforeLoad: () => {
			throw redirect({ to: "/today" });
		},
	}),
	page("/inbox", InboxPage),
	page("/today", TodayPage),
	page("/upcoming", UpcomingPage),
	page("/anytime", AnytimePage),
	page("/someday", SomedayPage),
	page("/overdue", OverduePage),
	page("/logbook", LogbookPage),
	// Not in the sidebar: reached from Quick Find.
	page("/deadlines", DeadlinesPage),
	page("/trash", TrashPage),
	// Not in the sidebar: the top bar, Quick Find and `g n` open it.
	page("/notes", TaskNotesPage),
	page("/notes/$todoId", TaskNotePage),
	// Task Notes was called Scratch Pad in 2.4.0: keep its old links working.
	createRoute({
		getParentRoute: () => rootRoute,
		path: "/scratch",
		beforeLoad: () => {
			throw redirect({ to: "/notes" });
		},
	}),
	createRoute({
		getParentRoute: () => rootRoute,
		path: "/scratch/$todoId",
		beforeLoad: ({ params }) => {
			throw redirect({ to: "/notes/$todoId", params });
		},
	}),
	page("/project/$projectId", ProjectPage),
	page("/area/$areaId", AreaPage),
	page("/bucket/$bucketId", BucketPage),
	page("/tag/$tagId", TagPage),
	page("/share", SharePage),
	// Rarely visited: loaded on demand to keep the main bundle smaller.
	createRoute({
		getParentRoute: () => rootRoute,
		path: "/settings",
		component: lazyRouteComponent(
			() => import("./routes/settings"),
			"SettingsPage",
		),
	}),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
