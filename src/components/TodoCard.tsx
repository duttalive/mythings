// A to-do expanded inline into an editable card (SPEC §10.2): title,
// checklist, and a footer for When, Tags, Checklist and Deadline. Notes are
// written on the to-do's Task Notes page, not here.

import { Link } from "@tanstack/react-router";
import {
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { ChecklistItem, Todo } from "../../shared/schema";
import { useAuth } from "../auth/AuthGate";
import { useListData } from "../data";
import { todosRequest } from "../editing/deleteRequests";
import { useEditing } from "../editing/EditingProvider";
import { choiceForTodo, choiceTitle } from "../editing/listOptions";
import { describeRule } from "../editing/repeatForm";
import { useBulkActions } from "../editing/useBulkActions";
import { useCreateTag } from "../editing/useCreateTag";
import { useFocus } from "../focus/FocusProvider";
import { comboFromEvent } from "../keyboard/keys";
import { deadlineLabel, shortDate } from "../lib/format";
import { formatTime, reminderTime } from "../lib/reminders";
import { useChecklist, useOps } from "../sync/hooks";
import { useTabs } from "../tabs/TabsProvider";
import { Checklist, useAddChecklistItem } from "./Checklist";
import { useConfirmDelete } from "./ConfirmDelete";
import {
	ChipButton,
	IconButton,
	useAutoGrow,
	WhenIcon,
	whenText,
} from "./controls";
import {
	BellIcon,
	CalendarIcon,
	ChecklistIcon,
	CrossIcon,
	FlagIcon,
	FocusIcon,
	LayersIcon,
	MoreIcon,
	NotesIcon,
	RepeatIcon,
	RestoreIcon,
	TagIcon,
	TrashIcon,
} from "./icons";
import { Popover, PopoverOption } from "./Popover";
import { DeadlinePicker, ListPicker, TagPicker } from "./pickers";
import { Checkbox } from "./rows";
import { SchedulePanel, type ScheduleView, scheduleWidth } from "./schedule";
import { useToast } from "./Toast";

const SAVE_DELAY_MS = 400;

type PopoverName =
	| "when"
	| "reminder"
	| "deadline"
	| "tags"
	| "move"
	| "more"
	| null;

export function TodoCard({ todo }: { todo: Todo }) {
	const ops = useOps();
	const confirmDelete = useConfirmDelete();
	const { collapse, registerCard, displayStatus, toggleComplete } =
		useEditing();
	const { ctx, data } = useListData();
	const { user } = useAuth();
	const weekStart = user.settings.weekStart ?? 1;
	const items = useChecklist(todo.id);
	const createTag = useCreateTag();
	const focus = useFocus();
	const tabs = useTabs();
	const startFocus = () => {
		flush();
		collapse();
		focus.open(todo.id);
	};

	const [title, setTitle] = useState(todo.title);
	const [popover, setPopover] = useState<PopoverName>(null);
	const [scheduleView, setScheduleView] = useState<ScheduleView>("when");
	const [focusItemId, setFocusItemId] = useState<string | null>(null);

	const card = useRef<HTMLDivElement>(null);
	const titleRef = useRef<HTMLTextAreaElement>(null);
	useAutoGrow(titleRef, title);

	// The title saves shortly after typing stops, and whenever the card closes.
	const latest = useRef({ title, notes: todo.notes });
	latest.current = { title, notes: todo.notes };
	const saved = useRef({ title: todo.title });
	const itemsRef = useRef(items);
	itemsRef.current = items;
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const flush = useCallback(() => {
		clearTimeout(timer.current);
		const patch: Partial<Todo> = {};
		if (latest.current.title !== saved.current.title)
			patch.title = latest.current.title;
		if (Object.keys(patch).length === 0) return;
		saved.current = { title: latest.current.title };
		void ops.update("todo", todo.id, patch).catch(console.error);
	}, [ops, todo.id]);

	const scheduleSave = () => {
		clearTimeout(timer.current);
		timer.current = setTimeout(flush, SAVE_DELAY_MS);
	};

	useEffect(() => {
		registerCard(todo.id, {
			flush,
			isBlank: () =>
				!latest.current.title.trim() &&
				!latest.current.notes.trim() &&
				(itemsRef.current?.length ?? 0) === 0,
		});
		// Closing or reloading the page saves what's typed, too.
		window.addEventListener("pagehide", flush);
		return () => {
			window.removeEventListener("pagehide", flush);
			flush();
			registerCard(todo.id, null);
		};
	}, [todo.id, flush, registerCard]);

	// Focus the title, cursor at the end.
	useEffect(() => {
		const el = titleRef.current;
		if (!el) return;
		el.focus();
		el.setSelectionRange(el.value.length, el.value.length);
	}, []);

	// Clicking anywhere outside the card closes it (popovers render inside it).
	useEffect(() => {
		const onPointerDown = (e: PointerEvent) => {
			if (card.current && !card.current.contains(e.target as Node)) collapse();
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [collapse]);

	const onCardKeyDown = (e: KeyboardEvent) => {
		const inPopover = (e.target as HTMLElement).closest(
			"[data-popover-content]",
		);
		if (inPopover) return;
		// The card's own shortcuts (SPEC §10.6); preventDefault keeps the global ones out.
		switch (comboFromEvent(e.nativeEvent)) {
			case "escape":
			case "mod+enter":
				e.preventDefault();
				collapse();
				return;
			case "mod+k":
				e.preventDefault();
				toggleComplete(todo.id, todo.status);
				return;
			case "mod+alt+k":
				e.preventDefault();
				update({ status: todo.status === "canceled" ? "open" : "canceled" });
				return;
			case "mod+s":
				e.preventDefault();
				setScheduleView(todo.repeat ? "repeat" : "when");
				setPopover("when");
				return;
			case "mod+shift+d":
				e.preventDefault();
				setPopover("deadline");
				return;
			case "mod+shift+t":
				e.preventDefault();
				setPopover("tags");
				return;
			case "alt+f":
				if (status !== "open") return;
				e.preventDefault();
				startFocus();
				return;
		}
	};

	const update = (patch: Partial<Todo>) => {
		void ops.update("todo", todo.id, patch).catch(console.error);
	};

	const addItem = useAddChecklistItem(todo.id, items);
	const addChecklistItem = async (after?: ChecklistItem) =>
		setFocusItemId(await addItem(after));

	const close = () => setPopover(null);
	const { moveTo } = useBulkActions();
	const toast = useToast();
	const status = displayStatus(todo.id, todo.status);
	const isTemplate = todo.repeat !== null;
	const tags = todo.tagIds
		.map((id) => data.tags.find((t) => t.id === id))
		.filter((t) => t && t.deletedAt === null);

	/** The When popover; `name` and `view` let the reminder and repeat chips open it at their view. */
	const whenPopover = (
		trigger: ReactNode,
		name: "when" | "reminder" = "when",
		view: ScheduleView = "when",
	) => (
		<Popover
			label={name === "reminder" ? "Reminder" : "When"}
			open={popover === name}
			width={scheduleWidth(scheduleView)}
			onOpenChange={(o) => {
				if (o) setScheduleView(view);
				setPopover(o ? name : null);
			}}
			trigger={trigger}
		>
			<SchedulePanel
				item={todo}
				entity="todo"
				view={scheduleView}
				setView={setScheduleView}
				onPatch={(patch) => update(patch as Partial<Todo>)}
				onDone={close}
			/>
		</Popover>
	);
	const deadlinePopover = (trigger: ReactNode) => (
		<Popover
			label="Deadline"
			open={popover === "deadline"}
			onOpenChange={(o) => setPopover(o ? "deadline" : null)}
			trigger={trigger}
		>
			<DeadlinePicker
				value={todo.deadline}
				today={ctx.today}
				weekStart={weekStart}
				onChange={(deadline) => {
					update({ deadline });
					close();
				}}
			/>
		</Popover>
	);
	const place = choiceForTodo(todo);
	const movePopover = (trigger: ReactNode) => (
		<Popover
			label="Move"
			open={popover === "move"}
			onOpenChange={(o) => setPopover(o ? "move" : null)}
			trigger={trigger}
		>
			<ListPicker
				data={data}
				selected={place}
				onSelect={(choice) => {
					close();
					moveTo([todo.id], choice);
					toast.show(`Moved to ${choiceTitle(choice, data)}`);
				}}
			/>
		</Popover>
	);

	const tagsPopover = (trigger: ReactNode) => (
		<Popover
			label="Tags"
			open={popover === "tags"}
			onOpenChange={(o) => setPopover(o ? "tags" : null)}
			trigger={trigger}
		>
			<TagPicker
				tags={data.tags}
				selected={todo.tagIds}
				onToggle={(tagId) =>
					update({
						tagIds: todo.tagIds.includes(tagId)
							? todo.tagIds.filter((t) => t !== tagId)
							: [...todo.tagIds, tagId],
					})
				}
				onCreate={async (title) => {
					const tagId = await createTag(title);
					update({ tagIds: [...todo.tagIds, tagId] });
				}}
			/>
		</Popover>
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Escape / ⌘↵ from any field inside the card closes it
		<div
			ref={card}
			onKeyDown={onCardKeyDown}
			className="my-2 animate-card-open rounded-xl bg-[var(--card)] px-2 pb-2 pt-1.5 shadow-[var(--card-shadow)] ring-1 ring-[var(--border)]"
		>
			<div className="flex items-start gap-3 px-1">
				<Checkbox
					status={status}
					label={title || "New Task"}
					onToggle={() => toggleComplete(todo.id, todo.status)}
				/>
				{/* A one-line title that wraps onto more lines as it grows. */}
				<textarea
					ref={titleRef}
					value={title}
					rows={1}
					onChange={(e) => {
						setTitle(e.target.value.replace(/\s*\n\s*/g, " "));
						scheduleSave();
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
							e.preventDefault();
							collapse();
						}
					}}
					placeholder="New Task"
					aria-label="Title"
					className={`min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-[0.9375rem] font-medium break-words outline-none placeholder:text-[var(--fg-muted)] ${
						status !== "open" ? "text-[var(--fg-muted)] line-through" : ""
					}`}
				/>
			</div>

			{items && items.length > 0 && (
				<Checklist
					items={items}
					focusId={focusItemId}
					onFocusId={setFocusItemId}
					onAdd={addChecklistItem}
					onLeaveTop={() => titleRef.current?.focus()}
					className="mt-2 ml-[38px] mr-1"
				/>
			)}

			<div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[34px]">
				{isTemplate && todo.repeat
					? whenPopover(
							<ChipButton
								icon={<RepeatIcon className="size-3.5" />}
								title={describeRule(todo.repeat)}
							>
								Repeats · next {shortDate(todo.repeat.nextDate, ctx.today)}
							</ChipButton>,
							"when",
							"repeat",
						)
					: (todo.when === "scheduled" || todo.when === "someday") &&
						whenPopover(
							<ChipButton icon={<WhenIcon todo={todo} today={ctx.today} />}>
								{whenText(todo, ctx.today)}
							</ChipButton>,
						)}
				{todo.reminderAt !== null &&
					!isTemplate &&
					whenPopover(
						<ChipButton icon={<BellIcon className="size-3.5" />}>
							{formatTime(reminderTime(todo.reminderAt, ctx.tz))}
						</ChipButton>,
						"reminder",
						"reminder",
					)}
				{place &&
					place.type !== "inbox" &&
					movePopover(
						<ChipButton
							icon={<LayersIcon className="size-3.5" />}
							title="Move to another list"
						>
							{choiceTitle(place, data)}
						</ChipButton>,
					)}
				{tags.length > 0 &&
					tagsPopover(
						<ChipButton icon={<TagIcon className="size-3.5" />}>
							{tags.map((t) => t?.title).join(", ")}
						</ChipButton>,
					)}
				{todo.deadline &&
					deadlinePopover(
						<ChipButton
							icon={<FlagIcon className="size-3.5" />}
							danger={status === "open" && todo.deadline <= ctx.today}
						>
							Deadline {shortDate(todo.deadline, ctx.today)}
							{deadlineLabel(todo.deadline, ctx.today) !==
								shortDate(todo.deadline, ctx.today) &&
								` · ${deadlineLabel(todo.deadline, ctx.today)}`}
						</ChipButton>,
					)}

				<div className="ml-auto flex items-center">
					{!isTemplate &&
						todo.when !== "scheduled" &&
						todo.when !== "someday" &&
						whenPopover(
							<IconButton label="When">
								{<CalendarIcon className="size-4" />}
							</IconButton>,
						)}
					{(!place || place.type === "inbox") &&
						movePopover(
							<IconButton label="Move">
								<LayersIcon className="size-4" />
							</IconButton>,
						)}
					{tags.length === 0 &&
						tagsPopover(
							<IconButton label="Tags">
								{<TagIcon className="size-4" />}
							</IconButton>,
						)}
					{(items?.length ?? 0) === 0 && (
						<IconButton
							label="Add checklist"
							onClick={() => addChecklistItem()}
						>
							<ChecklistIcon className="size-4" />
						</IconButton>
					)}
					{!todo.deadline &&
						deadlinePopover(
							<IconButton label="Deadline">
								{<FlagIcon className="size-4" />}
							</IconButton>,
						)}
					{status === "open" && !isTemplate && (
						<IconButton label="Focus" onClick={startFocus}>
							<FocusIcon className="size-4" />
						</IconButton>
					)}
					<Link
						to="/notes/$todoId"
						params={{ todoId: todo.id }}
						aria-label="Open in Task Notes"
						title="Open in Task Notes"
						className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:p-2.5"
					>
						<NotesIcon className="size-4" />
					</Link>
					<Popover
						label="More"
						open={popover === "more"}
						onOpenChange={(o) => setPopover(o ? "more" : null)}
						trigger={
							<IconButton label="More actions">
								<MoreIcon className="size-4" />
							</IconButton>
						}
					>
						{todo.status === "open" ? (
							<PopoverOption
								icon={<CrossIcon className="size-3.5" />}
								onSelect={() => {
									update({ status: "canceled" });
									close();
								}}
							>
								Mark as Canceled
							</PopoverOption>
						) : (
							<PopoverOption
								icon={<RestoreIcon className="size-4" />}
								onSelect={() => {
									update({ status: "open" });
									close();
								}}
							>
								Reopen
							</PopoverOption>
						)}
						{tabs.enabled && (
							<PopoverOption
								icon={<NotesIcon className="size-4" />}
								onSelect={() => {
									close();
									flush();
									tabs.openInNewTab(`/notes/${todo.id}`);
								}}
							>
								Open in New Tab
							</PopoverOption>
						)}
						<PopoverOption
							icon={<TrashIcon className="size-4 text-overdue" />}
							onSelect={async () => {
								if (!(await confirmDelete(todosRequest([todo])))) return;
								collapse();
								void ops.remove("todo", todo.id).catch(console.error);
							}}
						>
							<span className="text-overdue">Delete Task</span>
						</PopoverOption>
					</Popover>
				</div>
			</div>
		</div>
	);
}
