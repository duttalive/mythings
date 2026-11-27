import { anytime } from "../../shared/views";
import { LayersIcon } from "../components/icons";
import {
	Empty,
	GroupedListView,
	isEmptyGroupedList,
	ListPage,
} from "../components/ListPage";
import { useFilteredContext, useListData } from "../data";
import { VIEWS } from "../lib/views";

export function AnytimePage() {
	const { data } = useListData();
	const list = anytime(data, useFilteredContext());
	return (
		<ListPage
			title="Anytime"
			icon={<LayersIcon className="size-7 text-anytime" />}
			description={VIEWS.anytime.description}
			filterable
		>
			{isEmptyGroupedList(list) ? (
				<Empty icon={VIEWS.anytime.icon("size-10")}>
					Nothing to do anytime.
				</Empty>
			) : (
				<GroupedListView list={list} showStar />
			)}
		</ListPage>
	);
}
