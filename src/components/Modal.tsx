import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

/** A centered dialog near the top of the screen (Quick Find, Quick Entry, help). */
export function Modal({
	title,
	description,
	onClose,
	children,
	width = "max-w-xl",
	hideTitle = false,
}: {
	title: string;
	description?: string;
	onClose: () => void;
	children: ReactNode;
	width?: string;
	hideTitle?: boolean;
}) {
	return (
		<Dialog.Root open onOpenChange={(open) => !open && onClose()}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-scrim" />
				<Dialog.Content
					aria-describedby={description ? undefined : undefined}
					// Centred without a transform, which would trap the bottom sheets of pickers inside the dialog.
					className={`fixed inset-x-0 top-[12vh] z-50 mx-auto animate-fade-in w-[calc(100vw-2rem)] ${width} rounded-2xl bg-[var(--card)] text-[var(--fg)] shadow-[var(--card-shadow)] ring-1 ring-[var(--border)] outline-none`}
				>
					<Dialog.Title
						className={
							hideTitle ? "sr-only" : "px-4 pt-4 text-base font-semibold"
						}
					>
						{title}
					</Dialog.Title>
					<Dialog.Description className="sr-only">
						{description ?? title}
					</Dialog.Description>
					{children}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
