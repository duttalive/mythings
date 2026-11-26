// Focus Mode's timer (SPEC §10.13), as plain data so it survives reloads and
// is easy to test. Times are epoch ms; nothing here touches the DOM.
//
// Normal mode counts up until you stop. Pomodoro alternates focus rounds and
// breaks (a long break after every few rounds); when one ends, the next is
// ready but waits for you to start it.

export type FocusMode = "normal" | "pomodoro";
export type FocusPhase = "focus" | "short" | "long";

export type FocusSettings = {
	/** Minutes. */
	focus: number;
	short: number;
	long: number;
	/** A long break after this many focus rounds. */
	longEvery: number;
};

export const DEFAULT_SETTINGS: FocusSettings = {
	focus: 25,
	short: 5,
	long: 15,
	longEvery: 4,
};

/** Allowed ranges for each setting (minutes, or rounds). */
export const SETTING_LIMITS: Record<keyof FocusSettings, [number, number]> = {
	focus: [1, 120],
	short: [1, 60],
	long: [1, 90],
	longEvery: [2, 10],
};

export type FocusSession = {
	todoId: string;
	mode: FocusMode;
	phase: FocusPhase;
	/** When the current run started, or null while paused or waiting. */
	runningSince: number | null;
	/** Time already spent in this phase before `runningSince`. */
	elapsed: number;
	/** Focus rounds finished (Pomodoro). */
	rounds: number;
	/** Total focus time this session, finished phases only (both modes). */
	focused: number;
	/** Shown as a small pill instead of full screen. */
	minimized: boolean;
};

export function startSession(
	todoId: string,
	mode: FocusMode,
	now: number,
): FocusSession {
	return {
		todoId,
		mode,
		phase: "focus",
		runningSince: now,
		elapsed: 0,
		rounds: 0,
		focused: 0,
		minimized: false,
	};
}

export const isRunning = (s: FocusSession) => s.runningSince !== null;

/** Time spent in the current phase. */
export function elapsedMs(s: FocusSession, now: number): number {
	return s.elapsed + (s.runningSince === null ? 0 : now - s.runningSince);
}

/** Length of the current phase, or null in Normal mode (it counts up). */
export function phaseMs(
	s: FocusSession,
	settings: FocusSettings,
): number | null {
	if (s.mode === "normal") return null;
	return settings[s.phase] * 60_000;
}

/** Time left in the phase (Pomodoro), never below zero. */
export function remainingMs(
	s: FocusSession,
	settings: FocusSettings,
	now: number,
): number | null {
	const length = phaseMs(s, settings);
	return length === null ? null : Math.max(0, length - elapsedMs(s, now));
}

/** When the running phase ends, for the push alert; null if it isn't running or never ends. */
export function endsAt(
	s: FocusSession,
	settings: FocusSettings,
	now: number,
): number | null {
	const left = remainingMs(s, settings, now);
	return left === null || !isRunning(s) ? null : now + left;
}

export function pause(s: FocusSession, now: number): FocusSession {
	if (!isRunning(s)) return s;
	return { ...s, elapsed: elapsedMs(s, now), runningSince: null };
}

export function resume(s: FocusSession, now: number): FocusSession {
	return isRunning(s) ? s : { ...s, runningSince: now };
}

/** Total focus time, the current focus phase included. */
export function focusedMs(s: FocusSession, now: number): number {
	return s.focused + (s.phase === "focus" ? elapsedMs(s, now) : 0);
}

/**
 * Ends the current Pomodoro phase (time ran out, or Skip) and gets the next
 * one ready, waiting to be started.
 */
export function nextPhase(
	s: FocusSession,
	settings: FocusSettings,
	now: number,
): FocusSession {
	if (s.mode === "normal") return s;
	if (s.phase === "focus") {
		const length = phaseMs(s, settings) ?? 0;
		const rounds = s.rounds + 1;
		return {
			...s,
			phase: rounds % settings.longEvery === 0 ? "long" : "short",
			rounds,
			focused: s.focused + Math.min(elapsedMs(s, now), length),
			elapsed: 0,
			runningSince: null,
		};
	}
	return { ...s, phase: "focus", elapsed: 0, runningSince: null };
}

/** True once a running Pomodoro phase has run its full length. */
export function isPhaseOver(
	s: FocusSession,
	settings: FocusSettings,
	now: number,
): boolean {
	return isRunning(s) && remainingMs(s, settings, now) === 0;
}

/** "24:13", or "1:02:05" past an hour. Rounds up for countdowns, so 0:00 means done. */
export function formatClock(ms: number, roundUp = false): string {
	const total = roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
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

export const PHASE_LABEL: Record<FocusPhase, string> = {
	focus: "Focus",
	short: "Short break",
	long: "Long break",
};

/** Settings from storage, with anything missing or out of range set to its default. */
export function readSettings(raw: unknown): FocusSettings {
	const value = (raw && typeof raw === "object" ? raw : {}) as Record<
		string,
		unknown
	>;
	const out = { ...DEFAULT_SETTINGS };
	for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof FocusSettings)[]) {
		const n = value[key];
		const [min, max] = SETTING_LIMITS[key];
		if (typeof n === "number" && Number.isInteger(n) && n >= min && n <= max)
			out[key] = n;
	}
	return out;
}

/** A stored session, or null if it's missing or malformed. */
export function readSession(raw: unknown): FocusSession | null {
	if (!raw || typeof raw !== "object") return null;
	const s = raw as Partial<FocusSession>;
	const num = (n: unknown) => typeof n === "number" && Number.isFinite(n);
	if (
		typeof s.todoId !== "string" ||
		(s.mode !== "normal" && s.mode !== "pomodoro") ||
		(s.phase !== "focus" && s.phase !== "short" && s.phase !== "long") ||
		!(s.runningSince === null || num(s.runningSince)) ||
		!num(s.elapsed) ||
		!num(s.rounds) ||
		!num(s.focused)
	)
		return null;
	return { ...(s as FocusSession), minimized: s.minimized === true };
}
