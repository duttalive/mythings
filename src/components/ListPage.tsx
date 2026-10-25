import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useId } from "react";
import {
	bySortKey,
	type GroupedList,
	projectProgress,
} from "../../shared/views";
import { useListData, useTagFilter } from "../data";
import { AreaIcon } from "./icons";
import { ProgressRing, RowList, TodoRow } from "./rows";

/** A list's page: title, optional header content and tag bar, then the items. */
export function ListPage({
	title,
	titleNode,
	icon,
	header,
	filterable = false,
	children,
}: {
	title: string;
	/** Replaces the visible title, e.g. with an editable field. */
	titleNode?: ReactNode;
	icon?: ReactNode;
	header?: ReactNode;
	filterable?: boolean;
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
			{filterable && <TagBar />}
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
function TagBar() {
	const { data } = useListData();
	const selected = useTagFilter();
	const navigate = useNavigate();
	const tags = data.tags.filter((t) => t.deletedAt === null).sort(bySortKey);
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
	const projectGroup = ({
		project,
		todos,
	}: GroupedList["projects"][number]) => (
		<Section
			key={project.id}
			className="mt-6"
			title={
				<>
					<ProgressRing
						progress={projectProgress(project.id, data.todos)}
						status={project.status}
					/>
					<Link
						to="/project/$projectId"
						params={{ projectId: project.id }}
						className="hover:underline"
					>
						{project.title || "New Project"}
					</Link>
				</>
			}
		>
			{todos.length > 0 && (
				<RowList>
					{todos.map((todo) => (
						<TodoRow key={todo.id} todo={todo} showStar={showStar} />
					))}
				</RowList>
			)}
		</Section>
	);

	return (
		<>
			{list.todos.length > 0 && (
				<RowList>
					{list.todos.map((todo) => (
						<TodoRow key={todo.id} todo={todo} showStar={showStar} />
					))}
				</RowList>
			)}
			{list.projects.map(projectGroup)}
			{list.areas.map(({ area, todos, projects }) => (
				<div key={area.id} className="mt-10">
					<Link
						to="/area/$areaId"
						params={{ areaId: area.id }}
						className="flex items-center gap-2 px-2 text-lg font-bold hover:underline"
					>
						<AreaIcon className="size-5 text-[var(--fg-muted)]" />
						{area.title || "New Area"}
					</Link>
					{todos.length > 0 && (
						<RowList>
							{todos.map((todo) => (
								<TodoRow key={todo.id} todo={todo} showStar={showStar} />
							))}
						</RowList>
					)}
					{projects.map(projectGroup)}
				</div>
			))}
		</>
	);
}

export function isEmptyGroupedList(list: GroupedList): boolean {
	return (
		list.todos.length === 0 &&
		list.projects.length === 0 &&
		list.areas.length === 0
	);
}
