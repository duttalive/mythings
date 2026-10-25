// The last signed-in profile, so the app can start offline (SPEC §11). Only
// the profile (id, email, time zone, settings) — the session itself stays in
// its HttpOnly cookie.

import type { Me } from "../../shared/schema";

const KEY = "mythings:user";

export function loadCachedUser(): Me | null {
	try {
		const value = localStorage.getItem(KEY);
		return value ? (JSON.parse(value) as Me) : null;
	} catch {
		return null;
	}
}

export function saveCachedUser(user: Me): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(user));
	} catch {
		// Private mode or storage disabled: we just can't start offline.
	}
}

export function clearCachedUser(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {}
}
