// "Sign out", with a confirmation so a stray tap doesn't sign you out.

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useAuth } from "../auth/AuthGate";
import { useSyncStatus } from "../sync/hooks";

export function SignOutButton({ className }: { className?: string }) {
	const { user, signOut } = useAuth();
	const { pending } = useSyncStatus();
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<Dialog.Trigger asChild>
				<button type="button" className={className}>
					Sign out
				</button>
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/40" />
				<Dialog.Content
					role="alertdialog"
					className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 animate-fade-in rounded-2xl bg-[var(--card)] p-5 text-[var(--fg)] shadow-[var(--card-shadow)] ring-1 ring-[var(--border)] outline-none"
				>
					<Dialog.Title className="text-base font-semibold">
						Sign out of mythings?
					</Dialog.Title>
					<Dialog.Description className="mt-2 text-sm text-[var(--fg-muted)]">
						You're signed in as {user.email}. You'll need your password to sign
						back in on this device.
						{pending > 0 &&
							` ${pending} change${pending === 1 ? " hasn't" : "s haven't"} synced yet; ${pending === 1 ? "it stays" : "they stay"} on this device and will sync when you sign back in.`}
					</Dialog.Description>
					<div className="mt-5 flex justify-end gap-2">
						<Dialog.Close asChild>
							<button
								type="button"
								// The safe choice is the default.
								// biome-ignore lint/a11y/noAutofocus: focus the non-destructive action
								autoFocus
								className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-coarse:px-4 pointer-coarse:py-2.5"
							>
								Cancel
							</button>
						</Dialog.Close>
						<button
							type="button"
							disabled={busy}
							onClick={async () => {
								setBusy(true);
								try {
									await signOut();
								} finally {
									setBusy(false);
									setOpen(false);
								}
							}}
							className="rounded-lg bg-overdue px-3 py-1.5 text-sm font-medium text-on-overdue hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 pointer-coarse:px-4 pointer-coarse:py-2.5"
						>
							{busy ? "Signing out…" : "Sign out"}
						</button>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
