// Overdue: to-dos and projects whose deadline passed or whose planned day went
// by, most overdue first, one section per day they slipped. Today holds only
// today, so this is where everything that slipped waits to be dealt with.

import { diffDays } from "../../shared/dates";
import { overdue } from "../../shared/views";
import { FlagIcon } from "../components/icons";
import { Empty, ListPage, Section } from "../components/ListPage";
import { EntryRow, RowList } from "../components/rows";
import { useFilteredContext, useFiltering, useListData } from "../data";
import { dayLabel } from "../lib/format";
import { VIEWS } from "../lib/views";

function lateBy(days: number): string {
	return days === 1 ? "1 day overdue" : `${days} days overdue`;
}

export function OverduePage() {
	const { data, ctx } = useListData();
	const groups = overdue(data, useFilteredContext());
	const filtering = useFiltering();

	return (
		<ListPage
			title="Overdue"
			icon={<FlagIcon className="size-7 text-overdue" />}
			description={VIEWS.overdue.description}
			filterable
		>
			{groups.length === 0 ? (
				<Empty icon={VIEWS.overdue.icon("size-10")}>
					{filtering
						? "Nothing overdue matches these filters."
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
						<RowList label={`Overdue since ${dayLabel(group.date, ctx.today)}`}>
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
