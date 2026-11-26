import { describe, expect, it } from "vitest";
import {
	activate,
	activeTab,
	appPath,
	closeTab,
	initialTabs,
	MAX_TABS,
	navigateActive,
	openTab,
	readTabs,
	stepTab,
	type TabsState,
} from "../../src/tabs/tabs";

const paths = (s: TabsState) => s.tabs.map((t) => t.path);

describe("app tabs", () => {
	it("opens new tabs next to the active one and switches to them", () => {
		let s = initialTabs("/inbox");
		s = openTab(s, "/today");
		s = activate(s, s.tabs[0]?.id ?? "");
		s = openTab(s, "/notes/1");
		expect(paths(s)).toEqual(["/inbox", "/notes/1", "/today"]);
		expect(activeTab(s).path).toBe("/notes/1");
	});

	it("navigating changes only the active tab", () => {
		let s = openTab(initialTabs("/inbox"), "/today");
		s = navigateActive(s, "/anytime");
		expect(paths(s)).toEqual(["/inbox", "/anytime"]);
		expect(navigateActive(s, "/anytime")).toBe(s);
	});

	it("closing the active tab moves to its neighbour, and the last tab stays", () => {
		let s = openTab(openTab(initialTabs("/a"), "/b"), "/c");
		s = activate(s, s.tabs[1]?.id ?? "");
		s = closeTab(s, s.activeId);
		expect(paths(s)).toEqual(["/a", "/c"]);
		expect(activeTab(s).path).toBe("/c");
		s = closeTab(s, s.activeId);
		expect(activeTab(s).path).toBe("/a");
		expect(closeTab(s, s.activeId)).toBe(s);
	});

	it("steps left and right, wrapping around", () => {
		let s = openTab(openTab(initialTabs("/a"), "/b"), "/c");
		s = stepTab(s, 1);
		expect(activeTab(s).path).toBe("/a");
		s = stepTab(s, -1);
		expect(activeTab(s).path).toBe("/c");
	});

	it("stops adding tabs at the limit", () => {
		let s = initialTabs("/a");
		for (let i = 0; i < MAX_TABS + 3; i++) s = openTab(s, `/p/${i}`);
		expect(s.tabs).toHaveLength(MAX_TABS);
	});

	it("only keeps paths inside the app", () => {
		expect(appPath("/today?tags=a")).toBe("/today?tags=a");
		expect(appPath("//evil.example")).toBeNull();
		expect(appPath("https://evil.example")).toBeNull();
		expect(appPath("/api/me")).toBeNull();
		const stored = readTabs({
			tabs: [
				{ id: "1", path: "/today" },
				{ id: "2", path: "https://evil.example" },
				{ id: "3", path: 5 },
			],
			activeId: "2",
		});
		expect(stored).toEqual({
			tabs: [{ id: "1", path: "/today" }],
			activeId: "1",
		});
		expect(readTabs(null)).toBeNull();
		expect(readTabs({ tabs: [], activeId: "x" })).toBeNull();
	});
});
