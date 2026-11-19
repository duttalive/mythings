// How soon a device with a passcode locks itself (per device, like text size).

export const AUTO_LOCK_OPTIONS = [
	["0", "Right away"],
	["1", "1 min"],
	["5", "5 min"],
	["15", "15 min"],
] as const;
export type AutoLock = (typeof AUTO_LOCK_OPTIONS)[number][0];

const KEY = "mythings:autoLock";

export function loadAutoLock(): AutoLock {
	try {
		const value = localStorage.getItem(KEY);
		if (AUTO_LOCK_OPTIONS.some(([option]) => option === value))
			return value as AutoLock;
	} catch {}
	return "5";
}

export function saveAutoLock(value: AutoLock) {
	try {
		localStorage.setItem(KEY, value);
	} catch {}
}

/**
 * Minutes without a tap, click or key press (or with the app in the
 * background) before it locks. "Right away" locks as soon as the app is left.
 */
export function autoLockMs(): number {
	return Number(loadAutoLock()) * 60_000;
}
