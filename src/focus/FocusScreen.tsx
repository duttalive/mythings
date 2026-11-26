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
	GearIcon,
	MinimizeIcon,
	NotesIcon,
	PauseIcon,
	PlayIcon,
	SkipIcon,
} from "../components/icons";
import { Popover } from "../components/Popover";
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
	type FocusSettings,
	formatClock,
	formatDuration,
	PHASE_LABEL,
	phaseMs,
	remainingMs,
	SETTING_LIMITS,
} from "./timer";

/** The clock text: counting up in Normal mode, down in Pomodoro. */
function clockText(s: FocusSession, settings: FocusSettings, now: number) {
	const left = remainingMs(s, settings, now);
	return left === null
		? formatClock(elapsedMs(s, now))
		: formatClock(left, true);
}

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

	// "12:34 · Today · mythings" in the tab while focusing.
	const clock =
		session && !gone ? clockText(session, focus.settings, focus.now) : null;
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
	const { session, settings, now, notice, toggleRunning, setMinimized } =
		useFocus();
	if (!session) return null;
	const running = session.runningSince !== null;
	const title = todo.title === UNREADABLE ? "🔒" : todo.title || "New To-Do";
	return (
		<section
			aria-label="Focus"
			className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-4 z-30 flex max-w-[calc(100vw-7rem)] animate-pop-in items-center gap-1 rounded-full bg-[var(--card)] py-1 pr-1 pl-1 shadow-[var(--card-shadow)] ring-1 ring-[var(--border)] md:left-1/2 md:max-w-sm md:-translate-x-1/2"
		>
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
			<button
				type="button"
				onClick={() => setMinimized(false)}
				aria-label="Open focus"
				className="flex min-w-0 items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-left hover:bg-[var(--hover)] focus-visible:outline-2 focus-visible:outline-accent"
			>
				<span
					className="shrink-0 font-semibold tabular-nums"
					data-testid="focus-pill-clock"
				>
					{clockText(session, settings, now)}
				</span>
				<span className="min-w-0 truncate text-sm text-[var(--fg-muted)]">
					{notice === "focus"
						? "Time for a break"
						: notice === "break"
							? "Break's over"
							: session.mode === "pomodoro" && session.phase !== "focus"
								? PHASE_LABEL[session.phase]
								: title}
				</span>
			</button>
		</section>
	);
}

function FocusScreen({ todo }: { todo: Todo }) {
	const focus = useFocus();
	const { session, settings, now, notice } = focus;
	const { toggleComplete } = useEditing();
	const toast = useToast();
	const items = useChecklist(todo.id);
	const addItem = useAddChecklistItem(todo.id, items);
	const [focusItemId, setFocusItemId] = useState<string | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [permission, enableNotifications] = useNotificationState();
	if (!session) return null;

	const pomodoro = session.mode === "pomodoro";
	const running = session.runningSince !== null;
	const elapsed = elapsedMs(session, now);
	const length = phaseMs(session, settings);
	const progress = length ? Math.min(1, elapsed / length) : 0;
	const unreadable = todo.title === UNREADABLE || todo.notes === UNREADABLE;
	const title = todo.title === UNREADABLE ? "🔒" : todo.title || "New To-Do";
	const open = todo.status === "open";

	const primaryLabel = running
		? "Pause"
		: elapsed > 0
			? "Resume"
			: session.phase === "focus"
				? "Start focus"
				: `Start ${PHASE_LABEL[session.phase].toLowerCase()}`;

	const finish = () => {
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
		toast.show(`Focused for ${formatDuration(total)}`);
	};

	const phaseLine = pomodoro
		? session.phase === "focus"
			? `Focus · round ${session.rounds + 1}`
			: PHASE_LABEL[session.phase]
		: "Focus";
	const noticeLine =
		notice === "focus"
			? `Focus round done. Time for a ${settings[session.phase === "long" ? "long" : "short"]}-minute break.`
			: notice === "break"
				? "Break's over. Ready for the next round?"
				: null;

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
						if (e.key === " " && !typing && target.tagName !== "BUTTON") {
							e.preventDefault();
							focus.toggleRunning();
						}
					}}
					className="fixed inset-0 z-50 flex animate-fade-in flex-col overflow-y-auto bg-[var(--bg)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-[var(--fg)] outline-none"
				>
					<div className="sticky top-0 z-10 flex items-center gap-2 bg-[var(--bg)]/90 px-3 py-2 backdrop-blur">
						<button
							type="button"
							onClick={() => focus.setMinimized(true)}
							className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-2.5"
						>
							<MinimizeIcon className="size-4" />
							Minimize
						</button>
						<fieldset className="mx-auto flex rounded-lg bg-[var(--hover)] p-0.5 text-sm">
							<legend className="sr-only">Focus mode</legend>
							{(["normal", "pomodoro"] as const).map((mode) => (
								<button
									key={mode}
									type="button"
									aria-pressed={session.mode === mode}
									onClick={() => session.mode !== mode && focus.setMode(mode)}
									className={`rounded-md px-3 py-1 font-medium focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-2 ${
										session.mode === mode
											? "bg-[var(--card)] text-[var(--fg)] shadow-sm"
											: "text-[var(--fg-muted)] hover:text-[var(--fg)]"
									}`}
								>
									{mode === "normal" ? "Normal" : "Pomodoro"}
								</button>
							))}
						</fieldset>
						<button
							type="button"
							onClick={endFocus}
							className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-2.5"
						>
							<CrossIcon className="size-3.5" />
							<span>
								End<span className="max-sm:hidden"> focus</span>
							</span>
						</button>
					</div>

					<div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-4 pb-10 md:px-8">
						<section
							aria-label="Timer"
							className="flex flex-col items-center pt-6 pb-8 text-center sm:pt-12"
						>
							<p className="flex items-center gap-1.5 text-sm font-medium text-accent">
								<FocusIcon className="size-4" />
								{phaseLine}
							</p>
							<Dialog.Title className="long-title mt-3 max-w-full text-xl font-semibold break-words [overflow-wrap:anywhere] sm:text-2xl">
								{title}
							</Dialog.Title>
							<p
								role="timer"
								aria-label={pomodoro ? "Time left" : "Time focused"}
								className="mt-6 text-[4.5rem] leading-none font-bold tabular-nums tracking-tight sm:text-[6rem]"
							>
								{clockText(session, settings, now)}
							</p>
							{pomodoro && (
								<div
									aria-hidden
									className="mt-5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--hover)]"
								>
									<div
										className={`h-full rounded-full ${session.phase === "focus" ? "bg-accent" : "bg-today"}`}
										style={{ width: `${progress * 100}%` }}
									/>
								</div>
							)}
							<p
								role="status"
								className="mt-4 min-h-5 text-sm text-[var(--fg-muted)]"
							>
								{noticeLine ??
									(pomodoro && session.rounds > 0
										? `${session.rounds} ${session.rounds === 1 ? "round" : "rounds"} done`
										: "")}
							</p>
							<div className="mt-4 flex items-center gap-3">
								<button
									type="button"
									onClick={focus.toggleRunning}
									className="flex min-h-11 items-center gap-2 rounded-full bg-accent px-6 text-base font-semibold text-on-accent hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
								>
									{running ? (
										<PauseIcon className="size-4" />
									) : (
										<PlayIcon className="size-4" />
									)}
									{primaryLabel}
								</button>
								{pomodoro && (
									<button
										type="button"
										onClick={focus.skip}
										aria-label={
											session.phase === "focus" ? "Skip to break" : "Skip break"
										}
										title={
											session.phase === "focus" ? "Skip to break" : "Skip break"
										}
										className="flex size-11 items-center justify-center rounded-full text-[var(--fg-muted)] ring-1 ring-[var(--border)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent"
									>
										<SkipIcon className="size-4" />
									</button>
								)}
								{pomodoro && (
									<Popover
										label="Pomodoro settings"
										open={settingsOpen}
										onOpenChange={setSettingsOpen}
										width="w-72"
										trigger={
											<button
												type="button"
												aria-label="Pomodoro settings"
												title="Pomodoro settings"
												className="flex size-11 items-center justify-center rounded-full text-[var(--fg-muted)] ring-1 ring-[var(--border)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent"
											>
												<GearIcon className="size-4" />
											</button>
										}
									>
										<PomodoroSettings
											settings={settings}
											onChange={focus.updateSettings}
										/>
									</Popover>
								)}
							</div>
							{pomodoro &&
								permission === "default" &&
								notificationState() !== "unsupported" && (
									<button
										type="button"
										onClick={() => void enableNotifications()}
										className="mt-4 text-sm text-accent hover:underline"
									>
										Notify me when a round ends, even if the app is closed
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

						<div className="mt-auto flex justify-center pt-10">
							<button
								type="button"
								onClick={finish}
								className="flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium ring-1 ring-[var(--border)] hover:bg-[var(--hover)] focus-visible:outline-2 focus-visible:outline-accent"
							>
								{open ? "Complete to-do and end focus" : "End focus"}
							</button>
						</div>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
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

function PomodoroSettings({
	settings,
	onChange,
}: {
	settings: FocusSettings;
	onChange: (settings: FocusSettings) => void;
}) {
	const fields: [keyof FocusSettings, string, string][] = [
		["focus", "Focus", "min"],
		["short", "Short break", "min"],
		["long", "Long break", "min"],
		["longEvery", "Long break after", "rounds"],
	];
	return (
		<div className="flex flex-col gap-2 p-1">
			{fields.map(([key, label, unit]) => {
				const [min, max] = SETTING_LIMITS[key];
				return (
					<label key={key} className="flex items-center gap-2">
						<span className="flex-1">{label}</span>
						<input
							type="number"
							inputMode="numeric"
							min={min}
							max={max}
							value={settings[key]}
							onChange={(e) => {
								const n = Math.round(Number(e.target.value));
								if (Number.isFinite(n) && n >= min && n <= max)
									onChange({ ...settings, [key]: n });
							}}
							className="w-16 rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-right tabular-nums focus:border-accent focus:outline-none"
						/>
						<span className="w-12 text-[var(--fg-muted)]">{unit}</span>
					</label>
				);
			})}
			<p className="pt-1 text-xs text-[var(--fg-muted)]">
				Saved on this device.
			</p>
		</div>
	);
}
