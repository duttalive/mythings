import { inbox } from "../../shared/views";
import { InboxIcon } from "../components/icons";
import { Empty, ListPage } from "../components/ListPage";
import { RowList, TodoRow } from "../components/rows";
import { useListData } from "../data";
import { placed, SortableList } from "../dnd/sortable";
import { VIEWS } from "../lib/views";

export function InboxPage() {
	// The Inbox has no filter bar: it's where everything starts.
	const { data, ctx } = useListData();
	const todos = inbox(data, ctx);
	return (
		<ListPage
			title="Inbox"
			icon={<InboxIcon className="size-7 text-accent" />}
			description={VIEWS.inbox.description}
		>
			{todos.length === 0 ? (
				<Empty>Your Inbox is empty.</Empty>
			) : (
				<SortableList
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
