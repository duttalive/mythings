import { useEffect } from "react";
import { APP_VERSION } from "../changelog";
import { usePwaState } from "../pwa/register";
import { CrossIcon } from "./icons";
import { linkClass } from "./ui";

/** "Updated to version N" after an automatic update, or a brief "Ready to work offline". */
export function UpdateToast() {
	const { updated, offlineReady, dismiss } = usePwaState();
	const visible = updated || offlineReady;

	useEffect(() => {
		if (!visible) return;
		const timer = setTimeout(dismiss, updated ? 8000 : 4000);
		return () => clearTimeout(timer);
	}, [visible, updated, dismiss]);

	return (
		// Always in the page, so screen readers announce the notice when it appears.
		<div
			role="status"
			aria-live="polite"
			className="pointer-events-none fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-[calc(1.25rem+env(safe-area-inset-left))] z-40 flex max-md:right-24"
		>
			{visible && (
				<div className="pointer-events-auto flex animate-slide-up items-center gap-3 rounded-xl bg-[var(--card)] py-1.5 pr-1.5 pl-4 text-sm shadow-[var(--card-shadow)] ring-1 ring-[var(--border)]">
					{updated ? (
						<>
							<span>Updated to version {APP_VERSION}.</span>
							<a href="/changelog" className={linkClass}>
								What's new
							</a>
							<button
								type="button"
								onClick={dismiss}
								aria-label="Dismiss"
								className="rounded-md p-1.5 text-[var(--fg-muted)] transition-colors duration-150 hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-offset-0 pointer-coarse:p-3"
							>
								<CrossIcon className="size-3.5" />
							</button>
						</>
					) : (
						<span className="py-1 pr-2.5">Ready to work offline.</span>
					)}
				</div>
			)}
		</div>
	);
}
