// Every delete asks first. Deletes that go to Trash need one click on
// "Move to Trash"; permanent ones also need "I understand this can't be
// undone" ticked. Cancel has focus, so Enter or Escape keeps everything.

import * as Dialog from "@radix-ui/react-dialog";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useId,
	useRef,
	useState,
} from "react";

export type DeleteRequest = {
	/** e.g. Delete project “Taxes”? */
	title: string;
	/** What goes with it and where it ends up. */
	body: ReactNode;
	/** Can't be restored from Trash or undone. */
	permanent?: boolean;
	/** Defaults to "Move to Trash" (or "Delete Forever" when permanent). */
	confirmLabel?: string;
};

type Confirm = (request: DeleteRequest) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Resolves true once the person confirms, false if they cancel. */
export function useConfirmDelete(): Confirm {
	const confirm = useContext(ConfirmContext);
	if (!confirm)
		throw new Error(
			"useConfirmDelete must be used inside ConfirmDeleteProvider",
		);
	return confirm;
}

/** Shared wording: how many of something, e.g. "3 to-dos", "1 project". */
export const count = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;

export const quoted = (title: string, fallback: string) =>
	title.trim() ? `“${title.trim()}”` : fallback;

export function ConfirmDeleteProvider({ children }: { children: ReactNode }) {
	const [request, setRequest] = useState<DeleteRequest | null>(null);
	const [understood, setUnderstood] = useState(false);
	const resolver = useRef<((ok: boolean) => void) | null>(null);
	const cancelRef = useRef<HTMLButtonElement>(null);
	const checkId = useId();

	const confirm = useCallback<Confirm>((next) => {
		// A new request cancels one still open.
		resolver.current?.(false);
		setUnderstood(false);
		setRequest(next);
		return new Promise((resolve) => {
			resolver.current = resolve;
		});
	}, []);

	const finish = (ok: boolean) => {
		resolver.current?.(ok);
		resolver.current = null;
		setRequest(null);
	};

	const permanent = request?.permanent ?? false;
	const buttonBase =
		"rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-coarse:px-4 pointer-coarse:py-2.5";

	return (
		<ConfirmContext value={confirm}>
			{children}
			<Dialog.Root
				open={request !== null}
				onOpenChange={(open) => {
					if (!open) finish(false);
				}}
			>
				<Dialog.Portal>
					<Dialog.Overlay
						data-dialog-overlay
						className="fixed inset-0 z-50 animate-fade-in bg-black/40"
					/>
					<Dialog.Content
						role="alertdialog"
						// Cancel gets focus. A menu that just closed hands focus back to its
						// button on a timer, so take it after that.
						onOpenAutoFocus={(e) => {
							e.preventDefault();
							cancelRef.current?.focus();
							setTimeout(() => cancelRef.current?.focus(), 0);
						}}
						// Keep the to-do or popover underneath from reacting to these keys.
						onKeyDown={(e) => e.stopPropagation()}
						className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 animate-fade-in rounded-2xl bg-[var(--card)] p-5 text-[var(--fg)] shadow-[var(--card-shadow)] ring-1 ring-[var(--border)] outline-none"
					>
						<Dialog.Title className="text-base font-semibold break-words">
							{request?.title}
						</Dialog.Title>
						<Dialog.Description asChild>
							<div className="mt-2 text-sm text-[var(--fg-muted)]">
								{request?.body}
							</div>
						</Dialog.Description>
						{permanent && (
							<label
								htmlFor={checkId}
								className="mt-4 flex cursor-pointer items-center gap-2 text-sm pointer-coarse:py-1"
							>
								<input
									id={checkId}
									type="checkbox"
									checked={understood}
									onChange={(e) => setUnderstood(e.target.checked)}
									className="size-4 accent-[var(--overdue)]"
								/>
								I understand this can't be undone
							</label>
						)}
						<div className="mt-5 flex justify-end gap-2">
							<Dialog.Close asChild>
								<button
									ref={cancelRef}
									type="button"
									className={`${buttonBase} border border-[var(--border)] hover:bg-[var(--hover)]`}
								>
									Cancel
								</button>
							</Dialog.Close>
							<button
								type="button"
								disabled={permanent && !understood}
								onClick={() => finish(true)}
								className={`${buttonBase} bg-overdue text-on-overdue hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`}
							>
								{request?.confirmLabel ??
									(permanent ? "Delete Forever" : "Move to Trash")}
							</button>
						</div>
					</Dialog.Content>
				</Dialog.Portal>
			</Dialog.Root>
		</ConfirmContext>
	);
}
