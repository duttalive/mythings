import {
	type DragEndEvent,
	type DragMoveEvent,
	useDndMonitor,
	useDraggable,
	useDroppable,
} from "@dnd-kit/core";
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
import type { Area, Project, Tag } from "../../shared/schema";
import {
	bySortKey,
	projectProgress,
	sidebarCounts,
	sidebarTree,
} from "../../shared/views";
import { useAuth } from "../auth/AuthGate";
import { useSaveSettings } from "../auth/useSaveSettings";
import { useListData } from "../data";
import { type DragData, useDndRegistry } from "../dnd/DndProvider";
import { canDrop, type SidebarTarget } from "../dnd/drop";
import { DragItem, dndId, placed, SortableList } from "../dnd/sortable";
import {
	canMoveTag,
	type TagZone,
	tagMoveMutations,
	tagZone,
} from "../dnd/tagMoves";
import { useCreateTag } from "../editing/useCreateTag";
import { useDeleteTag } from "../editing/useDeleteTag";
import { sidebarViews, VIEWS } from "../lib/views";
import { useOps } from "../sync/hooks";
import {
	AreaIcon,
	BucketIcon,
	ChevronIcon,
	GearIcon,
	InboxIcon,
	LogbookIcon,
	PlusIcon,
	StarIcon,
	TagIcon,
	TrashIcon,
} from "./icons";
import { NewListButton } from "./NewListButton";
import { Popover, PopoverOption } from "./Popover";
import { ProgressRing } from "./rows";
import { SignOutButton } from "./SignOutButton";
import { SyncPill } from "./SyncPill";

const itemClass =
	"flex items-center gap-2.5 rounded-md px-2 py-1 text-sm transition-colors duration-150 pointer-coarse:py-3 hover:bg-[var(--hover)] focus-visible:-outline-offset-2 data-[status=active]:bg-[var(--selected)] data-[status=active]:font-medium";

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
	type: Exclude<SidebarTarget["type"], "project" | "area" | "bucket">;
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
 * Collapsing a Life Bucket hides its areas and projects, and a tag its nested tags. It's
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

	// Going to an area or project in a collapsed Life Bucket, or a tag inside a collapsed
	// one (from search, a link, a new project), opens what hides it, once per
	// visit, so it can be seen.
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const handled = useRef<string | null>(null);
	useEffect(() => {
		if (handled.current === pathname) return;
		const [, kind, id] = /^\/(project|area|tag)\/([^/]+)/.exec(pathname) ?? [];
		if (kind === "project" || kind === "area") {
			const item =
				kind === "project"
					? data.projects.find((p) => p.id === id)
					: data.areas.find((a) => a.id === id);
			// Wait for it if the data isn't there yet.
			if (!item) return;
			const bucketId = "kind" in item ? item.bucketId : item.areaId;
			const bucket = data.buckets.find((b) => b.id === bucketId);
			if (bucket?.collapsed) setCollapsed("area", [bucket.id], false);
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
	}, [
		pathname,
		data.projects,
		data.areas,
		data.buckets,
		data.tags,
		setCollapsed,
	]);

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

type TagDrop = { id: string; zone: TagZone } | null;

/** Where the pointer is during a drag, from the event that started it plus how far it's moved. */
function pointerY(e: DragMoveEvent | DragEndEvent): number {
	const start = e.activatorEvent as PointerEvent | TouchEvent;
	const y =
		"touches" in start
			? (start.touches[0] ?? start.changedTouches[0])?.clientY
			: start.clientY;
	return (y ?? 0) + e.delta.y;
}

/**
 * Tracks a dragged tag over the sidebar's tag rows (for the drop indicator)
 * and moves it on drop: into the tag under it, or just before or after it.
 */
function useTagDrop(tags: Tag[]): TagDrop {
	const ops = useOps();
	const [drop, setDrop] = useState<TagDrop>(null);
	const dropFor = (e: DragMoveEvent | DragEndEvent): TagDrop => {
		const dragged = e.active.data.current as DragData | undefined;
		const row = e.over?.data.current as DragData | undefined;
		if (dragged?.kind !== "tag" || !dragged.id || !row?.tagRow || !e.over)
			return null;
		if (!canMoveTag(tags, dragged.id, row.tagRow)) return null;
		return { id: row.tagRow, zone: tagZone(pointerY(e), e.over.rect) };
	};
	useDndMonitor({
		onDragMove: (e) => {
			const next = dropFor(e);
			setDrop((prev) =>
				prev?.id === next?.id && prev?.zone === next?.zone ? prev : next,
			);
		},
		onDragEnd: (e) => {
			const target = dropFor(e);
			const id = (e.active.data.current as DragData | undefined)?.id;
			setDrop(null);
			if (!target || !id) return;
			const mutations = tagMoveMutations(tags, id, target.id, target.zone);
			if (mutations?.length) void ops.apply(mutations).catch(console.error);
		},
		onDragCancel: () => setDrop(null),
	});
	return drop;
}

function TagBranch({
	node,
	depth,
	setCollapsed,
	drop,
}: {
	node: TagNode;
	depth: number;
	setCollapsed: ReturnType<typeof useSidebarCollapse>;
	drop: TagDrop;
}) {
	const { tag, children, size } = node;
	// Rows synced before collapsing existed have no flag: open.
	const collapsed = tag.collapsed === true;
	const toggle = children.length > 0;
	const groupId = `sidebar-tag-${tag.id}`;
	const zone = drop?.id === tag.id ? drop.zone : null;
	return (
		<>
			<TagRow tag={tag} depth={depth} zone={zone}>
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
			</TagRow>
			{toggle && !collapsed && (
				<div id={groupId} className="flex flex-col gap-px">
					{children.map((child) => (
						<TagBranch
							key={child.tag.id}
							node={child}
							depth={depth + 1}
							setCollapsed={setCollapsed}
							drop={drop}
						/>
					))}
				</div>
			)}
		</>
	);
}

/**
 * A tag in the sidebar: drag it onto another tag to nest it, next to one to
 * reorder, or onto Trash. Right-click (or the context-menu key) for actions.
 */
function TagRow({
	tag,
	depth,
	zone,
	children,
}: {
	tag: Tag;
	depth: number;
	zone: TagZone | null;
	children: ReactNode;
}) {
	const { data } = useListData();
	const ops = useOps();
	const deleteTag = useDeleteTag();
	const [menu, setMenu] = useState(false);
	const drag = useDraggable({
		id: dndId("tag", tag.id),
		data: { kind: "tag", id: tag.id } satisfies DragData,
	});
	const target = useDroppable({
		id: dndId("tagrow", tag.id),
		data: { tagRow: tag.id } satisfies DragData,
	});
	const parent = tag.parentId
		? data.tags.find((t) => t.id === tag.parentId && t.deletedAt === null)
		: undefined;
	const line = "pointer-events-none absolute right-1 h-0.5 rounded bg-accent";
	return (
		// The menu opens from the tag's link inside (right-click, or the
		// context-menu key while it's focused); the same actions are on its page.
		// biome-ignore lint/a11y/noStaticElementInteractions: see above
		<div
			ref={(node) => {
				drag.setNodeRef(node);
				target.setNodeRef(node);
			}}
			{...drag.listeners}
			onContextMenu={(e) => {
				e.preventDefault();
				setMenu(true);
			}}
			data-drop-target={zone === "inside" || undefined}
			className={`relative ${dropHighlight} ${drag.isDragging ? "opacity-40" : ""}`}
			style={{ paddingLeft: `${depth}rem` }}
		>
			{children}
			{zone === "before" && (
				<span className={`${line} -top-px`} style={{ left: `${depth}rem` }} />
			)}
			{zone === "after" && (
				<span
					className={`${line} -bottom-px`}
					style={{ left: `${depth}rem` }}
				/>
			)}
			<Popover
				label={`Actions for ${tag.title}`}
				open={menu}
				onOpenChange={setMenu}
				anchorOnly
				width="w-56"
				trigger={
					<span
						aria-hidden
						className="pointer-events-none absolute bottom-0 left-6"
					/>
				}
			>
				{parent && (
					<PopoverOption
						icon={<TagIcon className="size-4 text-[var(--fg-muted)]" />}
						onSelect={() => {
							setMenu(false);
							void ops
								.update("tag", tag.id, { parentId: null })
								.catch(console.error);
						}}
					>
						Move out of “{parent.title}”
					</PopoverOption>
				)}
				<PopoverOption
					icon={<TrashIcon className="size-4 text-overdue" />}
					onSelect={() => {
						setMenu(false);
						void deleteTag(tag);
					}}
				>
					<span className="text-overdue">Delete Tag…</span>
				</PopoverOption>
			</Popover>
		</div>
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
	const saveSettings = useSaveSettings();
	const tagsHidden = user.settings.tagsCollapsed === true;
	const showTags = useCallback(() => {
		if (tagsHidden) void saveSettings({ tagsCollapsed: false });
	}, [tagsHidden, saveSettings]);
	// Visiting a tag opens the Tags section, once per visit, so it can be seen.
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const shownFor = useRef<string | null>(null);
	useEffect(() => {
		if (!pathname.startsWith("/tag/") || shownFor.current === pathname) return;
		shownFor.current = pathname;
		showTags();
	}, [pathname, showTags]);
	const counts = useMemo(() => sidebarCounts(data, ctx), [data, ctx]);
	const tree = useMemo(() => sidebarTree(data), [data]);
	const shown = sidebarViews(user.settings);
	const tags = useMemo(() => tagTree(data.tags), [data.tags]);
	const liveTagCount = useMemo(
		() => data.tags.filter((t) => t.deletedAt === null).length,
		[data.tags],
	);
	const tagDrop = useTagDrop(data.tags);

	const projectLink = (project: Project) => (
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

	const areaLink = (area: Area) => (
		<DragItem
			key={area.id}
			as="div"
			kind="area"
			id={area.id}
			target={{ type: "area", id: area.id }}
			className={dropHighlight}
		>
			<NavItem
				to="/area/$areaId"
				params={{ areaId: area.id }}
				icon={<AreaIcon className="size-4 text-[var(--fg-muted)]" />}
			>
				{area.title || "New Area"}
			</NavItem>
		</DragItem>
	);

	// Areas and projects reorder within their Life Bucket; dropping one into
	// another bucket's list moves it there.
	const bucketContents = (
		bucketId: string | null,
		areas: Area[],
		projects: Project[],
	) => (
		<>
			<SortableList
				className="flex min-h-1 flex-col gap-px"
				list={{
					id: `sidebar-areas:${bucketId ?? "none"}`,
					accepts: ["area"],
					keyField: "sortKey",
					items: placed("area", areas, "sortKey"),
					moveInPatch: () => ({ bucketId }),
				}}
			>
				{areas.map(areaLink)}
			</SortableList>
			<SortableList
				className="flex min-h-1 flex-col gap-px"
				list={{
					id: `sidebar-projects:${bucketId ?? "none"}`,
					accepts: ["project"],
					keyField: "sortKey",
					items: placed("project", projects, "sortKey"),
					moveInPatch: () => ({ areaId: bucketId }),
				}}
			>
				{projects.map(projectLink)}
			</SortableList>
		</>
	);

	return (
		<div className="flex h-full flex-col">
			<nav
				aria-label="Lists"
				className="flex-1 overflow-y-auto overscroll-contain p-3 pt-4"
			>
				<div className="flex flex-col gap-px">
					<DropTarget type="inbox">
						<NavItem
							to="/inbox"
							icon={<InboxIcon className="size-4.5 text-accent" />}
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
							icon={<StarIcon className="size-4.5 text-today" />}
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
					{shown.has("upcoming") && (
						<NavItem to="/upcoming" icon={VIEWS.upcoming.icon("size-4.5")}>
							Upcoming
						</NavItem>
					)}
					{shown.has("anytime") && (
						<DropTarget type="anytime">
							<NavItem to="/anytime" icon={VIEWS.anytime.icon("size-4.5")}>
								Anytime
							</NavItem>
						</DropTarget>
					)}
					{shown.has("someday") && (
						<DropTarget type="someday">
							<NavItem to="/someday" icon={VIEWS.someday.icon("size-4.5")}>
								Someday
							</NavItem>
						</DropTarget>
					)}
					{shown.has("overdue") && (
						<NavItem
							to="/overdue"
							icon={VIEWS.overdue.icon("size-4.5")}
							badge={<Badge count={counts.overdue} tone="red" />}
						>
							Overdue
						</NavItem>
					)}
					{shown.has("deadlines") && (
						<NavItem to="/deadlines" icon={VIEWS.deadlines.icon("size-4.5")}>
							Deadlines
						</NavItem>
					)}
					{shown.has("notes") && (
						<NavItem to="/notes" icon={VIEWS.notes.icon("size-4.5")}>
							Task Notes
						</NavItem>
					)}
				</div>
				<div className="mt-4 flex flex-col gap-px">
					<DropTarget type="logbook">
						<NavItem
							to="/logbook"
							icon={<LogbookIcon className="size-4.5 text-done" />}
						>
							Logbook
						</NavItem>
					</DropTarget>
					<DropTarget type="trash">
						<NavItem
							to="/trash"
							icon={<TrashIcon className="size-4.5 text-[var(--fg-muted)]" />}
						>
							Trash
						</NavItem>
					</DropTarget>
				</div>

				{(tree.loose.areas.length > 0 || tree.loose.projects.length > 0) && (
					<div className="mt-5">
						{bucketContents(null, tree.loose.areas, tree.loose.projects)}
					</div>
				)}
				<SortableList
					list={{
						id: "sidebar-buckets",
						accepts: ["bucket"],
						keyField: "sortKey",
						items: placed(
							"area",
							tree.buckets.map(({ bucket }) => bucket),
							"sortKey",
						),
					}}
				>
					{tree.buckets.map(({ bucket, areas, projects }) => {
						const title = bucket.title || "New Life Bucket";
						// Rows synced before collapsing existed have no flag: open.
						const collapsed = bucket.collapsed === true;
						const inside = areas.length + projects.length;
						const toggle = inside > 0;
						const groupId = `sidebar-bucket-${bucket.id}`;
						return (
							<div key={bucket.id} className="mt-5 flex flex-col gap-px">
								<div className="relative">
									<DragItem
										as="div"
										kind="bucket"
										id={bucket.id}
										target={{ type: "bucket", id: bucket.id }}
										className={dropHighlight}
									>
										<NavItem
											to="/bucket/$bucketId"
											params={{ bucketId: bucket.id }}
											icon={
												<BucketIcon className="size-4.5 text-[var(--fg-muted)]" />
											}
											badge={
												toggle && (
													<>
														{collapsed && (
															<HiddenCount count={inside} what="list" />
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
												setCollapsed("area", [bucket.id], !collapsed)
											}
											controls={groupId}
											label={`${collapsed ? "Show" : "Hide"} areas and projects in ${title}`}
											title={
												collapsed
													? "Show areas and projects"
													: "Hide areas and projects"
											}
										/>
									)}
								</div>
								{!collapsed && (
									<div id={groupId} className="pl-3">
										{bucketContents(bucket.id, areas, projects)}
									</div>
								)}
							</div>
						);
					})}
				</SortableList>

				<div className="mt-5 flex flex-col gap-px">
					<div className="flex items-center gap-1 pr-1 pb-1 pl-2">
						<h2 className="flex-1 text-xs font-semibold text-[var(--fg-muted)]">
							Tags
						</h2>
						{tagsHidden && liveTagCount > 0 && (
							<HiddenCount count={liveTagCount} what="tag" />
						)}
						<button
							type="button"
							onClick={() => {
								showTags();
								setAddingTag(true);
							}}
							aria-label="New tag"
							title="New tag"
							className="rounded p-0.5 text-[var(--fg-muted)] transition-colors duration-150 hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:-my-2.5 pointer-coarse:p-3.5"
						>
							<PlusIcon className="size-3.5 pointer-coarse:size-4" />
						</button>
						{liveTagCount > 0 && (
							<button
								type="button"
								onClick={() =>
									void saveSettings({ tagsCollapsed: !tagsHidden })
								}
								aria-expanded={!tagsHidden}
								aria-controls={tagsHidden ? undefined : "sidebar-tags"}
								aria-label={tagsHidden ? "Show tags" : "Hide tags"}
								title={tagsHidden ? "Show tags" : "Hide tags"}
								className="rounded p-0.5 text-[var(--fg-muted)] transition-colors duration-150 hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:-my-2.5 pointer-coarse:p-3.5"
							>
								<ChevronIcon
									className={`size-3.5 pointer-coarse:size-4 transition-transform duration-150 ${tagsHidden ? "" : "rotate-90"}`}
								/>
							</button>
						)}
					</div>
					{!tagsHidden && (
						<div id="sidebar-tags" className="flex flex-col gap-px">
							{tags.map((node) => (
								<TagBranch
									key={node.tag.id}
									node={node}
									depth={0}
									setCollapsed={setCollapsed}
									drop={tagDrop}
								/>
							))}
						</div>
					)}
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
						className="-my-1 shrink-0 rounded-md p-1 transition-colors duration-150 hover:bg-[var(--hover)] hover:text-[var(--fg)] data-[status=active]:text-accent pointer-coarse:-my-3 pointer-coarse:p-3.5"
					>
						<GearIcon className="size-4" />
					</Link>
					<SignOutButton className="shrink-0 hover:text-[var(--fg)] pointer-coarse:-my-2 pointer-coarse:py-2.5" />
				</div>
			</div>
		</div>
	);
}
