// A to-do expanded inline into an editable card (SPEC §10.2): title, notes,
// checklist, and a footer for When, Tags, Checklist and Deadline.

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
import { useEditing } from "../editing/EditingProvider";
import { describeRule } from "../editing/repeatForm";
import { useCreateTag } from "../editing/useCreateTag";
import { comboFromEvent } from "../keyboard/keys";
import { deadlineLabel, shortDate } from "../lib/format";
import { keyAfter, keyBetween } from "../lib/order";
import { formatTime, reminderTime } from "../lib/reminders";
import { useChecklist, useOps } from "../sync/hooks";
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
	MoreIcon,
	RepeatIcon,
	RestoreIcon,
	TagIcon,
	TrashIcon,
} from "./icons";
import { Popover, PopoverOption } from "./Popover";
import { DeadlinePicker, TagPicker } from "./pickers";
import { Checkbox } from "./rows";
import { SchedulePanel, type ScheduleView, scheduleWidth } from "./schedule";

const SAVE_DELAY_MS = 400;

type PopoverName = "when" | "reminder" | "deadline" | "tags" | "more" | null;

export function TodoCard({ todo }: { todo: Todo }) {
	const ops = useOps();
	const { collapse, registerCard, displayStatus, toggleComplete } =
		useEditing();
	const { ctx, data } = useListData();
	const { user } = useAuth();
	const weekStart = user.settings.weekStart ?? 1;
	const items = useChecklist(todo.id);
	const createTag = useCreateTag();

	const [title, setTitle] = useState(todo.title);
	const [notes, setNotes] = useState(todo.notes);
	const [popover, setPopover] = useState<PopoverName>(null);
	const [scheduleView, setScheduleView] = useState<ScheduleView>("when");
	const [focusItemId, setFocusItemId] = useState<string | null>(null);

	const card = useRef<HTMLDivElement>(null);
	const titleRef = useRef<HTMLInputElement>(null);
	const notesRef = useRef<HTMLTextAreaElement>(null);
	useAutoGrow(notesRef, notes);

	// Title and notes save shortly after typing stops, and whenever the card closes.
	const latest = useRef({ title, notes });
	latest.current = { title, notes };
	const saved = useRef({ title: todo.title, notes: todo.notes });
	const itemsRef = useRef(items);
	itemsRef.current = items;
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const flush = useCallback(() => {
		clearTimeout(timer.current);
		const patch: Partial<Todo> = {};
		if (latest.current.title !== saved.current.title)
			patch.title = latest.current.title;
		if (latest.current.notes !== saved.current.notes)
			patch.notes = latest.current.notes;
		if (Object.keys(patch).length === 0) return;
		saved.current = { ...latest.current };
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
		return () => {
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
		}
	};

	const update = (patch: Partial<Todo>) => {
		void ops.update("todo", todo.id, patch).catch(console.error);
	};

	const addChecklistItem = async (after?: ChecklistItem) => {
		const list = items ?? [];
		const index = after
			? list.findIndex((i) => i.id === after.id)
			: list.length - 1;
		const before = index >= 0 ? list[index] : undefined;
		const next = index >= 0 ? list[index + 1] : undefined;
		const id = await ops.create("checklist", {
			todoId: todo.id,
			title: "",
			sortKey: next
				? keyBetween(before?.sortKey, next.sortKey)
				: keyAfter(before?.sortKey),
		});
		setFocusItemId(id);
	};

	const close = () => setPopover(null);
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
					label={title || "New To-Do"}
					onToggle={() => toggleComplete(todo.id, todo.status)}
				/>
				<input
					ref={titleRef}
					value={title}
					onChange={(e) => {
						setTitle(e.target.value);
						scheduleSave();
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
							e.preventDefault();
							collapse();
						}
					}}
					placeholder="New To-Do"
					aria-label="Title"
					className={`min-w-0 flex-1 bg-transparent text-[0.9375rem] font-medium outline-none placeholder:text-[var(--fg-muted)] ${
						status !== "open" ? "text-[var(--fg-muted)] line-through" : ""
					}`}
				/>
			</div>

			<textarea
				ref={notesRef}
				value={notes}
				onChange={(e) => {
					setNotes(e.target.value);
					scheduleSave();
				}}
				rows={1}
				placeholder="Notes"
				aria-label="Notes"
				className="mt-1 block w-full resize-none overflow-hidden bg-transparent pl-[38px] pr-2 text-sm leading-relaxed text-[var(--fg)] outline-none placeholder:text-[var(--fg-muted)]"
			/>

			{items && items.length > 0 && (
				<ul
					aria-label="Checklist"
					className="mt-2 ml-[38px] mr-1 border-t border-[var(--border)]"
				>
					{items.map((item, index) => (
						<ChecklistRow
							key={item.id}
							item={item}
							autoFocus={item.id === focusItemId}
							onEnter={() => addChecklistItem(item)}
							onRemove={() => {
								const previous = items[index - 1];
								void ops.purge("checklist", item.id).catch(console.error);
								if (previous) setFocusItemId(previous.id);
								else titleRef.current?.focus();
							}}
						/>
					))}
				</ul>
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
						<PopoverOption
							icon={<TrashIcon className="size-4 text-overdue" />}
							onSelect={() => {
								collapse();
								void ops.remove("todo", todo.id).catch(console.error);
							}}
						>
							<span className="text-overdue">Delete To-Do</span>
						</PopoverOption>
					</Popover>
				</div>
			</div>
		</div>
	);
}

function ChecklistRow({
	item,
	autoFocus,
	onEnter,
	onRemove,
}: {
	item: ChecklistItem;
	autoFocus: boolean;
	onEnter: () => void;
	onRemove: () => void;
}) {
	const ops = useOps();
	const [title, setTitle] = useState(item.title);
	const input = useRef<HTMLInputElement>(null);
	const saved = useRef(item.title);

	useEffect(() => {
		if (autoFocus) input.current?.focus();
	}, [autoFocus]);

	const latest = useRef(title);
	latest.current = title;
	const save = useCallback(() => {
		if (latest.current === saved.current) return;
		saved.current = latest.current;
		void ops
			.update("checklist", item.id, { title: latest.current })
			.catch(console.error);
	}, [ops, item.id]);
	// Inputs don't blur when they unmount, so save on the way out too.
	useEffect(() => save, [save]);

	return (
		<li className="flex items-center gap-2 border-b border-[var(--border)] py-1">
			<input
				type="checkbox"
				checked={item.done}
				aria-label={`Done: ${title || "checklist item"}`}
				onChange={() =>
					void ops
						.update("checklist", item.id, { done: !item.done })
						.catch(console.error)
				}
				className="size-3.5 shrink-0 cursor-pointer appearance-none rounded-full border border-[var(--checkbox)] checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			/>
			<input
				ref={input}
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				onBlur={save}
				onKeyDown={(e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						save();
						onEnter();
					} else if (e.key === "Backspace" && title === "") {
						e.preventDefault();
						onRemove();
					}
				}}
				placeholder="Checklist item"
				aria-label="Checklist item"
				className={`min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-muted)] ${
					item.done ? "text-[var(--fg-muted)] line-through" : ""
				}`}
			/>
		</li>
	);
}
