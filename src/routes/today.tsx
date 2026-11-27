import { Link } from "@tanstack/react-router";
import {
	type Entry,
	groupByProject,
	projectProgress,
	today,
} from "../../shared/views";
import { useAuth } from "../auth/AuthGate";
import { StarIcon } from "../components/icons";
import { Empty, ListPage } from "../components/ListPage";
import { EntryRow, ProgressRing, RowList } from "../components/rows";
import { useFilteredContext, useFiltering, useListData } from "../data";
import { SortableList } from "../dnd/sortable";
import type { Placed } from "../editing/reorder";
import { VIEWS } from "../lib/views";

const placedEntries = (entries: Entry[]): Placed[] =>
	entries.map((e) => ({
		entity: e.kind,
		id: e.item.id,
		key: e.item.todaySortKey,
	}));

export function TodayPage() {
	const { data, projects } = useListData();
	const view = today(data, useFilteredContext());
	const grouped = useAuth().user.settings.groupTodayByProject ?? false;
	const groups = grouped ? groupByProject(view.main, projects) : null;
	// Grouped, the rows (and the order dragging works in) follow the groups.
	const main = groups ? groups.flatMap((g) => g.entries) : view.main;
	const filtering = useFiltering();
	const empty = view.main.length === 0;
	// Grouped, a to-do moves only among its own group's rows: it can't leave
	// its project's group, and moving it past the group would change the
	// ungrouped order without anything changing on screen.
	const groupOf = new Map(
		groups?.flatMap(({ project, entries }) =>
			entries.map((e) => [e.item.id, project?.id ?? null] as const),
		),
	);
	const together = groups
		? (a: string, b: string) => groupOf.get(a) === groupOf.get(b)
		: undefined;

	return (
		<ListPage
			title="Today"
			icon={<StarIcon className="size-7 text-today" />}
			description={VIEWS.today.description}
			filterable
		>
			{empty && (
				<Empty>
					{filtering
						? "Nothing in Today matches these filters."
						: "Nothing planned for today."}
				</Empty>
			)}
			{!empty && (
				<SortableList
					disabled={filtering}
					className="min-h-2"
					list={{
						id: "today",
						accepts: ["todo", "project"],
						keyField: "todaySortKey",
						items: placedEntries(main),
						// Clears the evening mark items had before This Evening was retired.
						moveInPatch: () => ({ evening: false }),
						together,
					}}
				>
					{groups ? (
						groups.map(({ project, entries }) =>
							project ? (
								<section key={project.id} className="mt-4 first:mt-0">
									<h2 className="mb-1 flex items-center gap-2 px-2 text-sm font-semibold">
										<ProgressRing
											progress={projectProgress(project.id, data.todos)}
											decorative
											className="size-3.5"
										/>
										<Link
											to="/project/$projectId"
											params={{ projectId: project.id }}
											className="hover:underline"
										>
											{project.title || "New Project"}
										</Link>
									</h2>
									<RowList label={project.title || "New Project"}>
										{entries.map((entry) => (
											<EntryRow key={entry.item.id} entry={entry} />
										))}
									</RowList>
								</section>
							) : (
								<RowList key="loose" label="Today">
									{entries.map((entry) => (
										<EntryRow key={entry.item.id} entry={entry} showContainer />
									))}
								</RowList>
							),
						)
					) : (
						<RowList label="Today">
							{view.main.map((entry) => (
								<EntryRow key={entry.item.id} entry={entry} showContainer />
							))}
						</RowList>
					)}
				</SortableList>
			)}
		</ListPage>
	);
}
