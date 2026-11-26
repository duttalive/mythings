import { describe, expect, it } from "vitest";
import {
	DEFAULT_SETTINGS,
	elapsedMs,
	endsAt,
	type FocusSession,
	focusedMs,
	formatClock,
	formatDuration,
	isPhaseOver,
	nextPhase,
	pause,
	readSession,
	readSettings,
	remainingMs,
	resume,
	startSession,
} from "../../src/focus/timer";

const MIN = 60_000;
const settings = DEFAULT_SETTINGS;

describe("focus timer", () => {
	it("counts up in Normal mode, across pauses", () => {
		let s = startSession("t1", "normal", 0);
		expect(elapsedMs(s, 10 * MIN)).toBe(10 * MIN);
		expect(remainingMs(s, settings, 10 * MIN)).toBeNull();
		s = pause(s, 10 * MIN);
		expect(elapsedMs(s, 50 * MIN)).toBe(10 * MIN);
		s = resume(s, 50 * MIN);
		expect(elapsedMs(s, 55 * MIN)).toBe(15 * MIN);
		expect(focusedMs(s, 55 * MIN)).toBe(15 * MIN);
		expect(isPhaseOver(s, settings, 999 * MIN)).toBe(false);
		expect(nextPhase(s, settings, 60 * MIN)).toBe(s);
	});

	it("counts down a Pomodoro round, then waits with a break ready", () => {
		let s = startSession("t1", "pomodoro", 0);
		expect(remainingMs(s, settings, 5 * MIN)).toBe(20 * MIN);
		expect(endsAt(s, settings, 5 * MIN)).toBe(25 * MIN);
		expect(isPhaseOver(s, settings, 25 * MIN)).toBe(true);
		s = nextPhase(s, settings, 26 * MIN);
		expect(s).toMatchObject({
			phase: "short",
			rounds: 1,
			runningSince: null,
			elapsed: 0,
		});
		// Overtime isn't counted as focus.
		expect(s.focused).toBe(25 * MIN);
		expect(endsAt(s, settings, 30 * MIN)).toBeNull();
		s = resume(s, 30 * MIN);
		expect(endsAt(s, settings, 30 * MIN)).toBe(35 * MIN);
		// Break time isn't focus time.
		expect(focusedMs(s, 33 * MIN)).toBe(25 * MIN);
		s = nextPhase(s, settings, 35 * MIN);
		expect(s.phase).toBe("focus");
	});

	it("gives a long break after every few rounds", () => {
		let s: FocusSession = startSession("t1", "pomodoro", 0);
		const phases: string[] = [];
		for (let i = 0; i < 8; i++) {
			s = nextPhase(s, settings, 0);
			phases.push(s.phase);
		}
		expect(phases).toEqual([
			"short",
			"focus",
			"short",
			"focus",
			"short",
			"focus",
			"long",
			"focus",
		]);
		expect(s.rounds).toBe(4);
	});

	it("pausing keeps the time left", () => {
		let s = startSession("t1", "pomodoro", 0);
		s = pause(s, 10 * MIN);
		expect(remainingMs(s, settings, 100 * MIN)).toBe(15 * MIN);
		expect(isPhaseOver(s, settings, 100 * MIN)).toBe(false);
		expect(endsAt(s, settings, 100 * MIN)).toBeNull();
	});

	it("formats clocks and durations", () => {
		expect(formatClock(0)).toBe("0:00");
		expect(formatClock(65_000)).toBe("1:05");
		expect(formatClock(3_725_000)).toBe("1:02:05");
		expect(formatClock(59_100, true)).toBe("1:00");
		expect(formatDuration(30_000)).toBe("under a minute");
		expect(formatDuration(25 * MIN)).toBe("25 min");
		expect(formatDuration(60 * MIN)).toBe("1 h");
		expect(formatDuration(65 * MIN)).toBe("1 h 5 min");
	});

	it("reads stored settings and sessions defensively", () => {
		expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(
			readSettings({ focus: 50, short: 0, long: "x", longEvery: 3 }),
		).toEqual({ ...DEFAULT_SETTINGS, focus: 50, longEvery: 3 });
		const s = startSession("t1", "pomodoro", 5);
		expect(readSession(JSON.parse(JSON.stringify(s)))).toEqual(s);
		expect(readSession({ ...s, mode: "nap" })).toBeNull();
		expect(readSession({ ...s, elapsed: "1" })).toBeNull();
		expect(readSession("junk")).toBeNull();
	});
});
