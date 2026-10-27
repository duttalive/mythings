import { type TrashEntry, trash } from "../../shared/views";
import { useConfirmDelete } from "../components/ConfirmDelete";
import { AreaIcon, RestoreIcon, TrashIcon } from "../components/icons";
import { Empty, ListPage } from "../components/ListPage";
import { ProjectRow, RowList, TodoRow } from "../components/rows";
import { useListData } from "../data";
import { emptyTrashRequest } from "../editing/deleteRequests";
import { useOps } from "../sync/hooks";

const UNTITLED: Record<TrashEntry["kind"], string> = {
	todo: "New To-Do",
	project: "New Project",
	heading: "New Heading",
	area: "New Area",
};

export function TrashPage() {
	const { data } = useListData();
	const ops = useOps();
	const entries = trash(data);
	const confirmDelete = useConfirmDelete();

	const restore = (entry: TrashEntry) => {
		void ops.restore(entry.kind, entry.item.id).catch(console.error);
	};

	const emptyTrash = async () => {
		if (!(await confirmDelete(emptyTrashRequest(entries.length)))) return;
		// Top-level entries only: purging a parent takes its children with it.
		await ops
			.apply(
				entries.map((entry) => ({
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
			className="shrink-0 rounded-md p-1 text-[var(--fg-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--selected)] hover:text-[var(--fg)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent [@media(hover:none)]:opacity-100"
		>
			<RestoreIcon className="size-4" />
		</button>
	);

	return (
		<ListPage
			title="Trash"
			icon={<TrashIcon className="size-7 text-[var(--fg-muted)]" />}
			header={
				entries.length > 0 && (
					<div className="mt-3 flex items-center gap-2 text-sm">
						<button
							type="button"
							onClick={() => void emptyTrash()}
							className="rounded-md border border-[var(--border)] px-2.5 py-1 hover:bg-[var(--hover)]"
						>
							Empty Trash
						</button>
					</div>
				)
			}
		>
			{entries.length === 0 ? (
				<Empty>Trash is empty.</Empty>
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
										className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--hover)]"
									>
										{entry.kind === "area" ? (
											<AreaIcon className="size-[18px] text-[var(--fg-muted)]" />
										) : (
											<span className="w-[18px]" aria-hidden />
										)}
										<span className="font-medium">
											{entry.item.title ||
												(entry.kind === "area" ? "New Area" : "New Heading")}
										</span>
										<span className="flex-1 text-xs text-[var(--fg-muted)]">
											{entry.kind === "area" ? "Area" : "Heading"}
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
