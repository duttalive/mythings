// Deadlines (as in Things): every open to-do and project with a deadline,
// soonest first. Not in the sidebar; found by typing "Deadlines" in Quick Find.

import { useState } from "react";
import { type DeadlineGroup, deadlines } from "../../shared/views";
import { FlagIcon, SearchIcon } from "../components/icons";
import { Empty, ListPage, Section } from "../components/ListPage";
import { EntryRow, RowList } from "../components/rows";
import { useListData } from "../data";
import { dayLabel } from "../lib/format";

export function DeadlinesPage() {
	const { data, ctx } = useListData();
	const [query, setQuery] = useState("");
	const groups = deadlines(data, ctx, query);

	const title = (group: DeadlineGroup) =>
		group.kind === "overdue" ? (
			<span className="text-overdue">Overdue</span>
		) : (
			dayLabel(group.date, ctx.today)
		);

	return (
		<ListPage
			title="Deadlines"
			icon={<FlagIcon className="size-7 text-overdue" />}
			header={
				<div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 focus-within:border-accent">
					<SearchIcon className="size-4 shrink-0 text-[var(--fg-muted)]" />
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							// Escape clears the search before anything else.
							if (e.key === "Escape" && query) {
								e.stopPropagation();
								setQuery("");
							}
						}}
						placeholder="Search deadlines"
						aria-label="Search deadlines"
						className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none pointer-coarse:py-2.5"
					/>
				</div>
			}
		>
			{groups.length === 0 && (
				<Empty>
					{query.trim()
						? `No deadlines match “${query.trim()}”.`
						: "Nothing has a deadline."}
				</Empty>
			)}
			{groups.map((group, i) => (
				<Section
					key={group.kind === "overdue" ? "overdue" : group.date}
					title={title(group)}
					className={i === 0 ? "" : "mt-6"}
				>
					<RowList label={group.kind === "overdue" ? "Overdue" : undefined}>
						{group.entries.map((entry) => (
							<EntryRow key={entry.item.id} entry={entry} showContainer />
						))}
					</RowList>
				</Section>
			))}
		</ListPage>
	);
}
