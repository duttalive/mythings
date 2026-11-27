import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useId } from "react";
import {
	type FilterKind,
	type GroupedList,
	projectProgress,
} from "../../shared/views";
import { useListData } from "../data";
import { FilterBar } from "./FilterBar";
import { AreaIcon, BucketIcon } from "./icons";
import { ProgressRing, RowList, TodoRow } from "./rows";

/** A list's page: title, what the view is, header content and filter bar, then the items. */
export function ListPage({
	title,
	titleNode,
	icon,
	description,
	header,
	filterable = false,
	filterKinds,
	children,
}: {
	title: string;
	/** One line saying what this view is (built-in views). */
	description?: string;
	/** Replaces the visible title, e.g. with an editable field. */
	titleNode?: ReactNode;
	icon?: ReactNode;
	header?: ReactNode;
	/** Shows the filter bar (Life Buckets, Areas, Projects, Tags). */
	filterable?: boolean;
	/** The dropdowns the filter bar offers; all four if omitted. */
	filterKinds?: FilterKind[];
	children: ReactNode;
}) {
	useEffect(() => {
		document.title = `${title} · mythings`;
	}, [title]);
	return (
		<article aria-labelledby="list-title">
			<header className="mb-6">
				<h1
					id="list-title"
					className="flex items-start gap-2.5 text-[1.625rem] font-bold leading-tight"
				>
					{/* Lines up with the first line of a title that wraps. */}
					{icon && (
						<span className="flex h-[1.25em] shrink-0 items-center">
							{icon}
						</span>
					)}
					{titleNode ? (
						<>
							{/* Keeps the heading's accessible name; inputs don't provide one. */}
							<span className="sr-only">{title}</span>
							{titleNode}
						</>
					) : (
						<span className="min-w-0 break-words">{title}</span>
					)}
				</h1>
				{description && (
					<p className="mt-1 text-sm text-[var(--fg-muted)]">{description}</p>
				)}
				{header}
			</header>
			{filterable && <FilterBar kinds={filterKinds} />}
			{children}
		</article>
	);
}

/** What an empty list says, under a faded copy of the view's icon when given one. */
export function Empty({
	icon,
	children,
}: {
	icon?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center gap-3 py-10 text-center text-[var(--fg-muted)]">
			{icon && (
				<span aria-hidden className="flex opacity-40">
					{icon}
				</span>
			)}
			<p>{children}</p>
		</div>
	);
}

/** A titled group of rows. */
export function Section({
	title,
	accessory,
	children,
	className = "mt-8",
}: {
	title: ReactNode;
	accessory?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	const id = useId();
	return (
		<section aria-labelledby={id} className={className}>
			<h2
				id={id}
				className="mb-1 flex items-center gap-2 border-b border-[var(--border)] px-2 pb-1.5 text-[0.9375rem] font-semibold"
			>
				{title}
				{accessory}
			</h2>
			{children}
		</section>
	);
}

/** Anytime, Someday and tag pages: loose to-dos, then projects, then each area. */
export function GroupedListView({
	list,
	showStar,
}: {
	list: GroupedList;
	showStar?: boolean;
}) {
	const { data } = useListData();
	const todoRows = (todos: GroupedList["todos"]) =>
		todos.length > 0 && (
			<RowList>
				{todos.map((todo) => (
					<TodoRow key={todo.id} todo={todo} showStar={showStar} />
				))}
			</RowList>
		);
	const heading = (icon: ReactNode, link: ReactNode) => (
		<>
			{icon}
			{link}
		</>
	);

	return (
		<>
			{todoRows(list.todos)}
			{list.buckets.map(({ bucket, areas, projects }) => (
				<div key={bucket?.id ?? "none"} className="mt-10 first:mt-0">
					{bucket && (
						<Link
							to="/bucket/$bucketId"
							params={{ bucketId: bucket.id }}
							className="flex items-center gap-2 px-2 text-lg font-bold break-words hover:underline"
						>
							<BucketIcon className="size-5 shrink-0 text-[var(--fg-muted)]" />
							{bucket.title || "New Life Bucket"}
						</Link>
					)}
					{areas.map(({ area, todos }) => (
						<Section
							key={area.id}
							className="mt-6"
							title={heading(
								<AreaIcon className="size-4 shrink-0 text-[var(--fg-muted)]" />,
								<Link
									to="/area/$areaId"
									params={{ areaId: area.id }}
									className="hover:underline"
								>
									{area.title || "New Area"}
								</Link>,
							)}
						>
							{todoRows(todos)}
						</Section>
					))}
					{projects.map(({ project, todos }) => (
						<Section
							key={project.id}
							className="mt-6"
							title={heading(
								<ProgressRing
									progress={projectProgress(project.id, data.todos)}
									status={project.status}
								/>,
								<Link
									to="/project/$projectId"
									params={{ projectId: project.id }}
									className="hover:underline"
								>
									{project.title || "New Project"}
								</Link>,
							)}
						>
							{todoRows(todos)}
						</Section>
					))}
				</div>
			))}
		</>
	);
}

export function isEmptyGroupedList(list: GroupedList): boolean {
	return list.todos.length === 0 && list.buckets.length === 0;
}
