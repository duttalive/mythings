// "Show N logged items" at the end of a project or area (as in Things): its
// completed and canceled items, which otherwise only appear in the Logbook,
// newest first with the day they were done.

import { useId, useState } from "react";
import { localDateOf } from "../../shared/dates";
import type { Entry } from "../../shared/views";
import { useListData } from "../data";
import { EntryRow, RowList } from "./rows";

export function LoggedItems({ entries }: { entries: Entry[] }) {
	const { ctx } = useListData();
	const [shown, setShown] = useState(false);
	const listId = useId();
	if (entries.length === 0) return null;
	const n = entries.length;
	return (
		<div className="mt-8">
			<button
				type="button"
				onClick={() => setShown((s) => !s)}
				aria-expanded={shown}
				aria-controls={shown ? listId : undefined}
				className="rounded px-2 py-1 text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-2.5"
			>
				{shown
					? `Hide logged ${n === 1 ? "item" : "items"}`
					: `Show ${n} logged ${n === 1 ? "item" : "items"}`}
			</button>
			{shown && (
				<div id={listId} className="mt-2">
					<RowList label="Logged items">
						{entries.map((entry) => (
							<EntryRow
								key={entry.item.id}
								entry={entry}
								logbook
								date={
									entry.item.completedAt === null
										? undefined
										: localDateOf(entry.item.completedAt, ctx.tz)
								}
							/>
						))}
					</RowList>
				</div>
			)}
		</div>
	);
}
