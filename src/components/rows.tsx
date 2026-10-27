// Read-only rows for to-dos and projects, shared by every list view.

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { diffDays, type LocalDate } from "../../shared/dates";
import type { Project, Status, Tag, Todo } from "../../shared/schema";
import {
	type Entry,
	isInToday,
	type Progress,
	projectProgress,
} from "../../shared/views";
import { useListData } from "../data";
import { useDndRegistry } from "../dnd/DndProvider";
import { DragItem } from "../dnd/sortable";
import { todosRequest } from "../editing/deleteRequests";
import { useEditing } from "../editing/EditingProvider";
import { useSelection } from "../editing/SelectionProvider";
import { deadlineLabel, shortDate } from "../lib/format";
import { formatTime, reminderTime } from "../lib/reminders";
import { useOps } from "../sync/hooks";
import { useBulkBar } from "./BulkBar";
import { useConfirmDelete } from "./ConfirmDelete";
import {
	BellIcon,
	CalendarIcon,
	CheckIcon,
	ChecklistIcon,
	CrossIcon,
	FlagIcon,
	NotesIcon,
	RepeatIcon,
	StarIcon,
	TrashIcon,
} from "./icons";
import { type SwipeDirection, swipeResult, useSwipe } from "./swipe";
import { useToast } from "./Toast";
import { TodoCard } from "./TodoCard";

const STATUS_LABEL: Record<Status, string> = {
	open: "Open",
	completed: "Completed",
	canceled: "Canceled",
};

/** A to-do's checkbox. Interactive when `onToggle` is given; otherwise a status image. */
export function Checkbox({
	status,
	label,
	onToggle,
}: {
	status: Status;
	/** The to-do's title, for the button's accessible name. */
	label?: string;
	onToggle?: () => void;
}) {
	const className = `mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors duration-150 motion-reduce:transition-none ${
		status === "completed"
			? "border-accent bg-accent text-on-accent"
			: status === "canceled"
				? "border-[var(--fg-muted)] text-[var(--fg-muted)]"
				: "border-[var(--checkbox)]"
	}`;
	const mark = (
		<>
			{status === "completed" && (
				<CheckIcon className="size-3.5 animate-[pop_160ms_ease-out] motion-reduce:animate-none" />
			)}
			{status === "canceled" && <CrossIcon className="size-3" />}
		</>
	);
	if (!onToggle) {
		return (
			<span role="img" aria-label={STATUS_LABEL[status]} className={className}>
				{mark}
			</span>
		);
	}
	// A native checkbox (keyboard and screen-reader semantics for free) under the styled box.
	return (
		<span
			className={`relative ${className} hover:border-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent`}
		>
			<input
				type="checkbox"
				checked={status !== "open"}
				onChange={onToggle}
				onClick={(e) => e.stopPropagation()}
				aria-label={`${status === "canceled" ? "Canceled — reopen" : "Complete"} ${label || "to-do"}`}
				// On touch screens the tap area reaches well beyond the 18px box.
				className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-[5px] focus-visible:outline-none pointer-coarse:-inset-3"
			/>
			<span className="pointer-events-none flex">{mark}</span>
		</span>
	);
}

/** Round progress ring; full and green once every to-do is done. */
export function ProgressRing({
	progress,
	status = "open",
	className = "size-[18px]",
	decorative = false,
}: {
	progress: Progress;
	status?: Status;
	className?: string;
	/** An icon next to text that says it all (e.g. a menu item): hidden from screen readers. */
	decorative?: boolean;
}) {
	const r = 7;
	const c = 2 * Math.PI * r;
	const fraction =
		status === "completed"
			? 1
			: progress.total === 0
				? 0
				: progress.completed / progress.total;
	const label =
		status === "open"
			? `${progress.completed} of ${progress.total} done`
			: STATUS_LABEL[status];
	return (
		<svg
			viewBox="0 0 18 18"
			role={decorative ? undefined : "img"}
			aria-label={decorative ? undefined : label}
			aria-hidden={decorative || undefined}
			className={`shrink-0 ${status === "open" && fraction < 1 ? "text-accent" : "text-done"} ${className}`}
		>
			<circle
				cx="9"
				cy="9"
				r={r}
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				opacity={status === "canceled" ? 0.4 : 1}
			/>
			{fraction > 0 && (
				<circle
					cx="9"
					cy="9"
					r={r - 2.6}
					fill="none"
					stroke="currentColor"
					strokeWidth={2 * (r - 2.6)}
					strokeDasharray={`${fraction * 2 * Math.PI * (r - 2.6)} ${c}`}
					transform="rotate(-90 9 9)"
				/>
			)}
		</svg>
	);
}

function Deadline({ deadline, open }: { deadline: LocalDate; open: boolean }) {
	const { ctx } = useListData();
	const urgent = open && diffDays(ctx.today, deadline) <= 0;
	return (
		<span
			className={`flex items-center gap-1 ${urgent ? "font-medium text-overdue" : ""}`}
			title={`Deadline ${shortDate(deadline, ctx.today)}`}
		>
			<FlagIcon className="size-3.5" />
			{deadlineLabel(deadline, ctx.today)}
		</span>
	);
}

function TagChips({ tagIds }: { tagIds: string[] }) {
	const { tags } = useListData();
	return tagIds
		.map((id) => tags.get(id))
		.filter((t): t is Tag => t !== undefined && t.deletedAt === null)
		.map((tag) => (
			<span
				// Titles aren't unique (tags with the same name can sit under different parents).
				key={tag.id}
				className="rounded-full border border-[var(--border)] px-1.5 py-px text-[0.6875rem] leading-4"
			>
				{tag.title}
			</span>
		));
}

/** Where the item lives: its project, or its area. */
function useContainerTitle(item: Todo | Project): string | null {
	const { areas, projects } = useListData();
	const project =
		"projectId" in item && item.projectId
			? projects.get(item.projectId)
			: undefined;
	if (project) return project.title || "New Project";
	const area = item.areaId ? areas.get(item.areaId) : undefined;
	return area ? area.title || "New Area" : null;
}

type RowOptions = {
	/** Show the project or area under the title. */
	showContainer?: boolean;
	/** Show ★ when the item is also in Today (every list but Today). */
	showStar?: boolean;
	/** Show this date before the title (Upcoming groups spanning several days). */
	date?: LocalDate;
	/** Logbook rows keep completed titles readable instead of struck through. */
	logbook?: boolean;
};

function RowShell({
	box,
	title,
	done,
	struck,
	notes,
	container,
	star,
	date,
	indicators,
	onOpen,
	actions,
	drag,
	selected = false,
	rowId,
	onSwipe,
}: {
	box: ReactNode;
	title: ReactNode;
	done: boolean;
	struck: boolean;
	notes: boolean;
	container: string | null;
	star: boolean;
	date?: LocalDate;
	indicators: ReactNode;
	/** Called on click or Enter; the event tells modifier clicks (⌘/Shift) apart. */
	onOpen?: (e: React.MouseEvent | React.KeyboardEvent) => void;
	/** Highlighted as part of the selection. */
	selected?: boolean;
	/** Marks the row for selection and keyboard navigation (to-dos). */
	rowId?: string;
	/** Buttons shown at the end of the row. */
	actions?: ReactNode;
	/** Makes the row draggable (sortable when inside a SortableList). */
	drag?: { kind: "todo" | "project"; id: string };
	/** Touch swipe actions (to-dos): right sets When, left deletes. */
	onSwipe?: (direction: SwipeDirection) => void;
}) {
	const { ctx } = useListData();
	const swipe = useSwipe(onSwipe);
	const { justDragged } = useDndRegistry();
	const openProps = onOpen
		? {
				role: "button",
				tabIndex: 0,
				"aria-expanded": false,
				// The click that ends a drag shouldn't also open the row.
				onClick: (e: React.MouseEvent) => !justDragged() && onOpen(e),
				// Shift-click selects rows, not text.
				onMouseDown: (e: React.MouseEvent) => e.shiftKey && e.preventDefault(),
				onKeyDown: (e: React.KeyboardEvent) => {
					if (e.key === "Enter" && e.target === e.currentTarget) {
						e.preventDefault();
						onOpen(e);
					}
				},
				"data-row-id": rowId,
				// Buttons can't be aria-selected; "current" is how a selected row is announced.
				"aria-current": rowId && selected ? ("true" as const) : undefined,
			}
		: {};
	return (
		<DragItem
			kind={drag?.kind ?? "todo"}
			id={drag?.id ?? ""}
			disabled={!drag}
			className={`group relative touch-manipulation rounded-md ${swipe.offset !== 0 ? "overflow-hidden" : ""}`}
		>
			{swipe.offset !== 0 && <SwipeBackdrop offset={swipe.offset} />}
			<div
				{...swipe.handlers}
				style={
					swipe.offset !== 0 || swipe.settling
						? {
								transform: `translateX(${swipe.offset}px)`,
								transition: swipe.settling
									? "transform 180ms ease-out"
									: "none",
							}
						: undefined
				}
				className={`relative flex items-start gap-3 rounded-md px-2 py-1.5 pointer-coarse:py-3 ${
					selected
						? "bg-[var(--selected)]"
						: swipe.offset !== 0
							? "bg-[var(--bg)]"
							: "hover:bg-[var(--hover)]"
				} ${onSwipe ? "touch-pan-y" : ""}`}
			>
				{box}
				<div
					{...openProps}
					className={`flex min-w-0 flex-1 items-start gap-3 pointer-coarse:-my-3 pointer-coarse:py-3 ${onOpen ? "cursor-default rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent" : ""}`}
				>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							{date && (
								<span className="shrink-0 rounded bg-[var(--hover)] px-1.5 text-xs font-medium text-[var(--fg-muted)]">
									{shortDate(date, ctx.today)}
								</span>
							)}
							{star && (
								<StarIcon
									className="size-3.5 shrink-0 text-today"
									aria-label="In Today"
									role="img"
								/>
							)}
							<span
								className={`truncate ${done ? "text-[var(--fg-muted)]" : ""} ${struck ? "line-through" : ""}`}
							>
								{title}
							</span>
							{notes && (
								<NotesIcon
									className="size-3.5 shrink-0 text-[var(--fg-muted)]"
									aria-label="Has notes"
									role="img"
								/>
							)}
						</div>
						{container && (
							<div className="truncate text-xs text-[var(--fg-muted)]">
								{container}
							</div>
						)}
					</div>
					<div className="flex shrink-0 items-center gap-2 pt-0.5 text-xs text-[var(--fg-muted)]">
						{indicators}
					</div>
				</div>
				{actions}
			</div>
		</DragItem>
	);
}

/** What a swipe will do, revealed behind the row as it moves. */
function SwipeBackdrop({ offset }: { offset: number }) {
	const right = offset > 0;
	const armed = swipeResult(offset) !== null;
	return (
		<div
			aria-hidden
			className={`absolute inset-0 flex items-center rounded-md px-4 text-sm font-medium transition-colors duration-150 ${
				right ? "justify-start" : "justify-end"
			} ${
				armed
					? right
						? "bg-accent text-on-accent"
						: "bg-overdue text-on-overdue"
					: "bg-[var(--hover)] text-[var(--fg-muted)]"
			}`}
		>
			<span className="flex items-center gap-1.5">
				{right ? (
					<CalendarIcon className="size-4" />
				) : (
					<TrashIcon className="size-4" />
				)}
				{right ? "When" : "Delete"}
			</span>
		</div>
	);
}

export function TodoRow({
	todo,
	showContainer,
	showStar,
	date,
	logbook,
	readOnly,
	actions,
}: { todo: Todo; readOnly?: boolean; actions?: ReactNode } & RowOptions) {
	const { ctx, checklist } = useListData();
	const { expandedId, expand, displayStatus, toggleComplete } = useEditing();
	const { isSelected, select } = useSelection();
	const { openPanel } = useBulkBar();
	const ops = useOps();
	const confirmDelete = useConfirmDelete();
	const toast = useToast();
	const container = useContainerTitle(todo);
	const status = displayStatus(todo.id, todo.status);
	const open = status === "open";
	const steps = checklist.get(todo.id);
	if (!readOnly && expandedId === todo.id) {
		return (
			<li>
				<TodoCard todo={todo} />
			</li>
		);
	}
	return (
		<RowShell
			box={
				<Checkbox
					status={status}
					label={todo.title}
					onToggle={
						readOnly ? undefined : () => toggleComplete(todo.id, todo.status)
					}
				/>
			}
			onOpen={
				readOnly
					? undefined
					: (e) => {
							// ⌘/Ctrl-click and Shift-click select without opening (SPEC §10.7).
							if (e.metaKey || e.ctrlKey) select(todo.id, "toggle");
							else if (e.shiftKey) select(todo.id, "range");
							else {
								select(todo.id, "only");
								expand(todo.id);
							}
						}
			}
			onSwipe={
				readOnly || todo.deletedAt !== null
					? undefined
					: async (direction) => {
							if (direction === "right") {
								select(todo.id, "only");
								openPanel("when");
								return;
							}
							if (!(await confirmDelete(todosRequest([todo])))) return;
							void ops
								.apply([{ type: "delete", entity: "todo", id: todo.id }])
								.then(() =>
									toast.show("Moved to Trash", {
										label: "Undo",
										run: () => void ops.undo().catch(console.error),
									}),
								)
								.catch(console.error);
						}
			}
			rowId={readOnly ? undefined : todo.id}
			selected={!readOnly && isSelected(todo.id)}
			actions={actions}
			drag={
				readOnly || todo.status !== "open"
					? undefined
					: { kind: "todo", id: todo.id }
			}
			title={todo.title || "New To-Do"}
			done={!open}
			struck={!open && (!logbook || todo.status === "canceled")}
			notes={todo.notes.trim() !== ""}
			container={showContainer ? container : null}
			star={!!showStar && open && isInToday(todo, ctx.today)}
			date={date}
			indicators={
				<>
					<TagChips tagIds={todo.tagIds} />
					{steps && (
						<span
							className="flex items-center gap-1"
							title={`Checklist: ${steps.done} of ${steps.total} done`}
						>
							<ChecklistIcon className="size-3.5" />
							{steps.done}/{steps.total}
						</span>
					)}
					{open && todo.reminderAt !== null && (
						<span className="flex items-center gap-1" title="Reminder">
							<BellIcon className="size-3.5" aria-label="Reminder" role="img" />
							{formatTime(reminderTime(todo.reminderAt, ctx.tz))}
						</span>
					)}
					{todo.deadline && <Deadline deadline={todo.deadline} open={open} />}
					{(todo.repeat || todo.repeatTemplateId) && (
						<RepeatIcon
							className="size-3.5"
							aria-label="Repeating"
							role="img"
						/>
					)}
				</>
			}
		/>
	);
}

export function ProjectRow({
	project,
	showContainer,
	showStar,
	date,
	logbook,
	actions,
}: { project: Project; actions?: ReactNode } & RowOptions) {
	const { ctx, data } = useListData();
	const container = useContainerTitle(project);
	const open = project.status === "open";
	return (
		<RowShell
			box={
				<ProgressRing
					progress={projectProgress(project.id, data.todos)}
					status={project.status}
					className="mt-0.5 size-[18px]"
				/>
			}
			title={
				<Link
					to="/project/$projectId"
					params={{ projectId: project.id }}
					className="font-medium hover:underline focus-visible:underline"
				>
					{project.title || "New Project"}
				</Link>
			}
			done={!open}
			struck={!open && (!logbook || project.status === "canceled")}
			notes={false}
			actions={actions}
			drag={
				project.deletedAt === null && open
					? { kind: "project", id: project.id }
					: undefined
			}
			container={showContainer ? container : null}
			star={!!showStar && open && isInToday(project, ctx.today)}
			date={date}
			indicators={
				<>
					<TagChips tagIds={project.tagIds} />
					{project.deadline && (
						<Deadline deadline={project.deadline} open={open} />
					)}
					{(project.repeat || project.repeatTemplateId) && (
						<RepeatIcon
							className="size-3.5"
							aria-label="Repeating"
							role="img"
						/>
					)}
				</>
			}
		/>
	);
}

export function EntryRow({ entry, ...options }: { entry: Entry } & RowOptions) {
	return entry.kind === "todo" ? (
		<TodoRow todo={entry.item} {...options} />
	) : (
		<ProjectRow project={entry.item} {...options} />
	);
}

/** A labelled list of rows. */
export function RowList({
	label,
	children,
}: {
	label?: string;
	children: ReactNode;
}) {
	return (
		<ul aria-label={label} className="flex flex-col">
			{children}
		</ul>
	);
}
