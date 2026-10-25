// Sending Web Push notifications (SPEC §9).

import {
	buildPushPayload,
	type PushSubscription,
} from "@block65/webcrypto-web-push";

export type PushNotice = {
	title: string;
	body: string;
	/** Where clicking the notification opens. */
	url: string;
	/** Notifications with the same tag replace each other. */
	tag: string;
};

type SubscriptionRow = {
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
};

/**
 * Sends each notice to every subscription of the user. Subscriptions the push
 * service says are gone (404/410) are deleted. Returns how many were delivered.
 */
export async function sendPush(
	env: Env,
	userId: string,
	notices: PushNotice[],
): Promise<number> {
	if (notices.length === 0) return 0;
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
		console.warn(
			"Web Push isn't configured (VAPID keys missing); skipping reminders",
		);
		return 0;
	}
	const { results } = await env.DB.prepare(
		"SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
	)
		.bind(userId)
		.all<SubscriptionRow>();
	const vapid = {
		subject: env.VAPID_SUBJECT,
		publicKey: env.VAPID_PUBLIC_KEY,
		privateKey: env.VAPID_PRIVATE_KEY,
	};

	let delivered = 0;
	for (const row of results) {
		const subscription: PushSubscription = {
			endpoint: row.endpoint,
			expirationTime: null,
			keys: { p256dh: row.p256dh, auth: row.auth },
		};
		for (const notice of notices) {
			try {
				const payload = await buildPushPayload(
					{ data: notice, options: { ttl: 60 * 60, urgency: "high" } },
					subscription,
					vapid,
				);
				const res = await fetch(row.endpoint, payload);
				if (res.status === 404 || res.status === 410) {
					await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?")
						.bind(row.id)
						.run();
					break;
				}
				if (res.ok) delivered++;
				else
					console.warn(
						`Push to ${new URL(row.endpoint).host} failed: ${res.status}`,
					);
			} catch (err) {
				console.warn("Push failed", err);
			}
		}
	}
	return delivered;
}
