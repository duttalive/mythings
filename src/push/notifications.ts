// Web Push on the client (SPEC §9): the service worker, the permission
// request (only when the user asks for a reminder), and keeping the server's
// copy of this browser's subscription up to date.

import { useCallback, useEffect, useState } from "react";
import { registerPwa } from "../pwa/register";

export type NotificationState =
	| "unsupported"
	| "default"
	| "granted"
	| "denied";

export function notificationState(): NotificationState {
	if (
		typeof window === "undefined" ||
		!("serviceWorker" in navigator) ||
		!("PushManager" in window) ||
		!("Notification" in window)
	) {
		return "unsupported";
	}
	return Notification.permission;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
	const base64 = value
		.replace(/-/g, "+")
		.replace(/_/g, "/")
		.padEnd(Math.ceil(value.length / 4) * 4, "=");
	return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** The service worker registration (registered by src/pwa/register.ts), once it's active. */
async function serviceWorker(): Promise<ServiceWorkerRegistration | null> {
	if (notificationState() === "unsupported") return null;
	registerPwa();
	// Never resolves if registration failed; don't hang reminders on it.
	return Promise.race([
		navigator.serviceWorker.ready,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
	]);
}

/** Subscribes this browser (if not already) and saves the subscription on the server. */
async function subscribe(): Promise<boolean> {
	const registration = await serviceWorker();
	if (!registration) return false;
	const { publicKey } = (await fetch("/api/push/key").then((r) =>
		r.json(),
	)) as { publicKey: string | null };
	if (!publicKey) return false;
	const subscription =
		(await registration.pushManager.getSubscription()) ??
		(await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: base64UrlToBytes(publicKey),
		}));
	const res = await fetch("/api/push/subscribe", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(subscription.toJSON()),
	});
	return res.ok;
}

/**
 * Before signing out: stops this browser's reminders for the account, so the
 * next person to use it doesn't see them (and can subscribe it themselves).
 */
export async function forgetPushSubscription(): Promise<void> {
	if (notificationState() === "unsupported") return;
	const registration = await navigator.serviceWorker.getRegistration();
	const subscription = await registration?.pushManager.getSubscription();
	if (!subscription) return;
	await fetch("/api/push/subscribe", {
		method: "DELETE",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ endpoint: subscription.endpoint }),
	});
	await subscription.unsubscribe();
}

/** Asks for permission (from a user gesture) and subscribes. */
export async function enableNotifications(): Promise<NotificationState> {
	if (notificationState() === "unsupported") return "unsupported";
	const permission = await Notification.requestPermission();
	if (permission === "granted")
		await subscribe().catch((err) =>
			console.warn("Push subscription failed", err),
		);
	return permission;
}

/** On start: if notifications are already allowed, make sure the server has this subscription. */
export async function syncPushSubscription(): Promise<void> {
	if (notificationState() === "granted")
		await subscribe().catch((err) =>
			console.warn("Push subscription failed", err),
		);
}

export function useNotificationState(): [
	NotificationState,
	() => Promise<void>,
] {
	const [state, setState] = useState<NotificationState>(notificationState);
	// The user can change the permission in browser settings at any time.
	useEffect(() => {
		const refresh = () => setState(notificationState());
		window.addEventListener("focus", refresh);
		return () => window.removeEventListener("focus", refresh);
	}, []);
	const enable = useCallback(
		async () => setState(await enableNotifications()),
		[],
	);
	return [state, enable];
}
