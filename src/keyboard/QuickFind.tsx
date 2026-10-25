// Quick Find (SPEC §10.5): type to search lists, projects, areas, tags and
// to-dos (title and notes); Enter opens the highlighted result.

import { useNavigate } from "@tanstack/react-router";
import {
	type KeyboardEvent,
	type ReactNode,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Todo } from "../../shared/schema";
import { isInToday } from "../../shared/views";
import {
	AreaIcon,
	BoxIcon,
	CalendarIcon,
	InboxIcon,
	LayersIcon,
	LogbookIcon,
	StarIcon,
	TagIcon,
	TrashIcon,
} from "../components/icons";
import { Modal } from "../components/Modal";
import { Checkbox, ProgressRing } from "../components/rows";
import { useListData } from "../data";
import { useEditing } from "../editing/EditingProvider";
import { useSelection } from "../editing/SelectionProvider";
import { fuzzyScore } from "../lib/fuzzy";

type Result = {
	key: string;
	title: string;
	subtitle?: string;
	icon: ReactNode;
	score: number;
	open: () => void;
};

const LISTS: { title: string; to: string; icon: ReactNode }[] = [
	{
		title: "Inbox",
		to: "/inbox",
		icon: <InboxIcon className="size-4 text-accent" />,
	},
	{
		title: "Today",
		to: "/today",
		icon: <StarIcon className="size-4 text-today" />,
	},
	{
		title: "Upcoming",
		to: "/upcoming",
		icon: <CalendarIcon className="size-4 text-overdue" />,
	},
	{
		title: "Anytime",
		to: "/anytime",
		icon: <LayersIcon className="size-4 text-teal-600" />,
	},
	{
		title: "Someday",
		to: "/someday",
		icon: <BoxIcon className="size-4 text-amber-700" />,
	},
	{
		title: "Logbook",
		to: "/logbook",
		icon: <LogbookIcon className="size-4 text-done" />,
	},
	{
		title: "Trash",
		to: "/trash",
		icon: <TrashIcon className="size-4 text-[var(--fg-muted)]" />,
	},
];

// Lists and containers first when scores are close; to-dos are the long tail.
const BOOST = { list: 60, project: 40, area: 40, tag: 20, todo: 0 };
const MAX_RESULTS = 40;

export function QuickFind({
	initialQuery,
	onClose,
}: {
	initialQuery: string;
	onClose: () => void;
}) {
	const [query, setQuery] = useState(initialQuery);
	const [active, setActive] = useState(0);
	const navigate = useNavigate();
	const { data, ctx, projects, areas } = useListData();
	const { expand } = useEditing();
	const { select } = useSelection();
	const listId = useId();
	const input = useRef<HTMLInputElement>(null);

	// Cursor after the character that opened Quick Find.
	useEffect(() => {
		const el = input.current;
		el?.setSelectionRange(el.value.length, el.value.length);
	}, []);

	const results = useMemo(() => {
		const out: Result[] = [];
		const add = (
			kind: keyof typeof BOOST,
			text: string,
			result: Omit<Result, "score">,
		) => {
			const score = fuzzyScore(query, text);
			if (score !== null) out.push({ ...result, score: score + BOOST[kind] });
		};
		const go = (to: string, params?: Record<string, string>) => () => {
			onClose();
			void navigate({ to, params } as never);
		};

		for (const list of LISTS)
			add("list", list.title, {
				key: list.to,
				title: list.title,
				icon: list.icon,
				open: go(list.to),
			});
		for (const project of data.projects) {
			if (project.deletedAt !== null) continue;
			const area = project.areaId ? areas.get(project.areaId) : undefined;
			add("project", project.title, {
				key: project.id,
				title: project.title || "New Project",
				subtitle: area?.title,
				icon: (
					<ProgressRing
						progress={{ completed: 0, total: 0 }}
						status={project.status}
						decorative
						className="size-4"
					/>
				),
				open: go("/project/$projectId", { projectId: project.id }),
			});
		}
		for (const area of data.areas) {
			if (area.deletedAt !== null) continue;
			add("area", area.title, {
				key: area.id,
				title: area.title || "New Area",
				icon: <AreaIcon className="size-4" />,
				open: go("/area/$areaId", { areaId: area.id }),
			});
		}
		for (const tag of data.tags) {
			if (tag.deletedAt !== null) continue;
			add("tag", tag.title, {
				key: tag.id,
				title: tag.title,
				icon: <TagIcon className="size-4 text-[var(--fg-muted)]" />,
				open: go("/tag/$tagId", { tagId: tag.id }),
			});
		}
		if (query.trim()) {
			for (const todo of data.todos) {
				if (todo.deletedAt !== null || todo.repeat !== null) continue;
				const project = todo.projectId
					? projects.get(todo.projectId)
					: undefined;
				const area = todo.areaId ? areas.get(todo.areaId) : undefined;
				add("todo", `${todo.title} ${todo.notes}`, {
					key: todo.id,
					title: todo.title || "New To-Do",
					subtitle: project?.title ?? area?.title,
					icon: <Checkbox status={todo.status} />,
					open: () => {
						onClose();
						const { to, params } = routeFor(todo, ctx.today);
						void navigate({ to, params } as never).then(() =>
							// After the route change settles (it closes any open card).
							setTimeout(() => {
								select(todo.id);
								expand(todo.id);
							}, 50),
						);
					},
				});
			}
		}
		return out.sort((a, b) => b.score - a.score).slice(0, MAX_RESULTS);
	}, [
		query,
		data,
		ctx.today,
		projects,
		areas,
		navigate,
		onClose,
		expand,
		select,
	]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: back to the top result whenever the query changes
	useEffect(() => setActive(0), [query]);
	useEffect(() => {
		document
			.getElementById(`${listId}-${active}`)
			?.scrollIntoView({ block: "nearest" });
	}, [active, listId]);

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActive((i) => Math.min(results.length - 1, i + 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActive((i) => Math.max(0, i - 1));
		} else if (e.key === "Enter") {
			e.preventDefault();
			results[active]?.open();
		}
	};

	return (
		<Modal title="Quick Find" hideTitle onClose={onClose}>
			<input
				ref={input}
				// biome-ignore lint/a11y/noAutofocus: the dialog exists to type a search
				autoFocus
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={onKeyDown}
				placeholder="Quick Find"
				role="combobox"
				aria-expanded
				aria-controls={listId}
				aria-activedescendant={
					results[active] ? `${listId}-${active}` : undefined
				}
				aria-label="Quick Find"
				className="w-full rounded-t-2xl border-b border-[var(--border)] bg-transparent px-4 py-3.5 text-base outline-none"
			/>
			<div
				id={listId}
				role="listbox"
				aria-label="Results"
				className="max-h-[50vh] overflow-y-auto p-1.5"
			>
				{results.length === 0 && (
					<p className="px-3 py-6 text-center text-sm text-[var(--fg-muted)]">
						No matches
					</p>
				)}
				{results.map((result, i) => (
					<div
						key={result.key}
						id={`${listId}-${i}`}
						role="option"
						tabIndex={-1}
						aria-selected={i === active}
						onMouseEnter={() => setActive(i)}
						onClick={result.open}
						onKeyDown={() => {}}
						className={`flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? "bg-[var(--selected)]" : ""}`}
					>
						<span className="flex w-4 shrink-0 justify-center">
							{result.icon}
						</span>
						<span className="min-w-0 flex-1 truncate">{result.title}</span>
						{result.subtitle && (
							<span className="shrink-0 truncate text-xs text-[var(--fg-muted)]">
								{result.subtitle}
							</span>
						)}
					</div>
				))}
			</div>
		</Modal>
	);
}

/** The list a to-do shows up in, to open it there. */
function routeFor(
	todo: Todo,
	today: string,
): { to: string; params?: Record<string, string> } {
	if (todo.deletedAt !== null) return { to: "/trash" };
	if (todo.status !== "open") return { to: "/logbook" };
	if (todo.projectId)
		return { to: "/project/$projectId", params: { projectId: todo.projectId } };
	if (todo.areaId)
		return { to: "/area/$areaId", params: { areaId: todo.areaId } };
	if (todo.when === "inbox") return { to: "/inbox" };
	if (isInToday(todo, today)) return { to: "/today" };
	if (todo.when === "scheduled") return { to: "/upcoming" };
	if (todo.when === "someday") return { to: "/someday" };
	return { to: "/anytime" };
}
