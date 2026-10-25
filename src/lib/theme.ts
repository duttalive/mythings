// Light/dark theme (SPEC §10.8): follows the system unless the user picks one.
// The choice is mirrored to localStorage so index.html can apply it before the
// first paint, without waiting for the profile.

import type { Settings } from "../../shared/schema";

export type Theme = NonNullable<Settings["theme"]>;

const KEY = "mythings:theme";
const BACKGROUND = { light: "#ffffff", dark: "#1c1c1e" };

export function applyTheme(theme: Theme): void {
	const root = document.documentElement;
	if (theme === "system") delete root.dataset.theme;
	else root.dataset.theme = theme;
	// The browser chrome (address bar, PWA title bar) matches the page.
	for (const meta of document.querySelectorAll<HTMLMetaElement>(
		'meta[name="theme-color"]',
	)) {
		const scheme = meta.media.includes("dark") ? "dark" : "light";
		meta.content = BACKGROUND[theme === "system" ? scheme : theme];
	}
	try {
		if (theme === "system") localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, theme);
	} catch {}
}
