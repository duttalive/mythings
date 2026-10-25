import { anytime } from "../../shared/views";
import { LayersIcon } from "../components/icons";
import {
	Empty,
	GroupedListView,
	isEmptyGroupedList,
	ListPage,
} from "../components/ListPage";
import { useFilteredContext, useListData } from "../data";

export function AnytimePage() {
	const { data } = useListData();
	const list = anytime(data, useFilteredContext());
	return (
		<ListPage
			title="Anytime"
			icon={<LayersIcon className="size-7 text-teal-600" />}
			filterable
		>
			{isEmptyGroupedList(list) ? (
				<Empty>Nothing to do anytime.</Empty>
			) : (
				<GroupedListView list={list} showStar />
			)}
		</ListPage>
	);
}
