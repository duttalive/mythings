import { useParams } from "@tanstack/react-router";
import { projectView } from "../../shared/views";
import { HeadingSection } from "../components/HeadingSection";
import { RepeatIcon } from "../components/icons";
import { Empty, ListPage, Section } from "../components/ListPage";
import { LoggedItems } from "../components/LoggedItems";
import {
	ProjectDetails,
	ProjectStatusButton,
	ProjectTitle,
} from "../components/ProjectHeader";
import { RowList, TodoRow } from "../components/rows";
import { useFilteredContext, useListData, useTagFilter } from "../data";
import { placed, SortableList } from "../dnd/sortable";
import { Missing } from "./not-found";

export function ProjectPage() {
	const { projectId } = useParams({ strict: false });
	const { data } = useListData();
	const filtering = useTagFilter().length > 0;
	const view = projectView(data, projectId ?? "", useFilteredContext());
	if (!view) return <Missing what="project" />;
	// While filtering by tag, headings with no matching to-dos are noise.
	const shown = (group: { todos: unknown[] }) =>
		!filtering || group.todos.length > 0;

	const { project, progress } = view;
	const readOnly = project.deletedAt !== null;
	// Reordering a filtered subset could scramble the hidden items' order.
	const reorderable = !readOnly && !filtering;

	const empty =
		view.todos.length === 0 &&
		!view.headings.some(shown) &&
		!view.archivedHeadings.some(shown) &&
		view.templates.length === 0 &&
		view.logged.length === 0;

	return (
		<ListPage
			title={project.title || "New Project"}
			titleNode={readOnly ? undefined : <ProjectTitle project={project} />}
			icon={<ProjectStatusButton project={project} progress={progress} />}
			filterable
			header={<ProjectDetails project={project} />}
		>
			{empty && <Empty>No to-dos in this project.</Empty>}
			{/* Always rendered (it may be empty) so to-dos can be dragged out of headings into it. */}
			<SortableList
				disabled={!reorderable}
				className="min-h-2"
				list={{
					id: `project:${project.id}`,
					accepts: ["todo"],
					keyField: "sortKey",
					items: placed("todo", view.todos, "sortKey"),
					moveInPatch: () => ({ headingId: null }),
				}}
			>
				<RowList>
					{view.todos.map((todo) => (
						<TodoRow key={todo.id} todo={todo} showStar readOnly={readOnly} />
					))}
				</RowList>
			</SortableList>
			{/* Headings reorder by dragging their title bar. */}
			<SortableList
				disabled={!reorderable}
				list={{
					id: `headings:${project.id}`,
					accepts: ["heading"],
					keyField: "sortKey",
					items: placed(
						"heading",
						view.headings.map(({ heading }) => heading),
						"sortKey",
					),
				}}
			>
				{view.headings.filter(shown).map(({ heading, todos }) => (
					<HeadingSection
						key={heading.id}
						heading={heading}
						readOnly={readOnly}
					>
						<SortableList
							disabled={!reorderable}
							className="min-h-8"
							list={{
								id: `heading:${heading.id}`,
								accepts: ["todo"],
								keyField: "sortKey",
								items: placed("todo", todos, "sortKey"),
								moveInPatch: () => ({ headingId: heading.id }),
							}}
						>
							<RowList>
								{todos.map((todo) => (
									<TodoRow
										key={todo.id}
										todo={todo}
										showStar
										readOnly={readOnly}
									/>
								))}
							</RowList>
						</SortableList>
					</HeadingSection>
				))}
			</SortableList>
			{view.templates.length > 0 && (
				<Section
					title={
						<>
							<RepeatIcon className="size-4 text-[var(--fg-muted)]" />
							Repeating
						</>
					}
				>
					<RowList>
						{view.templates.map((todo) => (
							<TodoRow
								key={todo.id}
								todo={todo}
								date={todo.repeat?.nextDate}
								readOnly={readOnly}
							/>
						))}
					</RowList>
				</Section>
			)}
			{view.archivedHeadings.filter(shown).map(({ heading, todos }) => (
				<HeadingSection key={heading.id} heading={heading} readOnly={readOnly}>
					<RowList>
						{todos.map((todo) => (
							<TodoRow key={todo.id} todo={todo} logbook readOnly={readOnly} />
						))}
					</RowList>
				</HeadingSection>
			))}
			<LoggedItems
				key={project.id}
				entries={view.logged.map((item) => ({ kind: "todo", item }))}
			/>
		</ListPage>
	);
}
