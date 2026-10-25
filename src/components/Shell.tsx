import { Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ListDataProvider } from "../data";
import { DndProvider } from "../dnd/DndProvider";
import { EditingProvider } from "../editing/EditingProvider";
import { SelectionProvider } from "../editing/SelectionProvider";
import { KeyboardProvider, useKeyboard } from "../keyboard/KeyboardProvider";
import { useSyncStatus } from "../sync/hooks";
import { BulkBarProvider } from "./BulkBar";
import { CloudOffIcon, SearchIcon, SidebarIcon } from "./icons";
import { NewTodoButton } from "./NewTodoButton";
import { Sidebar } from "./Sidebar";
import { SidebarResizer, useSidebarWidth } from "./SidebarResizer";
import { ToastProvider } from "./Toast";
import { UpdateToast } from "./UpdateToast";

const DESKTOP = "(min-width: 768px)";
const COLLAPSED_KEY = "mythings:sidebarCollapsed";

function readCollapsed(): boolean {
	try {
		return localStorage.getItem(COLLAPSED_KEY) === "1";
	} catch {
		return false;
	}
}

function useMediaQuery(query: string): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const list = window.matchMedia(query);
			list.addEventListener("change", onChange);
			return () => list.removeEventListener("change", onChange);
		},
		() => window.matchMedia(query).matches,
	);
}

/**
 * App layout: the sidebar (collapsible on desktop, a drawer on mobile) and the
 * current list.
 */
export function Shell() {
	const [collapsed, setCollapsed] = useState(readCollapsed);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const desktop = useMediaQuery(DESKTOP);
	const { pathname } = useLocation();
	const sidebar = useSidebarWidth();

	// Navigating from the drawer closes it.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs on route change
	useEffect(() => setDrawerOpen(false), [pathname]);

	useEffect(() => {
		if (!drawerOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setDrawerOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [drawerOpen]);

	function toggle() {
		if (desktop) {
			const next = !collapsed;
			setCollapsed(next);
			try {
				localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
			} catch {}
		} else {
			setDrawerOpen((open) => !open);
		}
	}

	const { state, hasSnapshot } = useSyncStatus();
	const offline = state === "offline";

	// Until the first sync finishes, the local lists are empty or partial.
	if (!hasSnapshot) return <Skeleton offline={offline} />;

	return (
		<ListDataProvider fallback={<Skeleton />}>
			<EditingProvider>
				<DndProvider>
					<SelectionProvider>
						<ToastProvider>
							<BulkBarProvider>
								<KeyboardProvider>
									<div className="flex h-full">
										{drawerOpen && (
											<button
												type="button"
												aria-label="Close sidebar"
												className="fixed inset-0 z-20 bg-black/30 md:hidden"
												onClick={() => setDrawerOpen(false)}
											/>
										)}
										<aside
											aria-label="Sidebar"
											// Off-screen on mobile when closed: keep it out of the tab order and away from screen readers.
											inert={!desktop && !drawerOpen}
											// On desktop the width is the user's (drag the edge); the phone drawer is fixed.
											style={desktop ? { width: sidebar.width } : undefined}
											className={`fixed inset-y-0 left-0 z-30 w-[min(18rem,85vw)] border-r border-[var(--border)] bg-[var(--bg-sidebar)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-transform duration-200 motion-reduce:transition-none md:relative md:z-auto md:shrink-0 md:translate-x-0 md:pt-0 md:pb-0 ${
												drawerOpen ? "translate-x-0" : "-translate-x-full"
											} ${collapsed ? "md:hidden" : ""}`}
										>
											<Sidebar />
											{desktop && <SidebarResizer {...sidebar} />}
										</aside>
										<main className="min-w-0 flex-1 overflow-y-auto">
											<div className="sticky top-0 z-10 flex min-h-11 items-center gap-1 bg-[var(--bg)]/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur">
												<button
													type="button"
													onClick={toggle}
													aria-label="Toggle sidebar"
													aria-expanded={desktop ? !collapsed : drawerOpen}
													className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] pointer-coarse:p-2.5"
												>
													<SidebarIcon className="size-5" />
												</button>
												<SearchButton />
												{offline && (
													<span
														className="ml-auto flex items-center gap-1.5 rounded-full bg-[var(--hover)] px-2.5 py-1 text-xs font-medium text-[var(--fg-muted)]"
														title="Changes are saved on this device and will sync when you're back online."
														data-testid="offline-indicator"
													>
														<CloudOffIcon className="size-3.5" />
														Offline
													</span>
												)}
											</div>
											<div
												// Re-mounted per page, so each list fades in.
												key={pathname}
												className="mx-auto w-full max-w-[720px] animate-fade-in px-4 pb-24 pt-4 md:px-10"
											>
												<Outlet />
											</div>
										</main>
										<NewTodoButton />
										<UpdateToast />
									</div>
								</KeyboardProvider>
							</BulkBarProvider>
						</ToastProvider>
					</SelectionProvider>
				</DndProvider>
			</EditingProvider>
		</ListDataProvider>
	);
}

/** Shown while the local database opens, or until the first sync on this device finishes. */
function Skeleton({ offline = false }: { offline?: boolean }) {
	return (
		<div className="flex h-full" aria-busy={!offline}>
			{offline ? (
				<p
					role="status"
					className="fixed inset-x-0 top-6 mx-auto w-fit rounded-full bg-[var(--hover)] px-3 py-1.5 text-sm text-[var(--fg-muted)]"
				>
					You're offline. Your lists will appear once this device has synced.
				</p>
			) : (
				<span className="sr-only">Loading…</span>
			)}
			<div className="hidden w-60 shrink-0 border-r border-[var(--border)] bg-[var(--bg-sidebar)] md:block" />
			<div className="mx-auto w-full max-w-[720px] px-4 pt-16 md:px-10">
				<div className="h-7 w-40 animate-pulse rounded bg-[var(--hover)] motion-reduce:animate-none" />
				{[0, 1, 2, 3].map((i) => (
					<div
						key={i}
						className="mt-5 h-4 animate-pulse rounded bg-[var(--hover)] motion-reduce:animate-none"
						style={{ width: `${70 - i * 12}%` }}
					/>
				))}
			</div>
		</div>
	);
}

/** Quick Find for fingers: on a keyboard, typing anywhere opens it too. */
function SearchButton() {
	const { openQuickFind } = useKeyboard();
	return (
		<button
			type="button"
			onClick={openQuickFind}
			aria-label="Search"
			title="Search (or just start typing)"
			className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] pointer-coarse:p-2.5"
		>
			<SearchIcon className="size-5" />
		</button>
	);
}
