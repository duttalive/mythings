import { useDroppable } from "@dnd-kit/core";
import { Link, type LinkProps, useRouterState } from "@tanstack/react-router";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Tag } from "../../shared/schema";
import {
	bySortKey,
	projectProgress,
	sidebarCounts,
	sidebarTree,
} from "../../shared/views";
import { useAuth } from "../auth/AuthGate";
import { useListData } from "../data";
import { type DragData, useDndRegistry } from "../dnd/DndProvider";
import { canDrop, type SidebarTarget } from "../dnd/drop";
import { DragItem, placed, SortableList } from "../dnd/sortable";
import { useCreateTag } from "../editing/useCreateTag";
import { useOps } from "../sync/hooks";
import {
	AreaIcon,
	BoxIcon,
	CalendarIcon,
	ChevronIcon,
	GearIcon,
	InboxIcon,
	LayersIcon,
	LogbookIcon,
	PlusIcon,
	StarIcon,
	TagIcon,
	TrashIcon,
} from "./icons";
import { NewListButton } from "./NewListButton";
import { ProgressRing } from "./rows";
import { SignOutButton } from "./SignOutButton";
import { SyncPill } from "./SyncPill";

const itemClass =
	"flex items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors duration-150 pointer-coarse:py-2.5 hover:bg-[var(--hover)] data-[status=active]:bg-[var(--selected)] data-[status=active]:font-medium";

// Highlight for a sidebar item that something is about to be dropped onto.
const dropHighlight =
	"rounded-md data-[drop-target=true]:bg-accent/15 data-[drop-target=true]:ring-2 data-[drop-target=true]:ring-accent";

function NavItem({
	icon,
	children,
	badge,
	...link
}: LinkProps & { icon: ReactNode; badge?: ReactNode }) {
	const { justDragged } = useDndRegistry();
	return (
		<Link
			{...link}
			className={itemClass}
			// Releasing a dragged sidebar item shouldn't also follow its link.
			onClickCapture={(e) => {
				if (justDragged()) e.preventDefault();
			}}
		>
			{icon}
			<span className="min-w-0 flex-1 truncate">{children as ReactNode}</span>
			{badge}
		</Link>
	);
}

/** A built-in list that dragged items can be dropped onto. */
function DropTarget({
	type,
	children,
}: {
	type: Exclude<SidebarTarget["type"], "project" | "area">;
	children: ReactNode;
}) {
	const { activeKind } = useDndRegistry();
	const { setNodeRef, isOver } = useDroppable({
		id: `target:${type}`,
		data: { target: { type } } satisfies DragData,
	});
	return (
		<div
			ref={setNodeRef}
			data-drop-target={
				(isOver && activeKind && canDrop(activeKind, type)) || undefined
			}
			className={dropHighlight}
		>
			{children}
		</div>
	);
}

function Badge({
	count,
	tone = "muted",
}: {
	count: number;
	tone?: "muted" | "red";
}) {
	if (count === 0) return null;
	return tone === "red" ? (
		<span className="min-w-5 rounded-full bg-overdue px-1.5 text-center text-xs font-semibold text-on-overdue">
			{count}
		</span>
	) : (
		<span className="text-xs text-[var(--fg-muted)] tabular-nums">{count}</span>
	);
}

/**
 * Collapsing an area hides its projects, and a tag its nested tags. It's
 * stored on the area or tag, so it syncs to the user's other devices; it
 * isn't an undoable edit.
 */
function useSidebarCollapse() {
	const { data } = useListData();
	const ops = useOps();
	const setCollapsed = useCallback(
		(entity: "area" | "tag", ids: string[], collapsed: boolean) =>
			void ops
				.apply(
					ids.map((id) => ({
						type: "upsert" as const,
						entity,
						id,
						patch: { collapsed },
					})),
					{ undoable: false },
				)
				.catch(console.error),
		[ops],
	);

	// Going to a project in a collapsed area, or a tag inside a collapsed
	// one (from search, a link, a new project), opens what hides it, once per
	// visit, so it can be seen.
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const handled = useRef<string | null>(null);
	useEffect(() => {
		if (handled.current === pathname) return;
		const [, kind, id] = /^\/(project|tag)\/([^/]+)/.exec(pathname) ?? [];
		if (kind === "project") {
			const project = data.projects.find((p) => p.id === id);
			// Wait for the project if the data isn't there yet.
			if (!project) return;
			const area = data.areas.find((a) => a.id === project.areaId);
			if (area?.collapsed) setCollapsed("area", [area.id], false);
		} else if (kind === "tag") {
			const byId = new Map(data.tags.map((t) => [t.id, t]));
			let tag = byId.get(id as string);
			if (!tag) return;
			const closed: string[] = [];
			const seen = new Set<string>();
			while (tag?.parentId && !seen.has(tag.parentId)) {
				seen.add(tag.parentId);
				tag = byId.get(tag.parentId);
				if (tag?.collapsed) closed.push(tag.id);
			}
			if (closed.length) setCollapsed("tag", closed, false);
		}
		handled.current = pathname;
	}, [pathname, data.projects, data.areas, data.tags, setCollapsed]);

	return setCollapsed;
}

/** How many things a collapsed area or tag is hiding. */
function HiddenCount({ count, what }: { count: number; what: string }) {
	return (
		<span className="text-xs text-[var(--fg-muted)] tabular-nums">
			<span aria-hidden>{count}</span>
			<span className="sr-only">
				({count} hidden {count === 1 ? what : `${what}s`})
			</span>
		</span>
	);
}

/** The arrow that shows or hides what's inside an area or tag. */
function CollapseToggle({
	collapsed,
	onToggle,
	controls,
	label,
	title,
}: {
	collapsed: boolean;
	onToggle: () => void;
	controls: string;
	label: string;
	title: string;
}) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-expanded={!collapsed}
			aria-controls={collapsed ? undefined : controls}
			aria-label={label}
			title={title}
			className="absolute top-1/2 right-1 -translate-y-1/2 rounded p-0.5 text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:right-0 pointer-coarse:p-3.5"
		>
			<ChevronIcon
				className={`size-3.5 pointer-coarse:size-4 transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`}
			/>
		</button>
	);
}

/** Room for the arrow, which sits on top of the link. */
const toggleSpace = <span className="w-4 shrink-0 pointer-coarse:w-8" />;

type TagNode = { tag: Tag; children: TagNode[]; size: number };

/** Live tags as a tree in sidebar order; `size` counts every tag below. */
function tagTree(tags: Tag[]): TagNode[] {
	const live = tags.filter((t) => t.deletedAt === null).sort(bySortKey);
	const ids = new Set(live.map((t) => t.id));
	const byParent = new Map<string | null, Tag[]>();
	for (const tag of live) {
		// A tag whose parent is gone shows at the top.
		const parent = tag.parentId && ids.has(tag.parentId) ? tag.parentId : null;
		byParent.set(parent, [...(byParent.get(parent) ?? []), tag]);
	}
	const seen = new Set<string>();
	const build = (parent: string | null): TagNode[] =>
		(byParent.get(parent) ?? [])
			.filter((tag) => !seen.has(tag.id) && seen.add(tag.id))
			.map((tag) => {
				const children = build(tag.id);
				const size = children.reduce((n, c) => n + 1 + c.size, 0);
				return { tag, children, size };
			});
	return build(null);
}

function TagBranch({
	node,
	depth,
	setCollapsed,
}: {
	node: TagNode;
	depth: number;
	setCollapsed: ReturnType<typeof useSidebarCollapse>;
}) {
	const { tag, children, size } = node;
	// Rows synced before collapsing existed have no flag: open.
	const collapsed = tag.collapsed === true;
	const toggle = children.length > 0;
	const groupId = `sidebar-tag-${tag.id}`;
	return (
		<>
			<div className="relative" style={{ paddingLeft: `${depth}rem` }}>
				<NavItem
					to="/tag/$tagId"
					params={{ tagId: tag.id }}
					icon={<TagIcon className="size-4 text-[var(--fg-muted)]" />}
					badge={
						toggle && (
							<>
								{collapsed && <HiddenCount count={size} what="tag" />}
								{toggleSpace}
							</>
						)
					}
				>
					{tag.title}
				</NavItem>
				{toggle && (
					<CollapseToggle
						collapsed={collapsed}
						onToggle={() => setCollapsed("tag", [tag.id], !collapsed)}
						controls={groupId}
						label={`${collapsed ? "Show" : "Hide"} tags in ${tag.title}`}
						title={collapsed ? "Show nested tags" : "Hide nested tags"}
					/>
				)}
			</div>
			{toggle && !collapsed && (
				<div id={groupId} className="flex flex-col gap-px">
					{children.map((child) => (
						<TagBranch
							key={child.tag.id}
							node={child}
							depth={depth + 1}
							setCollapsed={setCollapsed}
						/>
					))}
				</div>
			)}
		</>
	);
}

/**
 * Adds tags from the sidebar: Enter adds one and stays for the next, Escape
 * or leaving the field (empty) closes it. Names that already exist aren't added twice.
 */
function NewTagField({ onDone }: { onDone: () => void }) {
	const { data } = useListData();
	const createTag = useCreateTag();
	const [title, setTitle] = useState("");
	const [error, setError] = useState<string | null>(null);
	const errorId = useId();

	const add = async (): Promise<boolean> => {
		const name = title.trim();
		if (!name) return true;
		const taken = data.tags.some(
			(t) =>
				t.deletedAt === null && t.title.toLowerCase() === name.toLowerCase(),
		);
		if (taken) {
			setError(`“${name}” is already a tag.`);
			return false;
		}
		// Cleared first, so a name typed while this one saves isn't lost.
		setTitle("");
		setError(null);
		await createTag(name);
		return true;
	};

	return (
		<div className="px-2 py-1">
			<div className="flex items-center gap-2.5">
				<TagIcon className="size-4 shrink-0 text-[var(--fg-muted)]" />
				<input
					// biome-ignore lint/a11y/noAutofocus: opened by the + button to type a name
					autoFocus
					value={title}
					onChange={(e) => {
						setTitle(e.target.value);
						setError(null);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							void add();
						} else if (e.key === "Escape") {
							e.preventDefault();
							onDone();
						}
					}}
					onBlur={() => void add().then((ok) => ok && onDone())}
					maxLength={1000}
					placeholder="New tag"
					aria-label="New tag name"
					aria-invalid={!!error}
					aria-describedby={error ? errorId : undefined}
					className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-sm outline-none focus:border-accent"
				/>
			</div>
			{error && (
				<p
					id={errorId}
					role="alert"
					className="mt-1 pl-6.5 text-xs text-overdue"
				>
					{error}
				</p>
			)}
		</div>
	);
}

export function Sidebar() {
	const { data, ctx } = useListData();
	const { user } = useAuth();
	const setCollapsed = useSidebarCollapse();
	const [addingTag, setAddingTag] = useState(false);
	const counts = useMemo(() => sidebarCounts(data, ctx), [data, ctx]);
	const tree = useMemo(() => sidebarTree(data), [data]);
	const tags = useMemo(() => tagTree(data.tags), [data.tags]);

	const projectLink = (project: (typeof tree.projects)[number]) => (
		<DragItem
			key={project.id}
			as="div"
			kind="project"
			id={project.id}
			target={{ type: "project", id: project.id }}
			className={dropHighlight}
		>
			<NavItem
				to="/project/$projectId"
				params={{ projectId: project.id }}
				icon={
					<ProgressRing
						progress={projectProgress(project.id, data.todos)}
						decorative
						className="size-4"
					/>
				}
			>
				<span
					className={project.when === "someday" ? "text-[var(--fg-muted)]" : ""}
				>
					{project.title || "New Project"}
				</span>
			</NavItem>
		</DragItem>
	);

	// Projects reorder within their group; dropping one into another group moves it to that area.
	const projectGroup = (
		areaId: string | null,
		projects: typeof tree.projects,
	) => (
		<SortableList
			className="flex min-h-1 flex-col gap-px"
			list={{
				id: `sidebar-projects:${areaId ?? "none"}`,
				accepts: ["project"],
				keyField: "sortKey",
				items: placed("project", projects, "sortKey"),
				moveInPatch: () => ({ areaId }),
			}}
		>
			{projects.map(projectLink)}
		</SortableList>
	);

	return (
		<div className="flex h-full flex-col">
			<nav aria-label="Lists" className="flex-1 overflow-y-auto p-3 pt-4">
				<div className="flex flex-col gap-px">
					<DropTarget type="inbox">
						<NavItem
							to="/inbox"
							icon={<InboxIcon className="size-[18px] text-accent" />}
							badge={<Badge count={counts.inbox} />}
						>
							Inbox
						</NavItem>
					</DropTarget>
				</div>
				<div className="mt-4 flex flex-col gap-px">
					<DropTarget type="today">
						<NavItem
							to="/today"
							icon={<StarIcon className="size-[18px] text-today" />}
							badge={
								<span className="flex items-center gap-1.5">
									<Badge count={counts.due} tone="red" />
									<Badge count={counts.today} />
								</span>
							}
						>
							Today
						</NavItem>
					</DropTarget>
					<NavItem
						to="/upcoming"
						icon={<CalendarIcon className="size-[18px] text-overdue" />}
					>
						Upcoming
					</NavItem>
					<DropTarget type="anytime">
						<NavItem
							to="/anytime"
							icon={<LayersIcon className="size-[18px] text-teal-600" />}
						>
							Anytime
						</NavItem>
					</DropTarget>
					<DropTarget type="someday">
						<NavItem
							to="/someday"
							icon={<BoxIcon className="size-[18px] text-amber-700" />}
						>
							Someday
						</NavItem>
					</DropTarget>
				</div>
				<div className="mt-4 flex flex-col gap-px">
					<DropTarget type="logbook">
						<NavItem
							to="/logbook"
							icon={<LogbookIcon className="size-[18px] text-done" />}
						>
							Logbook
						</NavItem>
					</DropTarget>
					<DropTarget type="trash">
						<NavItem
							to="/trash"
							icon={
								<TrashIcon className="size-[18px] text-[var(--fg-muted)]" />
							}
						>
							Trash
						</NavItem>
					</DropTarget>
				</div>

				<div className="mt-5">{projectGroup(null, tree.projects)}</div>
				<SortableList
					list={{
						id: "sidebar-areas",
						accepts: ["area"],
						keyField: "sortKey",
						items: placed(
							"area",
							tree.areas.map(({ area }) => area),
							"sortKey",
						),
					}}
				>
					{tree.areas.map(({ area, projects }) => {
						const title = area.title || "New Area";
						// Rows synced before collapsing existed have no flag: open.
						const collapsed = area.collapsed === true;
						const toggle = projects.length > 0;
						const groupId = `sidebar-area-${area.id}`;
						return (
							<div key={area.id} className="mt-5 flex flex-col gap-px">
								<div className="relative">
									<DragItem
										as="div"
										kind="area"
										id={area.id}
										target={{ type: "area", id: area.id }}
										className={dropHighlight}
									>
										<NavItem
											to="/area/$areaId"
											params={{ areaId: area.id }}
											icon={
												<AreaIcon className="size-[18px] text-[var(--fg-muted)]" />
											}
											badge={
												toggle && (
													<>
														{collapsed && (
															<HiddenCount
																count={projects.length}
																what="project"
															/>
														)}
														{toggleSpace}
													</>
												)
											}
										>
											<span className="font-semibold">{title}</span>
										</NavItem>
									</DragItem>
									{toggle && (
										<CollapseToggle
											collapsed={collapsed}
											onToggle={() =>
												setCollapsed("area", [area.id], !collapsed)
											}
											controls={groupId}
											label={`${collapsed ? "Show" : "Hide"} projects in ${title}`}
											title={collapsed ? "Show projects" : "Hide projects"}
										/>
									)}
								</div>
								{!collapsed && (
									<div id={groupId}>{projectGroup(area.id, projects)}</div>
								)}
							</div>
						);
					})}
				</SortableList>

				<div className="mt-5 flex flex-col gap-px">
					<div className="flex items-center justify-between pr-1 pb-1 pl-2">
						<h2 className="text-xs font-semibold text-[var(--fg-muted)]">
							Tags
						</h2>
						<button
							type="button"
							onClick={() => setAddingTag(true)}
							aria-label="New tag"
							title="New tag"
							className="rounded p-0.5 text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:-my-2 pointer-coarse:p-3"
						>
							<PlusIcon className="size-3.5 pointer-coarse:size-4" />
						</button>
					</div>
					{tags.map((node) => (
						<TagBranch
							key={node.tag.id}
							node={node}
							depth={0}
							setCollapsed={setCollapsed}
						/>
					))}
					{addingTag && <NewTagField onDone={() => setAddingTag(false)} />}
				</div>
			</nav>
			<div className="px-3 pb-1">
				<NewListButton />
			</div>
			<div className="flex flex-col gap-2 border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--fg-muted)]">
				<SyncPill />
				<div className="flex items-center gap-2">
					<span className="min-w-0 flex-1 truncate" title={user.email}>
						{user.email}
					</span>
					<Link
						to="/settings"
						aria-label="Settings"
						title="Settings (⌘,)"
						className="-my-1 shrink-0 rounded-md p-1 hover:bg-[var(--hover)] hover:text-[var(--fg)] data-[status=active]:text-accent pointer-coarse:-my-2 pointer-coarse:p-2.5"
					>
						<GearIcon className="size-4" />
					</Link>
					<SignOutButton className="shrink-0 hover:text-[var(--fg)] pointer-coarse:-my-2 pointer-coarse:py-2.5" />
				</div>
			</div>
		</div>
	);
}
