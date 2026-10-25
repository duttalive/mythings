import { Link } from "@tanstack/react-router";
import {
	type Entry,
	groupByProject,
	projectProgress,
	today,
} from "../../shared/views";
import { useAuth } from "../auth/AuthGate";
import { MoonIcon, StarIcon } from "../components/icons";
import { Empty, ListPage, Section } from "../components/ListPage";
import { EntryRow, ProgressRing, RowList } from "../components/rows";
import { useFilteredContext, useListData, useTagFilter } from "../data";
import { useDndRegistry } from "../dnd/DndProvider";
import { SortableList } from "../dnd/sortable";
import type { Placed } from "../editing/reorder";

const placedEntries = (entries: Entry[]): Placed[] =>
	entries.map((e) => ({
		entity: e.kind,
		id: e.item.id,
		key: e.item.todaySortKey,
	}));

export function TodayPage() {
	const { data, ctx, projects } = useListData();
	const view = today(data, useFilteredContext());
	const grouped = useAuth().user.settings.groupTodayByProject ?? false;
	const groups = grouped ? groupByProject(view.main, projects) : null;
	// Grouped, the rows (and the order dragging works in) follow the groups.
	const main = groups ? groups.flatMap((g) => g.entries) : view.main;
	const filtering = useTagFilter().length > 0;
	const dragging = useDndRegistry().activeKind !== null;
	const empty = view.main.length === 0 && view.evening.length === 0;

	return (
		<ListPage
			title="Today"
			icon={<StarIcon className="size-7 text-today" />}
			filterable
		>
			{empty && <Empty>Nothing planned for today.</Empty>}
			{!empty && (
				<SortableList
					disabled={filtering}
					className="min-h-2"
					list={{
						id: "today",
						accepts: ["todo", "project"],
						keyField: "todaySortKey",
						items: placedEntries(main),
						moveInPatch: () => ({ evening: false }),
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
			{/* While dragging, show This Evening even when empty so items can be dropped there. */}
			{(view.evening.length > 0 || (dragging && !empty)) && (
				<Section
					title={
						<>
							<MoonIcon className="size-4 text-evening" />
							This Evening
						</>
					}
				>
					<SortableList
						disabled={filtering}
						className="min-h-10"
						list={{
							id: "evening",
							accepts: ["todo", "project"],
							keyField: "todaySortKey",
							items: placedEntries(view.evening),
							// Evening needs a start date of today (an item may be here only for its deadline).
							moveInPatch: () => ({
								when: "scheduled",
								startDate: ctx.today,
								evening: true,
							}),
						}}
					>
						<RowList>
							{view.evening.map((entry) => (
								<EntryRow key={entry.item.id} entry={entry} showContainer />
							))}
						</RowList>
					</SortableList>
				</Section>
			)}
		</ListPage>
	);
}
