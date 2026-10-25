// Asks the service worker to send queued changes once the connection is back,
// even if the app has been closed by then (SPEC §7.2, best effort).

import { OUTBOX_SYNC_TAG } from "../sync/outbox";

type SyncManager = { register(tag: string): Promise<void> };

export async function requestBackgroundSync(): Promise<void> {
	if (!("serviceWorker" in navigator)) return;
	const registration = (await Promise.race([
		navigator.serviceWorker.ready,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
	])) as (ServiceWorkerRegistration & { sync?: SyncManager }) | null;
	await registration?.sync?.register(OUTBOX_SYNC_TAG).catch(() => {});
}
