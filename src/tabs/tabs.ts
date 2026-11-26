// App tabs on desktop (SPEC §10.14), as plain data: each tab is a page of the
// app (a path), one is active, and the list is kept on this device.

export type Tab = { id: string; path: string };
export type TabsState = { tabs: Tab[]; activeId: string };

/** At most this many tabs; New tab does nothing beyond it. */
export const MAX_TABS = 12;
export const NEW_TAB_PATH = "/today";

let counter = 0;
export function tabId(): string {
	counter += 1;
	return `${Date.now().toString(36)}-${counter}`;
}

export function initialTabs(path: string): TabsState {
	const id = tabId();
	return { tabs: [{ id, path }], activeId: id };
}

export function activeTab(state: TabsState): Tab {
	return (
		state.tabs.find((t) => t.id === state.activeId) ?? (state.tabs[0] as Tab)
	);
}

/** The active tab now shows `path` (the user navigated within it). */
export function navigateActive(state: TabsState, path: string): TabsState {
	const active = activeTab(state);
	if (active.path === path) return state;
	return {
		...state,
		tabs: state.tabs.map((t) => (t.id === active.id ? { ...t, path } : t)),
	};
}

/** Opens `path` in a new tab right after the active one and switches to it. */
export function openTab(state: TabsState, path: string): TabsState {
	if (state.tabs.length >= MAX_TABS) return state;
	const tab = { id: tabId(), path };
	const at = state.tabs.findIndex((t) => t.id === state.activeId) + 1;
	const tabs = [...state.tabs];
	tabs.splice(at > 0 ? at : tabs.length, 0, tab);
	return { tabs, activeId: tab.id };
}

/** Closes a tab; closing the active one switches to its neighbour. The last tab stays. */
export function closeTab(state: TabsState, id: string): TabsState {
	if (state.tabs.length <= 1) return state;
	const index = state.tabs.findIndex((t) => t.id === id);
	if (index < 0) return state;
	const tabs = state.tabs.filter((t) => t.id !== id);
	if (id !== state.activeId) return { ...state, tabs };
	const next = tabs[Math.min(index, tabs.length - 1)] as Tab;
	return { tabs, activeId: next.id };
}

export function activate(state: TabsState, id: string): TabsState {
	return state.tabs.some((t) => t.id === id)
		? { ...state, activeId: id }
		: state;
}

/** The tab `by` places to the left (-1) or right (+1) of the active one, wrapping around. */
export function stepTab(state: TabsState, by: -1 | 1): TabsState {
	const n = state.tabs.length;
	const index = state.tabs.findIndex((t) => t.id === state.activeId);
	const next = state.tabs[(index + by + n) % n] as Tab;
	return { ...state, activeId: next.id };
}

/** A same-app path ("/today", "/project/…?tags=…"), or null for anything else. */
export function appPath(path: unknown): string | null {
	if (
		typeof path !== "string" ||
		!path.startsWith("/") ||
		path.startsWith("//")
	)
		return null;
	if (path.startsWith("/api/")) return null;
	return path;
}

/** Stored tabs, or null if missing or malformed. */
export function readTabs(raw: unknown): TabsState | null {
	if (!raw || typeof raw !== "object") return null;
	const value = raw as Partial<TabsState>;
	if (!Array.isArray(value.tabs) || typeof value.activeId !== "string")
		return null;
	const tabs = value.tabs
		.filter(
			(t): t is Tab =>
				!!t &&
				typeof t === "object" &&
				typeof (t as Tab).id === "string" &&
				appPath((t as Tab).path) !== null,
		)
		.slice(0, MAX_TABS);
	if (tabs.length === 0) return null;
	const activeId = tabs.some((t) => t.id === value.activeId)
		? value.activeId
		: (tabs[0] as Tab).id;
	return { tabs, activeId };
}
