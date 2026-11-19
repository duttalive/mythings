import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useId } from "react";
import {
	bySortKey,
	type GroupedList,
	projectProgress,
} from "../../shared/views";
import { useListData, useTagFilter } from "../data";
import { AreaIcon, BucketIcon } from "./icons";
import { ProgressRing, RowList, TodoRow } from "./rows";

/** A list's page: title, optional header content and tag bar, then the items. */
export function ListPage({
	title,
	titleNode,
	icon,
	header,
	filterable = false,
	filterTags,
	children,
}: {
	title: string;
	/** Replaces the visible title, e.g. with an editable field. */
	titleNode?: ReactNode;
	icon?: ReactNode;
	header?: ReactNode;
	filterable?: boolean;
	/** Only these tags (and any selected) show in the tag bar; all if omitted. */
	filterTags?: Set<string>;
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
					className="flex items-center gap-2.5 text-[1.625rem] font-bold leading-tight"
				>
					{icon}
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
				{header}
			</header>
			{filterable && <TagBar only={filterTags} />}
			{children}
		</article>
	);
}

export function Empty({ children }: { children: ReactNode }) {
	return <p className="py-10 text-center text-[var(--fg-muted)]">{children}</p>;
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

/** Toggle chips for every tag; the selection lives in the `tags` search param. */
function TagBar({ only }: { only?: Set<string> }) {
	const { data } = useListData();
	const selected = useTagFilter();
	const navigate = useNavigate();
	const tags = data.tags
		.filter(
			(t) =>
				t.deletedAt === null &&
				(!only || only.has(t.id) || selected.includes(t.id)),
		)
		.sort(bySortKey);
	if (tags.length === 0) return null;

	const toggle = (id: string) => {
		const next = selected.includes(id)
			? selected.filter((t) => t !== id)
			: [...selected, id];
		navigate({
			to: ".",
			search: (prev: { tags?: string }) => ({
				...prev,
				tags: next.length ? next.join(",") : undefined,
			}),
			replace: true,
		});
	};

	return (
		<div
			role="toolbar"
			aria-label="Filter by tag"
			className="mb-4 flex flex-wrap gap-1.5"
		>
			{tags.map((tag) => {
				const on = selected.includes(tag.id);
				return (
					<button
						key={tag.id}
						type="button"
						aria-pressed={on}
						onClick={() => toggle(tag.id)}
						className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-150 pointer-coarse:px-3 pointer-coarse:py-2 ${
							on
								? "border-accent bg-accent text-on-accent"
								: "border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--hover)]"
						}`}
					>
						{tag.title}
					</button>
				);
			})}
		</div>
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
