import * as Dialog from "@radix-ui/react-dialog";
import {
	buttonClass,
	dialogContentClass,
	dialogOverlayClass,
	ghostButtonClass,
	secondaryButtonClass,
} from "./ui";

/** Asks what to do with a project's remaining to-dos when it's completed (SPEC §5.2). */
export function CompleteProjectDialog({
	open,
	projectTitle,
	remaining,
	onChoose,
	onCancel,
}: {
	open: boolean;
	projectTitle: string;
	remaining: number;
	onChoose: (status: "completed" | "canceled") => void;
	onCancel: () => void;
}) {
	return (
		<Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
			<Dialog.Portal>
				<Dialog.Overlay className={dialogOverlayClass} />
				<Dialog.Content className={dialogContentClass}>
					<Dialog.Title className="text-base font-semibold break-words">
						Complete “{projectTitle}”?
					</Dialog.Title>
					<Dialog.Description className="mt-2 text-sm text-[var(--fg-muted)]">
						This project still has {remaining} open{" "}
						{remaining === 1 ? "task" : "tasks"}. What should happen to{" "}
						{remaining === 1 ? "it" : "them"}?
					</Dialog.Description>
					<div className="mt-5 flex flex-col gap-2">
						<button
							type="button"
							onClick={() => onChoose("completed")}
							className={buttonClass}
						>
							Mark remaining as Completed
						</button>
						<button
							type="button"
							onClick={() => onChoose("canceled")}
							className={secondaryButtonClass}
						>
							Mark remaining as Canceled
						</button>
						<Dialog.Close className={ghostButtonClass}>Cancel</Dialog.Close>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
