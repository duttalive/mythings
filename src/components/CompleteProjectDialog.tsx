import * as Dialog from "@radix-ui/react-dialog";

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
				<Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
				<Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--card)] p-5 text-[var(--fg)] shadow-[var(--card-shadow)] ring-1 ring-[var(--border)] outline-none">
					<Dialog.Title className="text-base font-semibold">
						Complete “{projectTitle}”?
					</Dialog.Title>
					<Dialog.Description className="mt-1.5 text-sm text-[var(--fg-muted)]">
						This project still has {remaining} open{" "}
						{remaining === 1 ? "to-do" : "to-dos"}. What should happen to{" "}
						{remaining === 1 ? "it" : "them"}?
					</Dialog.Description>
					<div className="mt-5 flex flex-col gap-2">
						<button
							type="button"
							onClick={() => onChoose("completed")}
							className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:opacity-90"
						>
							Mark remaining as Completed
						</button>
						<button
							type="button"
							onClick={() => onChoose("canceled")}
							className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium hover:bg-[var(--hover)]"
						>
							Mark remaining as Canceled
						</button>
						<Dialog.Close className="rounded-lg px-3 py-2 text-sm text-[var(--fg-muted)] hover:bg-[var(--hover)]">
							Cancel
						</Dialog.Close>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
