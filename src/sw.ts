/// <reference lib="webworker" />
// Service worker (SPEC §11): precached app shell so the app opens offline,
// network-only API, reminder notifications (SPEC §9), and Background Sync of
// changes made offline (SPEC §7.2).

import {
	cleanupOutdatedCaches,
	createHandlerBoundToURL,
	precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import type { Me } from "../shared/schema";
import { openLocalDb } from "./db/local";
import { flushOutbox, OUTBOX_SYNC_TAG, syncLockName } from "./sync/outbox";
import { HttpTransport } from "./sync/transport";

declare const self: ServiceWorkerGlobalScope & {
	__WB_MANIFEST: (string | { url: string; revision: string | null })[];
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Every in-app URL is the single-page app; /api/* is left alone (network only).
registerRoute(
	new NavigationRoute(createHandlerBoundToURL("index.html"), {
		denylist: [/^\/api\//],
	}),
);

// A new version waits until the page says it's fine to take over (see src/pwa/register.ts).
self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});
self.addEventListener("activate", (event) =>
	event.waitUntil(self.clients.claim()),
);

type Notice = { title?: string; body?: string; url?: string; tag?: string };

self.addEventListener("push", (event) => {
	let data: Notice = {};
	try {
		data = event.data ? (event.data.json() as Notice) : {};
	} catch {
		data = { body: event.data?.text() };
	}
	event.waitUntil(
		self.registration.showNotification(data.title || "Reminder", {
			body: data.body || "",
			tag: data.tag,
			icon: "/pwa-192x192.png",
			badge: "/pwa-64x64.png",
			data: { url: data.url || "/today" },
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const target = new URL(
		(event.notification.data as { url?: string } | null)?.url || "/today",
		self.location.origin,
	);
	// Only ever opens a page of this app.
	const url =
		target.origin === self.location.origin
			? target.href
			: new URL("/today", self.location.origin).href;
	event.waitUntil(
		(async () => {
			const windows = await self.clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});
			const existing = windows.find(
				(client) => new URL(client.url).origin === self.location.origin,
			);
			if (existing) {
				await existing.focus();
				await existing.navigate(url);
				return;
			}
			await self.clients.openWindow(url);
		})(),
	);
});

// Background Sync (best effort; Chromium only). The page registers it when
// changes are stuck offline; if the app is closed by the time the connection
// returns, the worker sends them. An open app syncs by itself.
type SyncEvent = ExtendableEvent & { tag: string };

self.addEventListener("sync", ((event: SyncEvent) => {
	if (event.tag === OUTBOX_SYNC_TAG) event.waitUntil(flushInBackground());
}) as EventListener);

async function flushInBackground(): Promise<void> {
	const windows = await self.clients.matchAll({ type: "window" });
	if (windows.length > 0) return;
	// Throws while still offline, so the browser tries again later.
	const res = await fetch("/api/me");
	if (res.status === 401) return;
	if (!res.ok) throw new Error(`Server responded ${res.status}`);
	// Only the signed-in user's changes: the session cookie decides whose account they reach.
	const user = (await res.json()) as Me;
	const name = `mythings-${user.id}`;
	if (!(await indexedDB.databases()).some((d) => d.name === name)) return;
	const db = openLocalDb(user.id);
	const transport = new HttpTransport();
	try {
		await navigator.locks.request(syncLockName(db), async () => {
			const rejected = await flushOutbox(db, (ops) => transport.push(ops));
			if (rejected.length > 0)
				console.warn("Changes rejected by the server", rejected);
		});
	} finally {
		db.close();
	}
}
