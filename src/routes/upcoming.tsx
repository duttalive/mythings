import { parseLocalDate } from "../../shared/dates";
import { type UpcomingGroup, upcoming } from "../../shared/views";
import { CalendarIcon } from "../components/icons";
import { ListPage, Section } from "../components/ListPage";
import { EntryRow, RowList } from "../components/rows";
import { useFilteredContext, useListData } from "../data";
import { monthLabel, rangeLabel, weekdayName } from "../lib/format";

export function UpcomingPage() {
	const { data } = useListData();
	const ctx = useFilteredContext();
	const groups = upcoming(data, ctx);

	const title = (group: UpcomingGroup) => {
		if (group.kind === "day") {
			const tomorrow = group === groups[0];
			return (
				<>
					<span className="w-7 text-2xl font-bold tabular-nums">
						{parseLocalDate(group.date).day}
					</span>
					<span className="text-[var(--fg-muted)]">
						{tomorrow ? "Tomorrow" : weekdayName(group.date)}
					</span>
				</>
			);
		}
		if (group.kind === "restOfMonth")
			return rangeLabel(group.from, group.to, ctx.today);
		return monthLabel(group.month, ctx.today);
	};

	return (
		<ListPage
			title="Upcoming"
			icon={<CalendarIcon className="size-7 text-overdue" />}
			filterable
		>
			{groups.map((group, i) => (
				<Section
					key={
						group.kind === "day" ? group.date : `${group.kind}-${group.month}`
					}
					title={title(group)}
					className={i === 0 ? "" : group.kind === "day" ? "mt-6" : "mt-10"}
				>
					{group.entries.length > 0 && (
						<RowList>
							{group.entries.map((entry) => (
								<EntryRow
									key={entry.item.id}
									entry={entry}
									showContainer
									date={group.kind === "day" ? undefined : entry.date}
								/>
							))}
						</RowList>
					)}
				</Section>
			))}
		</ListPage>
	);
}
