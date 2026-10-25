// Registers the service worker (SPEC §11) and keeps installed apps current:
// a new version is applied as soon as it's downloaded, so nobody ever has to
// clear a cache. It checks for one on start, hourly, and whenever the app comes
// back to the foreground. If a text field has focus, it waits until you leave
// it, so the reload never cuts off typing that hasn't been saved yet.

import { registerSW } from "virtual:pwa-register";
import { useSyncExternalStore } from "react";
import { APP_VERSION, compareVersions } from "../changelog";

const CHECK_EVERY_MS = 60 * 60 * 1000;
const VERSION_KEY = "mythings:version";

let offlineReady = false;
const listeners = new Set<() => void>();
const emit = () => {
	for (const listener of listeners) listener();
};

let registered = false;

const editing = () => {
	const el = document.activeElement;
	return (
		el instanceof HTMLTextAreaElement ||
		(el instanceof HTMLInputElement &&
			!["checkbox", "radio", "button"].includes(el.type)) ||
		(el instanceof HTMLElement && el.isContentEditable)
	);
};

/** Runs `apply` now, or once the user is no longer typing (or the app is hidden). */
function whenIdle(apply: () => void) {
	if (!editing() || document.visibilityState === "hidden") return apply();
	const retry = () => {
		document.removeEventListener("focusout", onFocusOut);
		document.removeEventListener("visibilitychange", retry);
		whenIdle(apply);
	};
	// focusout fires before focus lands elsewhere; check on the next tick.
	const onFocusOut = () => setTimeout(retry, 0);
	document.addEventListener("focusout", onFocusOut);
	document.addEventListener("visibilitychange", retry);
}

export function registerPwa(): void {
	if (
		registered ||
		typeof window === "undefined" ||
		!("serviceWorker" in navigator)
	)
		return;
	registered = true;
	const updateServiceWorker = registerSW({
		immediate: true,
		onNeedRefresh() {
			// Activates the waiting worker and reloads into the new version.
			whenIdle(() => void updateServiceWorker(true));
		},
		onOfflineReady() {
			offlineReady = true;
			emit();
		},
		onRegisteredSW(_url, registration) {
			if (!registration) return;
			const check = () => {
				if (navigator.onLine) void registration.update().catch(() => {});
			};
			setInterval(check, CHECK_EVERY_MS);
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "visible") check();
			});
		},
		onRegisterError(error) {
			console.warn("Service worker registration failed", error);
		},
	});
}

/** The version this device ran last, then remembers the current one. Null on first run. */
function previousVersion(): string | null {
	try {
		const stored = localStorage.getItem(VERSION_KEY);
		localStorage.setItem(VERSION_KEY, APP_VERSION);
		return stored;
	} catch {
		return null;
	}
}

/** Set once at startup: the version we just updated from, if any. */
const updatedFrom = (() => {
	if (typeof window === "undefined") return null;
	const previous = previousVersion();
	return previous !== null && compareVersions(previous, APP_VERSION) < 0
		? previous
		: null;
})();

type PwaState = { offlineReady: boolean; updated: boolean };
let snapshot: PwaState = { offlineReady, updated: updatedFrom !== null };

export function usePwaState(): PwaState & { dismiss: () => void } {
	const state = useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		() => {
			if (snapshot.offlineReady !== offlineReady)
				snapshot = { ...snapshot, offlineReady };
			return snapshot;
		},
	);
	return {
		...state,
		dismiss: () => {
			offlineReady = false;
			snapshot = { offlineReady: false, updated: false };
			emit();
		},
	};
}
