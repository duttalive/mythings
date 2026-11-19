// Overdue: to-dos and projects whose deadline has passed, most overdue first,
// one section per deadline day. They leave Today once the deadline passes
// (unless scheduled for today), so this is where they wait to be dealt with.

import { useMemo } from "react";
import { diffDays } from "../../shared/dates";
import { overdue, tagsInUse } from "../../shared/views";
import { FlagIcon } from "../components/icons";
import { Empty, ListPage, Section } from "../components/ListPage";
import { EntryRow, RowList } from "../components/rows";
import { useFilteredContext, useListData, useTagFilter } from "../data";
import { dayLabel } from "../lib/format";

function lateBy(days: number): string {
	return days === 1 ? "1 day overdue" : `${days} days overdue`;
}

export function OverduePage() {
	const { data, ctx } = useListData();
	const groups = overdue(data, useFilteredContext());
	// The tag bar offers the tags of what's overdue, filtered or not.
	const filterTags = useMemo(
		() =>
			tagsInUse(
				data,
				overdue(data, ctx).flatMap((g) => g.entries),
			),
		[data, ctx],
	);
	const filtering = useTagFilter().length > 0;

	return (
		<ListPage
			title="Overdue"
			icon={<FlagIcon className="size-7 text-overdue" />}
			filterable
			filterTags={filterTags}
		>
			{groups.length === 0 ? (
				<Empty>
					{filtering
						? "Nothing overdue has these tags."
						: "Nothing is overdue. Nice work."}
				</Empty>
			) : (
				groups.map((group, i) => (
					<Section
						key={group.date}
						title={
							<span className="text-overdue">
								{dayLabel(group.date, ctx.today)}
							</span>
						}
						accessory={
							<span className="ml-auto text-xs font-normal text-[var(--fg-muted)]">
								{lateBy(diffDays(group.date, ctx.today))}
							</span>
						}
						className={i === 0 ? "" : "mt-6"}
					>
						<RowList label={`Due ${dayLabel(group.date, ctx.today)}`}>
							{group.entries.map((entry) => (
								<EntryRow key={entry.item.id} entry={entry} showContainer />
							))}
						</RowList>
					</Section>
				))
			)}
		</ListPage>
	);
}
