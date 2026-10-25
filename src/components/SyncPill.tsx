import { useSyncStatus } from "../sync/hooks";

/** Small sync indicator for the sidebar footer. */
export function SyncPill() {
	const { state, pending, live } = useSyncStatus();
	const label =
		state === "offline"
			? pending
				? `Offline · ${pending} change${pending === 1 ? "" : "s"} will sync`
				: "Offline"
			: state === "error"
				? "Sync error"
				: pending > 0 || state === "syncing"
					? `Syncing${pending ? ` · ${pending}` : ""}…`
					: "Synced";
	const dot =
		state === "offline" || state === "error"
			? "bg-overdue"
			: pending > 0
				? "bg-today"
				: "bg-done";
	return (
		<span
			className="flex items-center gap-1.5"
			data-testid="sync-status"
			data-live={live}
			title={
				live ? "Live updates on" : "Live updates off — checking periodically"
			}
			role="status"
		>
			<span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
			{label}
		</span>
	);
}
