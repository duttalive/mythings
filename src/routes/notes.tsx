// Task Notes: every to-do's notes in one searchable place, and a full
// page for writing in one (SPEC §10.10). Not in the sidebar: it opens from the
// top bar, Quick Find or `g n`.

import { Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UNREADABLE } from "../../shared/crypto/fields";
import { localDateOf } from "../../shared/dates";
import type { Todo } from "../../shared/schema";
import { Checklist, useAddChecklistItem } from "../components/Checklist";
import { EditableTitle } from "../components/controls";
import {
	ChecklistIcon,
	FocusIcon,
	NotesIcon,
	SearchIcon,
} from "../components/icons";
import { Empty, ListPage } from "../components/ListPage";
import { Checkbox } from "../components/rows";
import { useListData } from "../data";
import { useEditing } from "../editing/EditingProvider";
import { routeFor } from "../editing/routeFor";
import { useFocus } from "../focus/FocusProvider";
import { shortDate } from "../lib/format";
import { NotesEditor } from "../notes";
import { matchesNotes, plainText, snippet } from "../notes/plain";
import { useChecklist, useOps } from "../sync/hooks";
import { Missing } from "./not-found";

const SAVE_DELAY_MS = 400;

/** Where a to-do is, for the Task Notes' list: "Work › Launch website". */
function useWhere() {
	const { areas, buckets, projects } = useListData();
	return useCallback(
		(todo: Todo): string => {
			const project = todo.projectId ? projects.get(todo.projectId) : undefined;
			const area = todo.areaId ? areas.get(todo.areaId) : undefined;
			const bucket = project
				? buckets.get(project.areaId ?? "")
				: area
					? buckets.get(area.bucketId ?? "")
					: undefined;
			const list = project
				? project.title || "New Project"
				: area
					? area.title || "New Area"
					: todo.when === "inbox"
						? "Inbox"
						: null;
			return [bucket?.title, list].filter(Boolean).join(" › ");
		},
		[areas, buckets, projects],
	);
}

export function TaskNotesPage() {
	const { data, ctx } = useListData();
	const where = useWhere();
	const [query, setQuery] = useState("");
	const pages = useMemo(
		() =>
			data.todos
				.filter(
					(t) =>
						t.deletedAt === null &&
						t.notes.trim() !== "" &&
						(!query.trim() || matchesNotes(query, t)),
				)
				.sort((a, b) => b.updatedAt - a.updatedAt),
		[data.todos, query],
	);

	return (
		<ListPage
			title="Task Notes"
			icon={<NotesIcon className="size-7 shrink-0 text-accent" />}
		>
			<label className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 focus-within:border-accent">
				<SearchIcon className="size-4 shrink-0 text-[var(--fg-muted)]" />
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search notes"
					aria-label="Search notes"
					className="min-w-0 flex-1 bg-transparent text-sm outline-none"
				/>
			</label>
			{pages.length === 0 ? (
				<Empty>
					{query.trim()
						? "No notes match."
						: "Notes you write on a to-do show up here. Open a to-do and write in its notes, or open it here with the notes icon at the bottom of the to-do."}
				</Empty>
			) : (
				<ul aria-label="Notes" className="flex flex-col gap-1">
					{pages.map((todo) => {
						const text = plainText(todo.notes);
						const place = where(todo);
						return (
							<li key={todo.id}>
								<Link
									to="/notes/$todoId"
									params={{ todoId: todo.id }}
									className="block rounded-lg px-3 py-2.5 hover:bg-[var(--hover)]"
								>
									<span className="flex items-baseline gap-2">
										<span
											className={`long-title min-w-0 flex-1 font-medium break-words ${
												todo.status === "open"
													? ""
													: "text-[var(--fg-muted)] line-through"
											}`}
										>
											{todo.title || "New To-Do"}
										</span>
										<span className="shrink-0 text-xs text-[var(--fg-muted)]">
											{shortDate(
												localDateOf(todo.updatedAt, ctx.tz),
												ctx.today,
											)}
										</span>
									</span>
									{place && (
										<span className="block text-xs text-[var(--fg-muted)]">
											{place}
										</span>
									)}
									<span className="mt-0.5 block text-sm break-words text-[var(--fg-muted)]">
										{text === UNREADABLE ? "🔒" : snippet(text, query)}
									</span>
								</Link>
							</li>
						);
					})}
				</ul>
			)}
		</ListPage>
	);
}

/** One to-do's notes as a full page. */
export function TaskNotePage() {
	const { todoId } = useParams({ strict: false });
	const { data, ctx } = useListData();
	const todo = data.todos.find((t) => t.id === todoId);
	if (!todo) return <Missing what="to-do" />;
	// Re-mount per to-do so each page starts from its own notes.
	return <TaskNoteEditor key={todo.id} todo={todo} today={ctx.today} />;
}

function TaskNoteEditor({ todo, today }: { todo: Todo; today: string }) {
	const ops = useOps();
	const where = useWhere();
	const { toggleComplete, displayStatus } = useEditing();
	const focus = useFocus();
	const [notes, setNotes] = useState(todo.notes);
	const saved = useRef(todo.notes);
	const latest = useRef(notes);
	latest.current = notes;
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const flush = useCallback(() => {
		clearTimeout(timer.current);
		if (latest.current === saved.current) return;
		saved.current = latest.current;
		void ops
			.update("todo", todo.id, { notes: latest.current })
			.catch(console.error);
	}, [ops, todo.id]);
	// Save on the way out, too, including when the page is closed or hidden.
	useEffect(() => {
		window.addEventListener("pagehide", flush);
		return () => {
			window.removeEventListener("pagehide", flush);
			flush();
		};
	}, [flush]);
	// Keep up with changes from other devices while nothing's waiting to save.
	useEffect(() => {
		if (latest.current === saved.current && todo.notes !== saved.current) {
			saved.current = todo.notes;
			setNotes(todo.notes);
		}
	}, [todo.notes]);

	const readOnly =
		todo.deletedAt !== null ||
		todo.notes === UNREADABLE ||
		todo.title === UNREADABLE;
	const back = routeFor(todo, today);
	const place = where(todo);

	return (
		<ListPage
			title={todo.title || "New To-Do"}
			titleNode={
				readOnly ? undefined : (
					<EditableTitle
						value={todo.title}
						onSave={(title) =>
							void ops.update("todo", todo.id, { title }).catch(console.error)
						}
						placeholder="New To-Do"
						label="To-do title"
					/>
				)
			}
			icon={
				<Checkbox
					status={displayStatus(todo.id, todo.status)}
					label={todo.title || "New To-Do"}
					onToggle={() => toggleComplete(todo.id, todo.status)}
				/>
			}
			header={
				<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--fg-muted)]">
					<Link to="/notes" className="hover:text-[var(--fg)] hover:underline">
						Task Notes
					</Link>
					<span aria-hidden>·</span>
					<Link
						to={back.to as never}
						params={back.params as never}
						className="hover:text-[var(--fg)] hover:underline"
					>
						{todo.deletedAt !== null ? "In Trash" : place || "Show in list"}
					</Link>
					{!readOnly && todo.status === "open" && todo.repeat === null && (
						<>
							<span aria-hidden>·</span>
							<button
								type="button"
								onClick={() => {
									flush();
									focus.open(todo.id);
								}}
								className="flex items-center gap-1 text-accent hover:underline"
							>
								<FocusIcon className="size-3.5" />
								Focus
							</button>
						</>
					)}
				</div>
			}
		>
			<TaskChecklist todoId={todo.id} readOnly={readOnly} />
			<NotesEditor
				value={notes}
				onChange={(markdown) => {
					setNotes(markdown);
					clearTimeout(timer.current);
					timer.current = setTimeout(flush, SAVE_DELAY_MS);
				}}
				editable={!readOnly}
				autoFocus={!readOnly}
				label="Task Notes"
				placeholder="Write anything, or type / for blocks"
				variant="page"
			/>
		</ListPage>
	);
}

/** The to-do's checklist, above its notes and apart from them. */
function TaskChecklist({
	todoId,
	readOnly,
}: {
	todoId: string;
	readOnly: boolean;
}) {
	const items = useChecklist(todoId);
	const addItem = useAddChecklistItem(todoId, items);
	const [focusId, setFocusId] = useState<string | null>(null);
	if (!items) return null;
	const add = async (after?: (typeof items)[number]) =>
		setFocusId(await addItem(after));
	const done = items.filter((i) => i.done).length;

	if (items.length === 0) {
		if (readOnly) return null;
		return (
			<button
				type="button"
				onClick={() => void add()}
				className="mb-4 flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-2.5"
			>
				<ChecklistIcon className="size-4" />
				Add checklist
			</button>
		);
	}
	return (
		<section aria-labelledby="task-checklist" className="mb-6">
			<h2
				id="task-checklist"
				className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--fg-muted)]"
			>
				<ChecklistIcon className="size-4" />
				Checklist
				<span className="font-normal">
					{done} of {items.length}
				</span>
			</h2>
			<Checklist
				items={items}
				focusId={focusId}
				onFocusId={setFocusId}
				onAdd={(after) => void add(after)}
				readOnly={readOnly}
				className="pl-5"
			/>
			{!readOnly && (
				<button
					type="button"
					onClick={() => void add()}
					className="mt-1 ml-3.5 rounded-md px-1.5 py-1 text-sm text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-2.5"
				>
					+ Add item
				</button>
			)}
		</section>
	);
}
