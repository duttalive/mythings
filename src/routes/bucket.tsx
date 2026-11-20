// A Life Bucket: a big part of life (like Work or Family) that groups its
// Areas (ongoing to-dos) and Projects (work with an outcome and an end).

import { Link, useParams } from "@tanstack/react-router";
import { bucketView } from "../../shared/views";
import { AreaIcon, BucketIcon, PlusIcon } from "../components/icons";
import { Empty, ListPage, Section } from "../components/ListPage";
import { LoggedItems } from "../components/LoggedItems";
import { PopoverOption } from "../components/Popover";
import { ProjectRow, RowList } from "../components/rows";
import { useFilteredContext, useListData, useTagFilter } from "../data";
import { DragItem, placed, SortableList } from "../dnd/sortable";
import { useCreateList } from "../editing/useCreateList";
import { ListDetails, ListTitle } from "./area";
import { Missing } from "./not-found";

export function BucketPage() {
	const { bucketId } = useParams({ strict: false });
	const { data } = useListData();
	const filtering = useTagFilter().length > 0;
	const { createArea, createProject } = useCreateList();
	const view = bucketView(data, bucketId ?? "", useFilteredContext());
	if (!view) return <Missing what="Life Bucket" />;
	const { bucket } = view;
	const readOnly = bucket.deletedAt !== null;
	const reorderable = !readOnly && !filtering;
	const empty =
		view.areas.length === 0 &&
		view.projects.length === 0 &&
		view.logged.length === 0;

	return (
		<ListPage
			title={bucket.title || "New Life Bucket"}
			titleNode={readOnly ? undefined : <ListTitle list={bucket} />}
			icon={<BucketIcon className="size-7 shrink-0 text-[var(--fg-muted)]" />}
			header={
				<ListDetails
					list={bucket}
					actions={(close, handOff) => (
						<>
							<PopoverOption
								icon={<AreaIcon className="size-4" />}
								onSelect={() => {
									handOff();
									close();
									void createArea(bucket.id).catch(console.error);
								}}
							>
								New Area in Life Bucket
							</PopoverOption>
							<PopoverOption
								icon={<PlusIcon className="size-3.5" />}
								onSelect={() => {
									handOff();
									close();
									void createProject(bucket.id).catch(console.error);
								}}
							>
								New Project in Life Bucket
							</PopoverOption>
							<div className="my-1 border-t border-[var(--border)]" />
						</>
					)}
				/>
			}
			filterable
		>
			{empty && (
				<Empty>
					Nothing in this Life Bucket yet. Add an area for work that keeps
					going, or a project for something you want to finish.
				</Empty>
			)}
			{view.areas.length > 0 && (
				<Section title="Areas" className="">
					<SortableList
						disabled={!reorderable}
						list={{
							id: `bucket:${bucket.id}:areas`,
							accepts: ["area"],
							keyField: "sortKey",
							items: placed(
								"area",
								view.areas.map(({ area }) => area),
								"sortKey",
							),
							moveInPatch: () => ({ bucketId: bucket.id }),
						}}
					>
						<RowList label="Areas">
							{view.areas.map(({ area, open }) => (
								<DragItem key={area.id} kind="area" id={area.id}>
									<Link
										to="/area/$areaId"
										params={{ areaId: area.id }}
										className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-[var(--hover)] pointer-coarse:py-3"
									>
										<AreaIcon className="mt-0.5 size-4 shrink-0 text-[var(--fg-muted)]" />
										<span className="min-w-0 flex-1 break-words">
											{area.title || "New Area"}
										</span>
										{open > 0 && (
											<span className="text-xs text-[var(--fg-muted)] tabular-nums">
												{open}
											</span>
										)}
									</Link>
								</DragItem>
							))}
						</RowList>
					</SortableList>
				</Section>
			)}
			{view.projects.length > 0 && (
				<Section
					title="Projects"
					className={view.areas.length > 0 ? "mt-8" : ""}
				>
					<SortableList
						disabled={!reorderable}
						list={{
							id: `bucket:${bucket.id}:projects`,
							accepts: ["project"],
							keyField: "sortKey",
							items: placed(
								"project",
								view.projects.map(({ project }) => project),
								"sortKey",
							),
							moveInPatch: () => ({ areaId: bucket.id }),
						}}
					>
						<RowList label="Projects">
							{view.projects.map(({ project }) => (
								<ProjectRow key={project.id} project={project} showStar />
							))}
						</RowList>
					</SortableList>
				</Section>
			)}
			<LoggedItems key={bucket.id} entries={view.logged} />
		</ListPage>
	);
}
