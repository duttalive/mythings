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
import { InboxPage } from "./routes/inbox";
import { LogbookPage } from "./routes/logbook";
import { NotFound } from "./routes/not-found";
import { ProjectPage } from "./routes/project";
import { SharePage } from "./routes/share";
import { SomedayPage } from "./routes/someday";
import { TagPage } from "./routes/tag";
import { TodayPage } from "./routes/today";
import { TrashPage } from "./routes/trash";
import { UpcomingPage } from "./routes/upcoming";

type ListSearch = {
	/** Comma-separated tag ids for the tag bar filter. */
	tags?: string;
};

const rootRoute = createRootRoute({
	component: Shell,
	notFoundComponent: NotFound,
	validateSearch: (search: Record<string, unknown>): ListSearch =>
		typeof search.tags === "string" && search.tags ? { tags: search.tags } : {},
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
	page("/logbook", LogbookPage),
	page("/trash", TrashPage),
	page("/project/$projectId", ProjectPage),
	page("/area/$areaId", AreaPage),
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
