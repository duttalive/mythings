import { useDroppable } from "@dnd-kit/core";
import { Link, type LinkProps } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
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
import {
	AreaIcon,
	BoxIcon,
	CalendarIcon,
	GearIcon,
	InboxIcon,
	LayersIcon,
	LogbookIcon,
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

export function Sidebar() {
	const { data, ctx } = useListData();
	const { user } = useAuth();
	const counts = useMemo(() => sidebarCounts(data, ctx), [data, ctx]);
	const tree = useMemo(() => sidebarTree(data), [data]);
	const tags = useMemo(
		() =>
			data.tags
				.filter((t) => t.deletedAt === null && t.parentId === null)
				.sort(bySortKey),
		[data.tags],
	);

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
					{tree.areas.map(({ area, projects }) => (
						<div key={area.id} className="mt-5 flex flex-col gap-px">
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
								>
									<span className="font-semibold">
										{area.title || "New Area"}
									</span>
								</NavItem>
							</DragItem>
							{projectGroup(area.id, projects)}
						</div>
					))}
				</SortableList>

				{tags.length > 0 && (
					<div className="mt-5 flex flex-col gap-px">
						<h2 className="px-2 pb-1 text-xs font-semibold text-[var(--fg-muted)]">
							Tags
						</h2>
						{tags.map((tag) => (
							<NavItem
								key={tag.id}
								to="/tag/$tagId"
								params={{ tagId: tag.id }}
								icon={<TagIcon className="size-4 text-[var(--fg-muted)]" />}
							>
								{tag.title}
							</NavItem>
						))}
					</div>
				)}
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
