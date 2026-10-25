import { Link } from "@tanstack/react-router";
import { Empty, ListPage } from "../components/ListPage";

export function Missing({ what }: { what: string }) {
	return (
		<ListPage title="Not found">
			<Empty>
				This {what} doesn't exist.{" "}
				<Link to="/today" className="text-accent hover:underline">
					Go to Today
				</Link>
			</Empty>
		</ListPage>
	);
}

export function NotFound() {
	return <Missing what="page" />;
}
