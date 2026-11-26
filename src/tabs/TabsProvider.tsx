// App tabs on desktop (SPEC §10.14): several pages of the app open at once in
// a tab strip, like a browser's. The URL is always the active tab's page;
// switching tabs navigates. Tabs are remembered on this device. Below 1024px
// there's no strip, and opening "in a new tab" just opens the page.

import { useLocation, useRouter } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { useAuth } from "../auth/AuthGate";
import { comboFromEvent } from "../keyboard/keys";
import {
	activate,
	activeTab,
	appPath,
	closeTab,
	initialTabs,
	NEW_TAB_PATH,
	navigateActive,
	openTab,
	readTabs,
	stepTab,
	type TabsState,
} from "./tabs";

export const TABS_MEDIA = "(min-width: 1024px)";

function useWide(): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const list = window.matchMedia(TABS_MEDIA);
			list.addEventListener("change", onChange);
			return () => list.removeEventListener("change", onChange);
		},
		() => window.matchMedia(TABS_MEDIA).matches,
	);
}

type TabsContextValue = {
	/** Tabs are shown (desktop width). */
	enabled: boolean;
	state: TabsState;
	newTab: (path?: string) => void;
	close: (id: string) => void;
	select: (id: string) => void;
	/** Opens a page in a new tab (or just opens it, without tabs). */
	openInNewTab: (path: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

export function useTabs(): TabsContextValue {
	const value = useContext(TabsContext);
	if (!value) throw new Error("useTabs outside TabsProvider");
	return value;
}

export function TabsProvider({ children }: { children: ReactNode }) {
	const { user } = useAuth();
	const key = `mythings:tabs:${user.id}`;
	const router = useRouter();
	const { pathname, searchStr } = useLocation();
	const here = `${pathname}${searchStr ?? ""}`;
	const enabled = useWide();

	const [state, setStateRaw] = useState<TabsState>(() => {
		let stored: TabsState | null = null;
		try {
			const text = localStorage.getItem(key);
			stored = readTabs(text ? JSON.parse(text) : null);
		} catch {}
		// The page you opened is the active tab's page.
		return stored ? navigateActive(stored, here) : initialTabs(here);
	});
	const stateRef = useRef(state);
	stateRef.current = state;

	const setState = useCallback(
		(next: TabsState) => {
			stateRef.current = next;
			setStateRaw(next);
			try {
				localStorage.setItem(key, JSON.stringify(next));
			} catch {}
		},
		[key],
	);

	// Navigating within a tab updates it.
	useEffect(() => {
		setState(navigateActive(stateRef.current, here));
	}, [here, setState]);

	const go = useCallback(
		(next: TabsState) => {
			setState(next);
			const path = activeTab(next).path;
			if (path !== `${window.location.pathname}${window.location.search}`)
				router.history.push(path);
		},
		[router, setState],
	);

	const value = useMemo<TabsContextValue>(
		() => ({
			enabled,
			state,
			newTab: (path = NEW_TAB_PATH) => go(openTab(stateRef.current, path)),
			close: (id) => go(closeTab(stateRef.current, id)),
			select: (id) => go(activate(stateRef.current, id)),
			openInNewTab: (path) =>
				enabled
					? go(openTab(stateRef.current, path))
					: router.history.push(path),
		}),
		[enabled, state, go, router],
	);

	// Shortcuts: ⌘T where the browser lets the app have it, and ⌥⌘T always;
	// ⌥⌘W closes the tab; ⌥⌘← / ⌥⌘→ switch tabs.
	useEffect(() => {
		if (!enabled) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.isComposing) return;
			switch (comboFromEvent(e)) {
				case "mod+t":
				case "mod+alt+t":
					e.preventDefault();
					go(openTab(stateRef.current, NEW_TAB_PATH));
					return;
				case "mod+alt+w":
					e.preventDefault();
					go(closeTab(stateRef.current, stateRef.current.activeId));
					return;
				case "mod+alt+left":
					e.preventDefault();
					go(stepTab(stateRef.current, -1));
					return;
				case "mod+alt+right":
					e.preventDefault();
					go(stepTab(stateRef.current, 1));
					return;
			}
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [enabled, go]);

	// ⌘/Ctrl-click or middle-click on a link to a page of the app opens it in a new app tab.
	useEffect(() => {
		if (!enabled) return;
		const onClick = (e: MouseEvent) => {
			const newTab =
				(e.type === "click" && (e.metaKey || e.ctrlKey) && e.button === 0) ||
				(e.type === "auxclick" && e.button === 1);
			if (!newTab || e.shiftKey || e.altKey) return;
			const link = (e.target as Element | null)?.closest?.("a[href]");
			if (!(link instanceof HTMLAnchorElement)) return;
			if (link.target && link.target !== "_self") return;
			const url = new URL(link.href, window.location.href);
			if (url.origin !== window.location.origin) return;
			const path = appPath(`${url.pathname}${url.search}`);
			if (!path) return;
			e.preventDefault();
			e.stopPropagation();
			go(openTab(stateRef.current, path));
		};
		document.addEventListener("click", onClick, true);
		document.addEventListener("auxclick", onClick, true);
		return () => {
			document.removeEventListener("click", onClick, true);
			document.removeEventListener("auxclick", onClick, true);
		};
	}, [enabled, go]);

	return <TabsContext value={value}>{children}</TabsContext>;
}
