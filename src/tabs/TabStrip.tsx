// The desktop tab strip (SPEC §10.14) above the page.

import { UNREADABLE } from "../../shared/crypto/fields";
import { CrossIcon, PlusIcon } from "../components/icons";
import { useListData } from "../data";
import { isApple } from "../keyboard/keys";
import { useTabs } from "./TabsProvider";

const LISTS: Record<string, string> = {
	inbox: "Inbox",
	today: "Today",
	upcoming: "Upcoming",
	anytime: "Anytime",
	someday: "Someday",
	overdue: "Overdue",
	logbook: "Logbook",
	trash: "Trash",
	deadlines: "Deadlines",
	notes: "Task Notes",
	settings: "Settings",
	share: "Quick Entry",
};

/** A tab's name: the list, project, area, Life Bucket, tag or to-do it shows. */
export function useTabTitle(): (path: string) => string {
	const { data, areas, buckets, projects, tags } = useListData();
	return (path) => {
		const [, first = "", id] = path.split("?")[0]?.split("/") ?? [];
		const text = (title: string | undefined, fallback: string) =>
			title === UNREADABLE ? "🔒" : title || fallback;
		if (id) {
			switch (first) {
				case "notes":
					return text(data.todos.find((t) => t.id === id)?.title, "New Task");
				case "project":
					return text(projects.get(id)?.title, "New Project");
				case "area":
					return text(areas.get(id)?.title, "New Area");
				case "bucket":
					return text(buckets.get(id)?.title, "New Life Bucket");
				case "tag":
					return text(tags.get(id)?.title, "Tag");
			}
		}
		return LISTS[first] ?? "mythings";
	};
}

export function TabStrip() {
	const { enabled, state, newTab, close, select } = useTabs();
	const title = useTabTitle();
	if (!enabled) return null;
	const mod = isApple ? "⌥⌘" : "Ctrl+Alt+";
	return (
		<div
			role="tablist"
			aria-label="Tabs"
			className="flex h-9 items-end gap-0.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-sidebar)] px-2 pt-1"
		>
			{state.tabs.map((tab) => {
				const active = tab.id === state.activeId;
				const name = title(tab.path);
				return (
					<div
						key={tab.id}
						className={`group/tab flex h-8 max-w-52 min-w-24 shrink items-center rounded-t-lg text-sm ${
							active
								? "bg-[var(--bg)] text-[var(--fg)] shadow-[0_1px_0_var(--bg)] ring-1 ring-[var(--border)]"
								: "text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]"
						}`}
					>
						<button
							type="button"
							role="tab"
							aria-selected={active}
							title={name}
							onClick={() => select(tab.id)}
							onAuxClick={(e) => {
								if (e.button === 1) {
									e.preventDefault();
									close(tab.id);
								}
							}}
							className="h-full min-w-0 flex-1 truncate rounded-t-lg pr-1 pl-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
						>
							{name}
						</button>
						{state.tabs.length > 1 && (
							<button
								type="button"
								aria-label={`Close ${name}`}
								title={`Close tab (${mod}W)`}
								onClick={() => close(tab.id)}
								className={`mr-1 shrink-0 rounded p-1 hover:bg-[var(--hover)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent ${
									active ? "" : "opacity-0 group-hover/tab:opacity-100"
								}`}
							>
								<CrossIcon className="size-3" />
							</button>
						)}
					</div>
				);
			})}
			<button
				type="button"
				aria-label="New tab"
				title={`New tab (${isApple ? "⌘T or ⌥⌘T" : "Ctrl+T or Ctrl+Alt+T"})`}
				onClick={() => newTab()}
				className="mb-0.5 ml-1 shrink-0 rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent"
			>
				<PlusIcon className="size-4" />
			</button>
		</div>
	);
}
