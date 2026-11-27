// Focus Mode's screens (SPEC §10.13): full screen while focusing, or a small
// pill at the bottom while you use the rest of the app.

import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { UNREADABLE } from "../../shared/crypto/fields";
import type { Todo } from "../../shared/schema";
import { Checklist, useAddChecklistItem } from "../components/Checklist";
import {
	ChecklistIcon,
	CrossIcon,
	FocusIcon,
	MinimizeIcon,
	NotesIcon,
	PauseIcon,
	PlayIcon,
	RestoreIcon,
} from "../components/icons";
import { useToast } from "../components/Toast";
import { useListData } from "../data";
import { useEditing } from "../editing/EditingProvider";
import { NotesEditor } from "../notes";
import { notificationState, useNotificationState } from "../push/notifications";
import { useChecklist } from "../sync/hooks";
import { useFocus } from "./FocusProvider";
import {
	elapsedMs,
	type FocusSession,
	focusedMs,
	formatClock,
	formatDuration,
	isFinished,
	isFresh,
	MAX_MINUTES,
	MIN_MINUTES,
	PRESETS,
	remainingMs,
} from "./timer";

const clockText = (s: FocusSession, now: number) =>
	formatClock(remainingMs(s, now));

/** Mounted once in the shell: the focus screen or pill, when a session is on. */
export function FocusLayer() {
	const focus = useFocus();
	const { data } = useListData();
	const { session } = focus;
	const todo = session
		? data.todos.find((t) => t.id === session.todoId)
		: undefined;

	// The to-do was deleted (here or on another device): nothing left to focus on.
	const gone = !!session && (!todo || todo.deletedAt !== null);
	useEffect(() => {
		if (gone) focus.end();
	}, [gone, focus]);

	// "12:34 · Today · mythings" in the browser tab while the countdown runs.
	const clock =
		session && !gone && session.runningSince !== null
			? clockText(session, focus.now)
			: null;
	useEffect(() => {
		const strip = (title: string) => title.replace(/^\d+(:\d\d)+ · /, "");
		document.title = clock
			? `${clock} · ${strip(document.title)}`
			: strip(document.title);
	}, [clock]);

	if (!session || !todo || gone) return null;
	return session.minimized ? (
		<FocusPill todo={todo} />
	) : (
		<FocusScreen todo={todo} />
	);
}

function FocusPill({ todo }: { todo: Todo }) {
	const { session, now, toggleRunning, setMinimized } = useFocus();
	if (!session) return null;
	const running = session.runningSince !== null;
	const done = isFinished(session);
	const title = todo.title === UNREADABLE ? "🔒" : todo.title || "New Task";
	return (
		<section
			aria-label="Focus"
			className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-4 z-30 flex max-w-[calc(100vw-7rem)] animate-pop-in items-center gap-1 rounded-full bg-[var(--card)] py-1 pr-1 pl-1 shadow-[var(--card-shadow)] ring-1 ring-[var(--border)] md:left-1/2 md:max-w-sm md:-translate-x-1/2"
		>
			{!done && (
				<button
					type="button"
					onClick={toggleRunning}
					aria-label={running ? "Pause focus" : "Resume focus"}
					className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-coarse:size-11"
				>
					{running ? (
						<PauseIcon className="size-4" />
					) : (
						<PlayIcon className="size-4" />
					)}
				</button>
			)}
			<button
				type="button"
				onClick={() => setMinimized(false)}
				aria-label="Open focus"
				className="flex min-w-0 items-center gap-2 rounded-full py-1.5 pr-3 pl-2 text-left hover:bg-[var(--hover)] focus-visible:outline-2 focus-visible:outline-accent"
			>
				<span
					className={`shrink-0 font-semibold tabular-nums ${done ? "text-accent" : ""}`}
				>
					{clockText(session, now)}
				</span>
				<span className="min-w-0 truncate text-sm text-[var(--fg-muted)]">
					{done ? "Time's up" : title}
				</span>
			</button>
		</section>
	);
}

/** A round button beside the main one. */
const SECONDARY =
	"flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ring-[var(--border)] hover:bg-[var(--hover)] focus-visible:outline-2 focus-visible:outline-accent";
const PRIMARY =
	"flex min-h-11 items-center gap-2 rounded-full bg-accent px-6 text-base font-semibold text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function FocusScreen({ todo }: { todo: Todo }) {
	const focus = useFocus();
	const { session, now } = focus;
	const { toggleComplete } = useEditing();
	const toast = useToast();
	const items = useChecklist(todo.id);
	const addItem = useAddChecklistItem(todo.id, items);
	const [focusItemId, setFocusItemId] = useState<string | null>(null);
	const [permission, enableNotifications] = useNotificationState();
	if (!session) return null;

	const running = session.runningSince !== null;
	const fresh = isFresh(session);
	const done = isFinished(session);
	const progress = Math.min(1, elapsedMs(session, now) / session.length);
	const minutes = Math.round(session.length / 60_000);
	const unreadable = todo.title === UNREADABLE || todo.notes === UNREADABLE;
	const title = todo.title === UNREADABLE ? "🔒" : todo.title || "New Task";
	const open = todo.status === "open";

	const complete = () => {
		const total = focus.end();
		if (open) toggleComplete(todo.id, todo.status);
		toast.show(
			open
				? `Completed after ${formatDuration(total)} of focus`
				: `Focused for ${formatDuration(total)}`,
		);
	};
	const endFocus = () => {
		const total = focus.end();
		toast.show(
			total > 0 ? `Focused for ${formatDuration(total)}` : "Focus ended",
		);
	};

	return (
		<Dialog.Root
			open
			// Escape or the system back gesture shrinks it to the pill; End focus ends it.
			onOpenChange={(o) => !o && focus.setMinimized(true)}
		>
			<Dialog.Portal>
				<Dialog.Content
					aria-describedby={undefined}
					onKeyDown={(e) => {
						const target = e.target as HTMLElement;
						const typing = target.closest(
							"input, textarea, [contenteditable=true], [data-popover-content]",
						);
						if (
							e.key === " " &&
							!typing &&
							target.tagName !== "BUTTON" &&
							!done
						) {
							e.preventDefault();
							focus.toggleRunning();
						}
					}}
					className="fixed inset-0 z-50 flex animate-fade-in flex-col overflow-y-auto bg-[var(--bg)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-[var(--fg)] outline-none"
				>
					<div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-[var(--bg)]/90 px-3 py-2 backdrop-blur">
						<button
							type="button"
							onClick={() => focus.setMinimized(true)}
							className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-2.5"
						>
							<MinimizeIcon className="size-4" />
							Minimize
						</button>
						<button
							type="button"
							onClick={endFocus}
							className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-2.5"
						>
							<CrossIcon className="size-3.5" />
							End focus
						</button>
					</div>

					<div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-4 pb-10 md:px-8">
						<section
							aria-label="Timer"
							className="flex flex-col items-center pt-6 pb-8 text-center sm:pt-12"
						>
							<p className="flex items-center gap-1.5 text-sm font-medium text-accent">
								<FocusIcon className="size-4" />
								{done ? "Time's up" : "Focus"}
							</p>
							<Dialog.Title className="long-title mt-3 max-w-full text-xl font-semibold break-words [overflow-wrap:anywhere] sm:text-2xl">
								{title}
							</Dialog.Title>
							<p
								role="timer"
								aria-label="Time left"
								className="mt-6 text-[4.5rem] leading-none font-bold tabular-nums tracking-tight sm:text-[6rem]"
							>
								{clockText(session, now)}
							</p>
							<div
								aria-hidden
								className="mt-5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--hover)]"
							>
								<div
									className="h-full rounded-full bg-accent"
									style={{ width: `${progress * 100}%` }}
								/>
							</div>

							{fresh && (
								<LengthPicker minutes={minutes} onChange={focus.setLength} />
							)}

							<p
								role="status"
								className="mt-4 min-h-5 text-sm text-[var(--fg-muted)]"
							>
								{done
									? `Time's up. You focused for ${formatDuration(focusedMs(session, now))}.`
									: ""}
							</p>

							<div className="mt-3 flex flex-wrap items-center justify-center gap-3">
								{done ? (
									<>
										{open && (
											<button
												type="button"
												onClick={complete}
												className={PRIMARY}
											>
												Complete task
											</button>
										)}
										<button
											type="button"
											onClick={focus.addTime}
											className={SECONDARY}
										>
											+5 min
										</button>
										<button
											type="button"
											onClick={focus.startAgain}
											className={SECONDARY}
										>
											<RestoreIcon className="size-4" />
											Start again
										</button>
										<button
											type="button"
											onClick={endFocus}
											className={SECONDARY}
										>
											End focus
										</button>
									</>
								) : (
									<>
										<button
											type="button"
											onClick={focus.toggleRunning}
											className={PRIMARY}
										>
											{running ? (
												<PauseIcon className="size-4" />
											) : (
												<PlayIcon className="size-4" />
											)}
											{running ? "Pause" : fresh ? "Start focus" : "Resume"}
										</button>
										{!fresh && (
											<button
												type="button"
												onClick={focus.addTime}
												className={SECONDARY}
											>
												+5 min
											</button>
										)}
									</>
								)}
							</div>
							{permission === "default" &&
								notificationState() !== "unsupported" && (
									<button
										type="button"
										onClick={() => void enableNotifications()}
										className="mt-4 text-sm text-accent hover:underline"
									>
										Notify me when time's up, even if the app is closed
									</button>
								)}
						</section>

						<FocusChecklist
							items={items}
							readOnly={unreadable || todo.deletedAt !== null}
							focusItemId={focusItemId}
							setFocusItemId={setFocusItemId}
							add={async (after) => setFocusItemId(await addItem(after))}
						/>

						{todo.notes.trim() !== "" && (
							<section aria-label="Notes" className="mt-6">
								<h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--fg-muted)]">
									<NotesIcon className="size-4" />
									Notes
									<Link
										to="/notes/$todoId"
										params={{ todoId: todo.id }}
										onClick={() => focus.setMinimized(true)}
										className="ml-auto font-normal text-accent hover:underline"
									>
										Edit in Task Notes
									</Link>
								</h2>
								<div className="rounded-lg bg-[var(--hover)]/50 px-3 py-2">
									<NotesEditor
										value={todo.notes}
										onChange={() => {}}
										editable={false}
										label="Notes"
									/>
								</div>
							</section>
						)}

						{!done && open && (
							<div className="mt-auto flex justify-center pt-10">
								<button type="button" onClick={complete} className={SECONDARY}>
									Complete task and end focus
								</button>
							</div>
						)}
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

/** Before starting: a preset length, or any number of minutes. */
function LengthPicker({
	minutes,
	onChange,
}: {
	minutes: number;
	onChange: (minutes: number) => void;
}) {
	const [custom, setCustom] = useState(String(minutes));
	useEffect(() => setCustom(String(minutes)), [minutes]);
	return (
		<fieldset className="mt-6 flex flex-wrap items-center justify-center gap-2">
			<legend className="sr-only">Focus length</legend>
			{PRESETS.map((m) => (
				<button
					key={m}
					type="button"
					aria-pressed={minutes === m}
					onClick={() => onChange(m)}
					className={`min-h-9 rounded-full px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11 ${
						minutes === m
							? "bg-accent text-on-accent"
							: "ring-1 ring-[var(--border)] hover:bg-[var(--hover)]"
					}`}
				>
					{m} min
				</button>
			))}
			<label className="flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm ring-1 ring-[var(--border)] focus-within:ring-accent pointer-coarse:min-h-11">
				<input
					type="number"
					inputMode="numeric"
					min={MIN_MINUTES}
					max={MAX_MINUTES}
					value={custom}
					aria-label="Minutes"
					onChange={(e) => {
						setCustom(e.target.value);
						const n = Number(e.target.value);
						if (
							e.target.value !== "" &&
							Number.isInteger(n) &&
							n >= MIN_MINUTES &&
							n <= MAX_MINUTES
						)
							onChange(n);
					}}
					onBlur={() => setCustom(String(minutes))}
					className="w-12 bg-transparent text-right tabular-nums outline-none"
				/>
				min
			</label>
		</fieldset>
	);
}

function FocusChecklist({
	items,
	readOnly,
	focusItemId,
	setFocusItemId,
	add,
}: {
	items: ReturnType<typeof useChecklist>;
	readOnly: boolean;
	focusItemId: string | null;
	setFocusItemId: (id: string | null) => void;
	add: (after?: NonNullable<ReturnType<typeof useChecklist>>[number]) => void;
}) {
	if (!items || items.length === 0) return null;
	const done = items.filter((i) => i.done).length;
	return (
		<section aria-labelledby="focus-checklist">
			<h2
				id="focus-checklist"
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
				focusId={focusItemId}
				onFocusId={setFocusItemId}
				onAdd={(after) => add(after)}
				readOnly={readOnly}
				className="pl-5"
			/>
			{!readOnly && (
				<button
					type="button"
					onClick={() => add()}
					className="mt-1 ml-3.5 rounded-md px-1.5 py-1 text-sm text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-2.5"
				>
					+ Add item
				</button>
			)}
		</section>
	);
}
