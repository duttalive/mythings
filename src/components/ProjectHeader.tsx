// The editable header of a project page: status ring, title, schedule and
// tag chips, the actions menu, and notes.

import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import type { Project } from "../../shared/schema";
import { bySortKey, type Progress } from "../../shared/views";
import { useAuth } from "../auth/AuthGate";
import { useListData } from "../data";
import { projectRequest } from "../editing/deleteRequests";
import { useEditing, useTitleFocus } from "../editing/EditingProvider";
import {
	finishProjectMutations,
	newHeadingFields,
	openTodosIn,
} from "../editing/projects";
import { describeRule } from "../editing/repeatForm";
import { useCreateTag } from "../editing/useCreateTag";
import { deadlineLabel, shortDate } from "../lib/format";
import { useOps } from "../sync/hooks";
import { CompleteProjectDialog } from "./CompleteProjectDialog";
import { useConfirmDelete } from "./ConfirmDelete";
import {
	ChipButton,
	EditableTitle,
	IconButton,
	NotesField,
	WhenIcon,
	whenText,
} from "./controls";
import {
	AreaIcon,
	CalendarIcon,
	CheckIcon,
	CrossIcon,
	FlagIcon,
	MoreIcon,
	PlusIcon,
	RepeatIcon,
	RestoreIcon,
	TagIcon,
	TrashIcon,
} from "./icons";
import { Popover, PopoverOption, useFocusHandoff } from "./Popover";
import { DeadlinePicker, TagPicker } from "./pickers";
import { ProgressRing } from "./rows";
import { SchedulePanel, type ScheduleView, scheduleWidth } from "./schedule";

/** The progress ring, as a button: completes the project (asking about leftovers) or reopens it. */
export function ProjectStatusButton({
	project,
	progress,
}: {
	project: Project;
	progress: Progress;
}) {
	const ops = useOps();
	const { data } = useListData();
	const [asking, setAsking] = useState(false);
	const remaining = openTodosIn(project.id, data.todos).length;
	const readOnly = project.deletedAt !== null || project.repeat !== null;

	const finish = (status: "completed" | "canceled") => {
		setAsking(false);
		void ops
			.apply(finishProjectMutations(project, data.todos, status))
			.catch(console.error);
	};

	const onClick = () => {
		if (project.status !== "open") {
			void ops
				.update("project", project.id, { status: "open" })
				.catch(console.error);
		} else if (remaining > 0) {
			setAsking(true);
		} else {
			finish("completed");
		}
	};

	const ring = (
		<ProgressRing
			progress={progress}
			status={project.status}
			className="size-6"
		/>
	);
	if (readOnly) return ring;
	return (
		<>
			<button
				type="button"
				onClick={onClick}
				aria-label={
					project.status === "open" ? "Complete project" : "Reopen project"
				}
				title={
					project.status === "open" ? "Complete project" : "Reopen project"
				}
				className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
			>
				{ring}
			</button>
			<CompleteProjectDialog
				open={asking}
				projectTitle={project.title || "New Project"}
				remaining={remaining}
				onChoose={finish}
				onCancel={() => setAsking(false)}
			/>
		</>
	);
}

export function ProjectTitle({ project }: { project: Project }) {
	const ops = useOps();
	const autoFocus = useTitleFocus(project.id);
	return (
		<EditableTitle
			value={project.title}
			onSave={(title) =>
				void ops.update("project", project.id, { title }).catch(console.error)
			}
			placeholder="New Project"
			label="Project title"
			autoFocus={autoFocus}
			className={project.status !== "open" ? "text-[var(--fg-muted)]" : ""}
		/>
	);
}

type PopoverName = "when" | "deadline" | "tags" | "more" | "move" | null;

/** Area link, status, schedule/deadline/tag chips and the actions menu; then notes. */
export function ProjectDetails({ project }: { project: Project }) {
	const ops = useOps();
	const navigate = useNavigate();
	const { data, ctx, areas } = useListData();
	const confirmDelete = useConfirmDelete();
	const { user } = useAuth();
	const { requestTitleFocus } = useEditing();
	const createTag = useCreateTag();
	const weekStart = user.settings.weekStart ?? 1;
	const [popover, setPopover] = useState<PopoverName>(null);
	const [scheduleView, setScheduleView] = useState<ScheduleView>("when");
	const focus = useFocusHandoff();
	const open = (name: PopoverName) => (o: boolean) =>
		setPopover(o ? name : null);
	const update = (patch: Partial<Project>) =>
		void ops.update("project", project.id, patch).catch(console.error);

	const area = project.areaId ? areas.get(project.areaId) : undefined;
	const tags = project.tagIds
		.map((id) => data.tags.find((t) => t.id === id))
		.filter((t) => t && t.deletedAt === null);
	const scheduled = project.when === "scheduled" || project.when === "someday";
	const inTrash = project.deletedAt !== null;
	const editable = !inTrash;

	const whenPopover = (trigger: ReactNode, view: ScheduleView = "when") => (
		<Popover
			label="When"
			open={popover === "when"}
			width={scheduleWidth(scheduleView)}
			onOpenChange={(o) => {
				if (o) setScheduleView(view);
				setPopover(o ? "when" : null);
			}}
			trigger={trigger}
		>
			<SchedulePanel
				item={project}
				entity="project"
				view={scheduleView}
				setView={setScheduleView}
				onPatch={(patch) => update(patch as Partial<Project>)}
				onDone={() => setPopover(null)}
			/>
		</Popover>
	);
	const deadlinePopover = (trigger: ReactNode) => (
		<Popover
			label="Deadline"
			open={popover === "deadline"}
			onOpenChange={open("deadline")}
			trigger={trigger}
		>
			<DeadlinePicker
				value={project.deadline}
				today={ctx.today}
				weekStart={weekStart}
				onChange={(deadline) => {
					update({ deadline });
					setPopover(null);
				}}
			/>
		</Popover>
	);
	const tagsPopover = (trigger: ReactNode) => (
		<Popover
			label="Tags"
			open={popover === "tags"}
			onOpenChange={open("tags")}
			trigger={trigger}
		>
			<TagPicker
				tags={data.tags}
				selected={project.tagIds}
				onToggle={(tagId) =>
					update({
						tagIds: project.tagIds.includes(tagId)
							? project.tagIds.filter((t) => t !== tagId)
							: [...project.tagIds, tagId],
					})
				}
				onCreate={async (title) =>
					update({ tagIds: [...project.tagIds, await createTag(title)] })
				}
			/>
		</Popover>
	);

	const addHeading = async () => {
		focus.handOff();
		setPopover(null);
		const id = await ops.create(
			"heading",
			newHeadingFields(project.id, data.headings),
		);
		requestTitleFocus(id);
	};

	const liveAreas = data.areas
		.filter((a) => a.deletedAt === null)
		.sort(bySortKey);

	return (
		<>
			<div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-[var(--fg-muted)]">
				{area && (
					<Link
						to="/area/$areaId"
						params={{ areaId: area.id }}
						className="mr-1.5 flex items-center gap-1 hover:underline"
					>
						<AreaIcon className="size-3.5" />
						{area.title || "New Area"}
					</Link>
				)}
				{inTrash && <span className="mr-1.5">In Trash</span>}
				{project.status !== "open" && (
					<span className="mr-1.5">
						{project.status === "completed" ? "Completed" : "Canceled"}
					</span>
				)}
				{project.repeat ? (
					editable ? (
						whenPopover(
							<ChipButton
								icon={<RepeatIcon className="size-3.5" />}
								title={describeRule(project.repeat)}
							>
								Repeats · next {shortDate(project.repeat.nextDate, ctx.today)}
							</ChipButton>,
							"repeat",
						)
					) : (
						<span className="mr-1.5 flex items-center gap-1">
							<RepeatIcon className="size-3.5" />
							Repeats · next {shortDate(project.repeat.nextDate, ctx.today)}
						</span>
					)
				) : (
					scheduled &&
					editable &&
					whenPopover(
						<ChipButton icon={<WhenIcon todo={project} today={ctx.today} />}>
							{whenText(project, ctx.today)}
						</ChipButton>,
					)
				)}
				{project.deadline &&
					editable &&
					deadlinePopover(
						<ChipButton
							icon={<FlagIcon className="size-3.5" />}
							danger={
								project.status === "open" && project.deadline <= ctx.today
							}
						>
							Deadline {shortDate(project.deadline, ctx.today)}
							{deadlineLabel(project.deadline, ctx.today) !==
								shortDate(project.deadline, ctx.today) &&
								` · ${deadlineLabel(project.deadline, ctx.today)}`}
						</ChipButton>,
					)}
				{tags.length > 0 &&
					editable &&
					tagsPopover(
						<ChipButton icon={<TagIcon className="size-3.5" />}>
							{tags.map((t) => t?.title).join(", ")}
						</ChipButton>,
					)}

				{editable && (
					<div className="flex items-center">
						{!project.repeat &&
							!scheduled &&
							whenPopover(
								<IconButton label="When">
									<CalendarIcon className="size-4" />
								</IconButton>,
							)}
						{tags.length === 0 &&
							tagsPopover(
								<IconButton label="Tags">
									<TagIcon className="size-4" />
								</IconButton>,
							)}
						{!project.deadline &&
							deadlinePopover(
								<IconButton label="Deadline">
									<FlagIcon className="size-4" />
								</IconButton>,
							)}
						<Popover
							label="Project actions"
							returnFocus={focus.returnFocus}
							open={popover === "more"}
							onOpenChange={open("more")}
							trigger={
								<IconButton label="Project actions">
									<MoreIcon className="size-4" />
								</IconButton>
							}
						>
							<PopoverOption
								icon={<PlusIcon className="size-3.5" />}
								onSelect={addHeading}
							>
								Add Heading
							</PopoverOption>
							<PopoverOption
								icon={<AreaIcon className="size-4" />}
								onSelect={() => {
									// The area list takes focus; don't send it back to the menu button.
									focus.handOff();
									setPopover("move");
								}}
							>
								Move to Area…
							</PopoverOption>
							{project.status === "open" ? (
								<PopoverOption
									icon={<CrossIcon className="size-3.5" />}
									onSelect={() => {
										setPopover(null);
										void ops
											.apply(
												finishProjectMutations(project, data.todos, "canceled"),
											)
											.catch(console.error);
									}}
								>
									Cancel Project
								</PopoverOption>
							) : (
								<PopoverOption
									icon={<RestoreIcon className="size-4" />}
									onSelect={() => {
										setPopover(null);
										update({ status: "open" });
									}}
								>
									Reopen Project
								</PopoverOption>
							)}
							<PopoverOption
								icon={<TrashIcon className="size-4 text-overdue" />}
								onSelect={async () => {
									setPopover(null);
									if (!(await confirmDelete(projectRequest(project, data))))
										return;
									void ops.remove("project", project.id).catch(console.error);
									void navigate({
										to: area ? "/area/$areaId" : "/anytime",
										params: { areaId: area?.id ?? "" },
									});
								}}
							>
								<span className="text-overdue">Delete Project</span>
							</PopoverOption>
						</Popover>
						{/* "Move to Area" opens its own list, anchored to the same spot. */}
						<Popover
							label="Move to area"
							open={popover === "move"}
							onOpenChange={open("move")}
							trigger={<span />}
							anchorOnly
						>
							<p className="px-2 pb-1 text-xs font-semibold text-[var(--fg-muted)]">
								Move to
							</p>
							<PopoverOption
								icon={
									project.areaId === null ? (
										<CheckIcon className="size-3.5" />
									) : null
								}
								onSelect={() => {
									update({ areaId: null });
									setPopover(null);
								}}
							>
								No Area
							</PopoverOption>
							{liveAreas.map((a) => (
								<PopoverOption
									key={a.id}
									icon={
										project.areaId === a.id ? (
											<CheckIcon className="size-3.5" />
										) : (
											<AreaIcon className="size-4" />
										)
									}
									onSelect={() => {
										update({ areaId: a.id });
										setPopover(null);
									}}
								>
									{a.title || "New Area"}
								</PopoverOption>
							))}
						</Popover>
					</div>
				)}
				{inTrash && (
					<button
						type="button"
						onClick={() =>
							void ops.restore("project", project.id).catch(console.error)
						}
						className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium hover:bg-[var(--hover)]"
					>
						<RestoreIcon className="size-3.5" />
						Restore
					</button>
				)}
			</div>
			{editable ? (
				<NotesField
					value={project.notes}
					onSave={(notes) => update({ notes })}
					className="mt-3 text-[var(--fg-muted)] focus:text-[var(--fg)]"
				/>
			) : (
				project.notes.trim() && (
					<p className="mt-3 whitespace-pre-wrap text-[var(--fg-muted)]">
						{project.notes}
					</p>
				)
			)}
		</>
	);
}
