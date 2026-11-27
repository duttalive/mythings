import { someday } from "../../shared/views";
import { BoxIcon } from "../components/icons";
import {
	Empty,
	GroupedListView,
	isEmptyGroupedList,
	ListPage,
} from "../components/ListPage";
import { useFilteredContext, useListData } from "../data";
import { VIEWS } from "../lib/views";

export function SomedayPage() {
	const { data } = useListData();
	const list = someday(data, useFilteredContext());
	return (
		<ListPage
			title="Someday"
			icon={<BoxIcon className="size-7 text-amber-700" />}
			description={VIEWS.someday.description}
			filterable
		>
			{isEmptyGroupedList(list) ? (
				<Empty>Nothing set aside for someday.</Empty>
			) : (
				<GroupedListView list={list} />
			)}
		</ListPage>
	);
}
