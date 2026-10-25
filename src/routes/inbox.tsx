import { inbox } from "../../shared/views";
import { InboxIcon } from "../components/icons";
import { Empty, ListPage } from "../components/ListPage";
import { RowList, TodoRow } from "../components/rows";
import { useFilteredContext, useListData, useTagFilter } from "../data";
import { placed, SortableList } from "../dnd/sortable";

export function InboxPage() {
	const { data } = useListData();
	const todos = inbox(data, useFilteredContext());
	const filtering = useTagFilter().length > 0;
	return (
		<ListPage
			title="Inbox"
			icon={<InboxIcon className="size-7 text-accent" />}
			filterable
		>
			{todos.length === 0 ? (
				<Empty>Your Inbox is empty.</Empty>
			) : (
				<SortableList
					disabled={filtering}
					list={{
						id: "inbox",
						accepts: ["todo"],
						keyField: "sortKey",
						items: placed("todo", todos, "sortKey"),
					}}
				>
					<RowList label="Inbox">
						{todos.map((todo) => (
							<TodoRow key={todo.id} todo={todo} />
						))}
					</RowList>
				</SortableList>
			)}
		</ListPage>
	);
}
