// The When popover's three views (SPEC §10.3): picking a date, setting a
// reminder (to-dos), and the repeat editor (SPEC §5.8).

import { type ReactNode, useMemo, useState } from "react";
import { addDays, type LocalDate } from "../../shared/dates";
import { previewOccurrences } from "../../shared/repeat";
import type { Project, Todo } from "../../shared/schema";
import { useAuth } from "../auth/AuthGate";
import { useListData } from "../data";
import {
	describeRule,
	type Freq,
	formFromRule,
	type Nth,
	ordinal,
	type RepeatForm,
	ruleFromForm,
} from "../editing/repeatForm";
import { shortDate } from "../lib/format";
import {
	formatTime,
	moveReminder,
	reminderAt,
	reminderTime,
} from "../lib/reminders";
import {
	type NotificationState,
	useNotificationState,
} from "../push/notifications";
import { BellIcon, RepeatIcon } from "./icons";
import { PopoverOption } from "./Popover";
import { WhenPicker } from "./pickers";

export type ScheduleView = "when" | "repeat" | "reminder";

/** Width for the popover, by view (the repeat editor needs more room). */
export const scheduleWidth = (view: ScheduleView) =>
	view === "repeat" ? "w-80" : "w-64";

export function SchedulePanel({
	item,
	entity,
	view,
	setView,
	onPatch,
	onDone,
}: {
	item: Todo | Project;
	entity: "todo" | "project";
	view: ScheduleView;
	setView: (view: ScheduleView) => void;
	onPatch: (patch: Record<string, unknown>) => void;
	onDone: () => void;
}) {
	const { ctx } = useListData();
	const { user } = useAuth();
	const weekStart = user.settings.weekStart ?? 1;
	const todo = entity === "todo" ? (item as Todo) : null;

	if (view === "repeat") {
		return (
			<RepeatEditor
				item={item}
				today={ctx.today}
				weekStart={weekStart}
				onSave={(repeat) => {
					onPatch({ repeat });
					onDone();
				}}
				onBack={() => (item.repeat ? onDone() : setView("when"))}
			/>
		);
	}
	if (view === "reminder" && todo) {
		return (
			<ReminderPicker
				todo={todo}
				today={ctx.today}
				tz={ctx.tz}
				onSave={(patch) => {
					onPatch(patch);
					onDone();
				}}
				onBack={() => setView("when")}
			/>
		);
	}

	const footer = (
		<>
			{todo && (
				<PopoverOption
					icon={<BellIcon className="size-4" />}
					onSelect={() => setView("reminder")}
				>
					{todo.reminderAt
						? `Reminder ${formatTime(reminderTime(todo.reminderAt, ctx.tz))}`
						: "Add Reminder"}
				</PopoverOption>
			)}
			<PopoverOption
				icon={<RepeatIcon className="size-4" />}
				onSelect={() => setView("repeat")}
			>
				Repeat…
			</PopoverOption>
		</>
	);
	return (
		<WhenPicker
			value={item}
			today={ctx.today}
			weekStart={weekStart}
			footer={footer}
			onChange={(fields) => {
				const patch: Record<string, unknown> = { ...fields };
				// A reminder moves with its to-do's date (and goes if the date does).
				if (todo?.reminderAt) {
					patch.reminderAt = moveReminder(
						todo.reminderAt,
						fields.when === "scheduled" ? fields.startDate : null,
						ctx.tz,
					);
				}
				onPatch(patch);
				onDone();
			}}
		/>
	);
}

function NotificationNotice({
	state,
	onEnable,
}: {
	state: NotificationState;
	onEnable: () => void;
}) {
	const text: Record<NotificationState, ReactNode> = {
		granted: null,
		default: (
			<>
				Reminders arrive as notifications.{" "}
				<button
					type="button"
					onClick={onEnable}
					className="font-medium text-accent hover:underline"
				>
					Allow notifications
				</button>
			</>
		),
		denied:
			"Notifications are blocked for this site. Allow them in your browser's site settings to get reminders.",
		unsupported:
			"This browser can't show notifications, so reminders won't alert you here.",
	};
	if (!text[state]) return null;
	return (
		<p className="mt-2 rounded-md bg-[var(--hover)] px-2 py-1.5 text-xs text-[var(--fg-muted)]">
			{text[state]}
		</p>
	);
}

function ReminderPicker({
	todo,
	today,
	tz,
	onSave,
	onBack,
}: {
	todo: Todo;
	today: LocalDate;
	tz: string;
	onSave: (patch: Record<string, unknown>) => void;
	onBack: () => void;
}) {
	const [time, setTime] = useState(
		todo.reminderAt ? reminderTime(todo.reminderAt, tz) : "09:00",
	);
	const [notifications, enable] = useNotificationState();
	// A reminder needs a day: the to-do's start date, or today.
	const date =
		todo.when === "scheduled" && todo.startDate ? todo.startDate : today;

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				// Saving is a click, so it can carry the permission prompt.
				if (notifications === "default") void enable();
				onSave({
					when: "scheduled",
					startDate: date,
					reminderAt: reminderAt(date, time, tz),
				});
			}}
		>
			<label className="flex items-center justify-between gap-2 px-1 text-sm">
				<span>
					Remind me {date === today ? "today" : `on ${shortDate(date, today)}`}{" "}
					at
				</span>
				<input
					type="time"
					required
					value={time}
					onChange={(e) => setTime(e.target.value)}
					className="rounded-md border border-[var(--border)] bg-transparent px-1.5 py-1 outline-none focus:border-accent"
				/>
			</label>
			<NotificationNotice
				state={notifications}
				onEnable={() => void enable()}
			/>
			<div className="mt-3 flex items-center gap-2">
				<button
					type="submit"
					className="rounded-md bg-accent px-2.5 py-1 text-sm font-medium text-on-accent hover:opacity-90"
				>
					Save
				</button>
				{todo.reminderAt !== null && (
					<button
						type="button"
						onClick={() => onSave({ reminderAt: null })}
						className="rounded-md px-2 py-1 text-sm text-overdue hover:bg-[var(--hover)]"
					>
						Remove
					</button>
				)}
				<button
					type="button"
					onClick={onBack}
					className="ml-auto rounded-md px-2 py-1 text-sm hover:bg-[var(--hover)]"
				>
					Back
				</button>
			</div>
		</form>
	);
}

const FREQS: { value: Freq; one: string; many: string }[] = [
	{ value: "daily", one: "day", many: "days" },
	{ value: "weekly", one: "week", many: "weeks" },
	{ value: "monthly", one: "month", many: "months" },
	{ value: "yearly", one: "year", many: "years" },
];
const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const fieldClass =
	"rounded-md border border-[var(--border)] bg-transparent px-1.5 py-1 text-sm outline-none focus:border-accent";

function RepeatEditor({
	item,
	today,
	weekStart,
	onSave,
	onBack,
}: {
	item: Todo | Project;
	today: LocalDate;
	weekStart: number;
	onSave: (repeat: Todo["repeat"]) => void;
	onBack: () => void;
}) {
	const [form, setForm] = useState<RepeatForm>(() =>
		formFromRule(
			item.repeat,
			item.when === "scheduled" && item.startDate && item.startDate > today
				? item.startDate
				: today,
		),
	);
	const set = (patch: Partial<RepeatForm>) =>
		setForm((f) => ({ ...f, ...patch }));
	const result = useMemo(
		() => ruleFromForm(form, weekStart),
		[form, weekStart],
	);
	const preview =
		"rule" in result ? previewOccurrences(result.rule, 3, weekStart) : [];
	const fixed = form.mode === "fixed";
	const weekdays = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if ("rule" in result) onSave(result.rule);
			}}
			className="flex flex-col gap-2.5 text-sm"
		>
			<div
				role="radiogroup"
				aria-label="Repeat type"
				className="grid grid-cols-2 rounded-lg bg-[var(--hover)] p-0.5 text-xs"
			>
				{(["fixed", "afterCompletion"] as const).map((mode) => (
					// biome-ignore lint/a11y/useSemanticElements: a segmented control
					<button
						key={mode}
						type="button"
						role="radio"
						aria-checked={form.mode === mode}
						onClick={() => set({ mode })}
						className={`rounded-md px-2 py-1 font-medium ${form.mode === mode ? "bg-[var(--card)] shadow-sm" : "text-[var(--fg-muted)]"}`}
					>
						{mode === "fixed" ? "On a schedule" : "After completion"}
					</button>
				))}
			</div>

			<label className="flex items-center gap-2">
				{fixed ? "Every" : "Again"}
				<input
					type="number"
					min={1}
					max={999}
					value={form.interval}
					onChange={(e) => set({ interval: Number(e.target.value) })}
					aria-label="Interval"
					className={`${fieldClass} w-14`}
				/>
				<select
					value={form.freq}
					onChange={(e) => set({ freq: e.target.value as Freq })}
					aria-label="Unit"
					className={fieldClass}
				>
					{FREQS.map((f) => (
						<option key={f.value} value={f.value}>
							{form.interval === 1 ? f.one : f.many}
						</option>
					))}
				</select>
				{!fixed && "after it's done"}
			</label>

			{fixed && form.freq === "weekly" && (
				<fieldset className="flex gap-1">
					<legend className="sr-only">On</legend>
					{weekdays.map((day) => {
						const on = form.weekdays.includes(day);
						return (
							<button
								key={day}
								type="button"
								aria-pressed={on}
								aria-label={WEEKDAY_NAMES[day]}
								onClick={() =>
									set({
										weekdays: on
											? form.weekdays.filter((d) => d !== day)
											: [...form.weekdays, day],
									})
								}
								className={`size-7 rounded-full text-xs font-medium ${on ? "bg-accent text-on-accent" : "bg-[var(--hover)] text-[var(--fg-muted)]"}`}
							>
								{WEEKDAY_LETTERS[day]}
							</button>
						);
					})}
				</fieldset>
			)}

			{fixed && form.freq === "monthly" && (
				<fieldset className="flex flex-col gap-1.5">
					<legend className="sr-only">On</legend>
					<label className="flex items-center gap-2">
						<input
							type="radio"
							checked={form.monthlyBy === "day"}
							onChange={() => set({ monthlyBy: "day" })}
						/>
						On the
						<select
							value={form.monthDay}
							onChange={(e) =>
								set({ monthlyBy: "day", monthDay: Number(e.target.value) })
							}
							aria-label="Day of month"
							className={fieldClass}
						>
							{[...Array.from({ length: 31 }, (_, i) => i + 1), -1].map((d) => (
								<option key={d} value={d}>
									{d === -1 ? "last day" : ordinal(d)}
								</option>
							))}
						</select>
					</label>
					<label className="flex items-center gap-2">
						<input
							type="radio"
							checked={form.monthlyBy === "nth"}
							onChange={() => set({ monthlyBy: "nth" })}
						/>
						On the
						<select
							value={form.nth}
							onChange={(e) =>
								set({ monthlyBy: "nth", nth: Number(e.target.value) as Nth })
							}
							aria-label="Which week"
							className={fieldClass}
						>
							{([1, 2, 3, 4, -1] as const).map((n) => (
								<option key={n} value={n}>
									{ordinal(n)}
								</option>
							))}
						</select>
						<select
							value={form.nthWeekday}
							onChange={(e) =>
								set({ monthlyBy: "nth", nthWeekday: Number(e.target.value) })
							}
							aria-label="Weekday"
							className={fieldClass}
						>
							{weekdays.map((d) => (
								<option key={d} value={d}>
									{WEEKDAY_NAMES[d]}
								</option>
							))}
						</select>
					</label>
				</fieldset>
			)}

			{fixed && form.freq === "yearly" && (
				<label className="flex items-center gap-2">
					On
					<select
						value={form.yearMonth}
						onChange={(e) => set({ yearMonth: Number(e.target.value) })}
						aria-label="Month"
						className={fieldClass}
					>
						{MONTHS.map((m, i) => (
							<option key={m} value={i + 1}>
								{m}
							</option>
						))}
					</select>
					<input
						type="number"
						min={1}
						max={31}
						value={form.yearDay}
						onChange={(e) => set({ yearDay: Number(e.target.value) })}
						aria-label="Day"
						className={`${fieldClass} w-14`}
					/>
				</label>
			)}

			<label className="flex items-center justify-between gap-2">
				Starting
				<input
					type="date"
					required
					min={today}
					value={form.start}
					onChange={(e) => e.target.value && set({ start: e.target.value })}
					className={fieldClass}
				/>
			</label>

			<label className="flex items-center gap-2">
				<input
					type="checkbox"
					checked={form.deadlineOffset !== null}
					onChange={(e) => set({ deadlineOffset: e.target.checked ? 0 : null })}
				/>
				Deadline
				{form.deadlineOffset !== null && (
					<>
						<input
							type="number"
							min={0}
							max={365}
							value={form.deadlineOffset}
							onChange={(e) => set({ deadlineOffset: Number(e.target.value) })}
							aria-label="Days after start"
							className={`${fieldClass} w-14`}
						/>
						days after start
					</>
				)}
			</label>

			{item.repeatTemplateId === null && "reminderAt" in item && (
				<label className="flex items-center gap-2">
					<input
						type="checkbox"
						checked={form.reminderTime !== null}
						onChange={(e) =>
							set({ reminderTime: e.target.checked ? "09:00" : null })
						}
					/>
					Reminder
					{form.reminderTime !== null && (
						<input
							type="time"
							value={form.reminderTime}
							onChange={(e) => set({ reminderTime: e.target.value || null })}
							aria-label="Reminder time"
							className={fieldClass}
						/>
					)}
				</label>
			)}

			<label className="flex items-center gap-2">
				<input
					type="checkbox"
					checked={form.endsOn !== null}
					onChange={(e) =>
						set({ endsOn: e.target.checked ? addDays(form.start, 30) : null })
					}
				/>
				Ends
				{form.endsOn !== null && (
					<input
						type="date"
						min={form.start}
						value={form.endsOn}
						onChange={(e) => set({ endsOn: e.target.value || null })}
						aria-label="Ends on"
						className={fieldClass}
					/>
				)}
			</label>

			<p className="min-h-8 text-xs text-[var(--fg-muted)]" aria-live="polite">
				{"error" in result ? (
					<span className="text-overdue">{result.error}</span>
				) : (
					<>
						{describeRule(result.rule)}
						<br />
						{fixed ? "Next: " : "First: "}
						{(fixed ? preview : preview.slice(0, 1))
							.map((d) => shortDate(d, today))
							.join(", ")}
					</>
				)}
			</p>

			<div className="flex items-center gap-2">
				<button
					type="submit"
					disabled={"error" in result}
					className="rounded-md bg-accent px-2.5 py-1 font-medium text-on-accent hover:opacity-90 disabled:opacity-40"
				>
					{item.repeat ? "Save" : "Repeat"}
				</button>
				{item.repeat && (
					<button
						type="button"
						onClick={() => onSave(null)}
						className="rounded-md px-2 py-1 text-overdue hover:bg-[var(--hover)]"
					>
						Stop Repeating
					</button>
				)}
				<button
					type="button"
					onClick={onBack}
					className="ml-auto rounded-md px-2 py-1 hover:bg-[var(--hover)]"
				>
					{item.repeat ? "Cancel" : "Back"}
				</button>
			</div>
		</form>
	);
}
