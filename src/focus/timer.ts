// Focus Mode's timer (SPEC §10.13), as plain data so it survives reloads and
// is easy to test. Times are epoch ms; nothing here touches the DOM.
//
// Always a countdown to a set length: pick it before starting (a preset or
// any number of minutes), add time while it runs, and when it reaches zero
// it stops and waits for you to choose what's next.

/** Preset lengths, in minutes. */
export const PRESETS = [15, 25, 45, 60, 90] as const;
export const DEFAULT_MINUTES = 25;
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 240;
/** "+5 min". */
export const EXTEND_MS = 5 * 60_000;

export type FocusSession = {
	todoId: string;
	/** The countdown's length (grows with +5 min). */
	length: number;
	/** When the current run started, or null while paused, not started or finished. */
	runningSince: number | null;
	/** Time already counted before `runningSince`. */
	elapsed: number;
	/** Focus time from earlier countdowns this session ("Start again"). */
	banked: number;
	/** Shown as a small pill instead of full screen. */
	minimized: boolean;
};

/** A session ready to start, with the countdown set to `minutes`. */
export function newSession(todoId: string, minutes: number): FocusSession {
	return {
		todoId,
		length: clampMinutes(minutes) * 60_000,
		runningSince: null,
		elapsed: 0,
		banked: 0,
		minimized: false,
	};
}

export function clampMinutes(minutes: number): number {
	if (!Number.isFinite(minutes)) return DEFAULT_MINUTES;
	return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes)));
}

export const isRunning = (s: FocusSession) => s.runningSince !== null;

/** Time counted so far, never more than the length. */
export function elapsedMs(s: FocusSession, now: number): number {
	const total =
		s.elapsed + (s.runningSince === null ? 0 : now - s.runningSince);
	return Math.min(s.length, Math.max(0, total));
}

export function remainingMs(s: FocusSession, now: number): number {
	return s.length - elapsedMs(s, now);
}

/** Not started yet: the length can still be changed. */
export const isFresh = (s: FocusSession) => !isRunning(s) && s.elapsed === 0;

/** Reached zero. */
export const isFinished = (s: FocusSession) =>
	!isRunning(s) && s.elapsed >= s.length;

/** When the running countdown reaches zero, for the push alert; null if it isn't running. */
export function endsAt(s: FocusSession): number | null {
	return s.runningSince === null ? null : s.runningSince + s.length - s.elapsed;
}

/** True once a running countdown has reached zero (time to call `finish`). */
export function isOver(s: FocusSession, now: number): boolean {
	return isRunning(s) && remainingMs(s, now) <= 0;
}

export function setMinutes(s: FocusSession, minutes: number): FocusSession {
	return isFresh(s) ? { ...s, length: clampMinutes(minutes) * 60_000 } : s;
}

export function start(s: FocusSession, now: number): FocusSession {
	if (isRunning(s) || isFinished(s)) return s;
	return { ...s, runningSince: now };
}

export function pause(s: FocusSession, now: number): FocusSession {
	if (!isRunning(s)) return s;
	return { ...s, elapsed: elapsedMs(s, now), runningSince: null };
}

/** Stops at zero. */
export function finish(s: FocusSession): FocusSession {
	return { ...s, elapsed: s.length, runningSince: null };
}

/** Adds time; a finished countdown starts running again. */
export function extend(
	s: FocusSession,
	now: number,
	by = EXTEND_MS,
): FocusSession {
	const next = { ...s, length: s.length + by };
	return isFinished(s) ? { ...next, runningSince: now } : next;
}

/** The same length again, from the top, running. */
export function restart(s: FocusSession, now: number): FocusSession {
	return {
		...s,
		banked: s.banked + elapsedMs(s, now),
		elapsed: 0,
		runningSince: now,
	};
}

/** All the focus time in this session. */
export function focusedMs(s: FocusSession, now: number): number {
	return s.banked + elapsedMs(s, now);
}

/** "24:13", or "1:02:05" past an hour. Rounds up, so 0:00 means done. */
export function formatClock(ms: number): string {
	const total = Math.max(0, Math.ceil(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "1 h 5 min", "25 min", "under a minute". */
export function formatDuration(ms: number): string {
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return "under a minute";
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m} min`;
	return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** The last length chosen on this device, from storage. */
export function readMinutes(raw: unknown): number {
	return typeof raw === "number" ? clampMinutes(raw) : DEFAULT_MINUTES;
}

/** A stored session, or null if it's missing or malformed (or from before 2.8.0). */
export function readSession(raw: unknown): FocusSession | null {
	if (!raw || typeof raw !== "object") return null;
	const s = raw as Partial<FocusSession>;
	const num = (n: unknown): n is number =>
		typeof n === "number" && Number.isFinite(n);
	if (
		typeof s.todoId !== "string" ||
		!num(s.length) ||
		s.length <= 0 ||
		!(s.runningSince === null || num(s.runningSince)) ||
		!num(s.elapsed)
	)
		return null;
	return {
		...(s as FocusSession),
		banked: num(s.banked) ? s.banked : 0,
		minimized: s.minimized === true,
	};
}
