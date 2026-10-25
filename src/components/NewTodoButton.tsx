import { useNewTodo } from "../editing/useNewTodo";
import { PlusIcon } from "./icons";

/** Adds a to-do to the current list and opens it for editing. */
export function NewTodoButton() {
	const { available, create } = useNewTodo();
	if (!available) return null;
	return (
		<button
			type="button"
			onClick={() => void create().catch(console.error)}
			aria-label="New To-Do"
			title="New To-Do"
			className="fixed right-[calc(1.25rem+env(safe-area-inset-right))] bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-20 flex size-12 items-center justify-center rounded-full bg-accent text-on-accent shadow-[var(--card-shadow)] transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none md:right-8 md:bottom-8 pointer-coarse:size-14"
		>
			<PlusIcon className="size-6" />
		</button>
	);
}
