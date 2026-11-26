import { describe, expect, it } from "vitest";
import {
	clampMinutes,
	DEFAULT_MINUTES,
	elapsedMs,
	endsAt,
	extend,
	finish,
	focusedMs,
	formatClock,
	formatDuration,
	isFinished,
	isFresh,
	isOver,
	newSession,
	pause,
	readMinutes,
	readSession,
	remainingMs,
	restart,
	setMinutes,
	start,
} from "../../src/focus/timer";

const MIN = 60_000;

describe("focus timer", () => {
	it("is set before it starts, then counts down to zero", () => {
		let s = newSession("t1", 25);
		expect(isFresh(s)).toBe(true);
		expect(remainingMs(s, 0)).toBe(25 * MIN);
		s = setMinutes(s, 45);
		expect(s.length).toBe(45 * MIN);
		s = start(s, 0);
		expect(isFresh(s)).toBe(false);
		// The length can't change once it's running.
		expect(setMinutes(s, 10)).toBe(s);
		expect(remainingMs(s, 10 * MIN)).toBe(35 * MIN);
		expect(endsAt(s)).toBe(45 * MIN);
		expect(isOver(s, 44 * MIN)).toBe(false);
		expect(isOver(s, 45 * MIN)).toBe(true);
		s = finish(s);
		expect(isFinished(s)).toBe(true);
		expect(remainingMs(s, 99 * MIN)).toBe(0);
		expect(endsAt(s)).toBeNull();
		// Never counts past zero.
		expect(elapsedMs(start(s, 0), 999 * MIN)).toBe(45 * MIN);
	});

	it("pausing keeps the time left", () => {
		let s = start(newSession("t1", 25), 0);
		s = pause(s, 10 * MIN);
		expect(remainingMs(s, 100 * MIN)).toBe(15 * MIN);
		expect(isOver(s, 100 * MIN)).toBe(false);
		expect(endsAt(s)).toBeNull();
		s = start(s, 100 * MIN);
		expect(endsAt(s)).toBe(115 * MIN);
	});

	it("+5 min adds time, and runs again once finished", () => {
		let s = start(newSession("t1", 25), 0);
		s = extend(s, 10 * MIN);
		expect(remainingMs(s, 10 * MIN)).toBe(20 * MIN);
		s = finish(s);
		s = extend(s, 40 * MIN);
		expect(isFinished(s)).toBe(false);
		expect(remainingMs(s, 42 * MIN)).toBe(3 * MIN);
	});

	it("starting again keeps the earlier focus time in the total", () => {
		let s = start(newSession("t1", 25), 0);
		s = finish(s);
		s = restart(s, 30 * MIN);
		expect(remainingMs(s, 30 * MIN)).toBe(25 * MIN);
		expect(focusedMs(s, 40 * MIN)).toBe(35 * MIN);
	});

	it("keeps lengths between 1 and 240 minutes", () => {
		expect(clampMinutes(0)).toBe(1);
		expect(clampMinutes(500)).toBe(240);
		expect(clampMinutes(12.4)).toBe(12);
		expect(clampMinutes(Number.NaN)).toBe(DEFAULT_MINUTES);
		expect(readMinutes(50)).toBe(50);
		expect(readMinutes("x")).toBe(DEFAULT_MINUTES);
	});

	it("formats clocks and durations", () => {
		expect(formatClock(0)).toBe("0:00");
		expect(formatClock(65_000)).toBe("1:05");
		expect(formatClock(59_100)).toBe("1:00");
		expect(formatClock(3_725_000)).toBe("1:02:05");
		expect(formatDuration(30_000)).toBe("under a minute");
		expect(formatDuration(25 * MIN)).toBe("25 min");
		expect(formatDuration(65 * MIN)).toBe("1 h 5 min");
	});

	it("reads stored sessions defensively, dropping ones from before 2.8.0", () => {
		const s = newSession("t1", 25);
		expect(readSession(JSON.parse(JSON.stringify(s)))).toEqual(s);
		expect(
			readSession({
				todoId: "t1",
				mode: "pomodoro",
				phase: "focus",
				runningSince: null,
				elapsed: 0,
			}),
		).toBeNull();
		expect(readSession({ ...s, length: 0 })).toBeNull();
		expect(readSession("junk")).toBeNull();
	});
});
