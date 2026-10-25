import { useState } from "react";
import { logbook } from "../../shared/views";
import { LogbookIcon } from "../components/icons";
import { Empty, ListPage, Section } from "../components/ListPage";
import { EntryRow, RowList } from "../components/rows";
import { useFilteredContext, useListData } from "../data";
import { dayLabel } from "../lib/format";

const PAGE_SIZE = 100;

export function LogbookPage() {
	const { data } = useListData();
	const ctx = useFilteredContext();
	const [limit, setLimit] = useState(PAGE_SIZE);
	const { groups, nextCursor } = logbook(data, ctx, { limit });
	return (
		<ListPage
			title="Logbook"
			icon={<LogbookIcon className="size-7 text-done" />}
			filterable
		>
			{groups.length === 0 ? (
				<Empty>Completed to-dos show up here.</Empty>
			) : (
				groups.map((group, i) => (
					<Section
						key={group.date}
						title={dayLabel(group.date, ctx.today)}
						className={i === 0 ? "" : "mt-8"}
					>
						<RowList>
							{group.entries.map((entry) => (
								<EntryRow
									key={entry.item.id}
									entry={entry}
									showContainer
									logbook
								/>
							))}
						</RowList>
					</Section>
				))
			)}
			{nextCursor && (
				<div className="mt-6 text-center">
					<button
						type="button"
						onClick={() => setLimit((n) => n + PAGE_SIZE)}
						className="rounded-md border border-[var(--border)] px-3 py-1 text-sm hover:bg-[var(--hover)]"
					>
						Show more
					</button>
				</div>
			)}
		</ListPage>
	);
}
