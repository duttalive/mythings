import { type TrashEntry, trash } from "../../shared/views";
import { useConfirmDelete } from "../components/ConfirmDelete";
import {
	AreaIcon,
	BucketIcon,
	RestoreIcon,
	TrashIcon,
} from "../components/icons";
import { Empty, ListPage } from "../components/ListPage";
import { ProjectRow, RowList, TodoRow } from "../components/rows";
import { compactSecondaryButtonClass } from "../components/ui";
import { useListData, useListFilter } from "../data";
import { emptyTrashRequest } from "../editing/deleteRequests";
import { VIEWS } from "../lib/views";
import { useOps } from "../sync/hooks";

const UNTITLED: Record<TrashEntry["kind"], string> = {
	todo: "New Task",
	project: "New Project",
	heading: "New Heading",
	area: "New Area",
};

/** What kind of list an area or heading entry is. */
function label(entry: TrashEntry): string {
	if (entry.kind === "heading") return "Heading";
	if (entry.kind === "area")
		return entry.item.kind === "bucket" ? "Life Bucket" : "Area";
	return entry.kind === "project" ? "Project" : "Task";
}

export function TrashPage() {
	const { data } = useListData();
	const ops = useOps();
	// Empty Trash always empties all of it, whatever the filter bar shows.
	const all = trash(data);
	const filter = useListFilter();
	const entries = trash(data, filter);
	const filtering = Object.keys(filter).length > 0;
	const confirmDelete = useConfirmDelete();

	const restore = (entry: TrashEntry) => {
		void ops.restore(entry.kind, entry.item.id).catch(console.error);
	};

	const emptyTrash = async () => {
		if (!(await confirmDelete(emptyTrashRequest(all.length)))) return;
		// Top-level entries only: purging a parent takes its children with it.
		await ops
			.apply(
				all.map((entry) => ({
					type: "purge" as const,
					entity: entry.kind,
					id: entry.item.id,
				})),
			)
			.catch(console.error);
	};

	const restoreButton = (entry: TrashEntry) => (
		<button
			type="button"
			onClick={() => restore(entry)}
			aria-label={`Restore ${entry.item.title || UNTITLED[entry.kind]}`}
			title="Restore"
			className="shrink-0 rounded-md p-1 text-[var(--fg-muted)] opacity-0 transition duration-150 pointer-coarse:-my-2 pointer-coarse:p-3.5 group-hover:opacity-100 hover:bg-[var(--selected)] hover:text-[var(--fg)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent [@media(hover:none)]:opacity-100"
		>
			<RestoreIcon className="size-4" />
		</button>
	);

	return (
		<ListPage
			title="Trash"
			icon={<TrashIcon className="size-7 text-[var(--fg-muted)]" />}
			description={VIEWS.trash.description}
			filterable
			header={
				all.length > 0 && (
					<div className="mt-3 flex items-center gap-2 text-sm">
						<button
							type="button"
							onClick={() => void emptyTrash()}
							className={compactSecondaryButtonClass}
						>
							Empty Trash
						</button>
					</div>
				)
			}
		>
			{entries.length === 0 ? (
				<Empty icon={VIEWS.trash.icon("size-10")}>
					{filtering
						? "Nothing in Trash matches these filters."
						: "Trash is empty."}
				</Empty>
			) : (
				<RowList label="Trash">
					{entries.map((entry) => {
						switch (entry.kind) {
							case "todo":
								return (
									<TodoRow
										key={entry.item.id}
										todo={entry.item}
										showContainer
										readOnly
										actions={restoreButton(entry)}
									/>
								);
							case "project":
								return (
									<ProjectRow
										key={entry.item.id}
										project={entry.item}
										showContainer
										actions={restoreButton(entry)}
									/>
								);
							default:
								return (
									<li
										key={entry.item.id}
										className="group flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-[var(--hover)] pointer-coarse:py-3"
									>
										{entry.kind === "area" && entry.item.kind === "bucket" ? (
											<BucketIcon className="size-4.5 text-[var(--fg-muted)]" />
										) : entry.kind === "area" ? (
											<AreaIcon className="size-4.5 text-[var(--fg-muted)]" />
										) : (
											<span className="w-4.5" aria-hidden />
										)}
										<span className="long-title min-w-0 font-medium break-words">
											{entry.item.title || `New ${label(entry)}`}
										</span>
										<span className="flex-1 shrink-0 text-xs text-[var(--fg-muted)]">
											{label(entry)}
										</span>
										{restoreButton(entry)}
									</li>
								);
						}
					})}
				</RowList>
			)}
		</ListPage>
	);
}
