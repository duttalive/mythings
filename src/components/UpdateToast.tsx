import { useEffect } from "react";
import { APP_VERSION } from "../changelog";
import { usePwaState } from "../pwa/register";

/** "Updated to version N" after an automatic update, or a brief "Ready to work offline". */
export function UpdateToast() {
	const { updated, offlineReady, dismiss } = usePwaState();
	const visible = updated || offlineReady;

	useEffect(() => {
		if (!visible) return;
		const timer = setTimeout(dismiss, updated ? 8000 : 4000);
		return () => clearTimeout(timer);
	}, [visible, updated, dismiss]);

	if (!visible) return null;
	return (
		<div
			role="status"
			className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-5 z-40 flex max-md:right-24 animate-slide-up items-center gap-3 rounded-xl bg-[var(--card)] px-4 py-2.5 text-sm shadow-[var(--card-shadow)] ring-1 ring-[var(--border)]"
		>
			{updated ? (
				<>
					<span>Updated to version {APP_VERSION}.</span>
					<a
						href="/changelog"
						className="font-medium text-accent hover:underline"
					>
						What's new
					</a>
					<button
						type="button"
						onClick={dismiss}
						aria-label="Dismiss"
						className="text-[var(--fg-muted)] hover:text-[var(--fg)]"
					>
						×
					</button>
				</>
			) : (
				<span>Ready to work offline.</span>
			)}
		</div>
	);
}
