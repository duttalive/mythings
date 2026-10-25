import { Hono } from "hono";
import { ulid } from "ulid";
import { z } from "zod";
import { requireUser } from "./auth";
import { ApiError, readJson } from "./http";
import type { AppEnv } from "./types";

const subscriptionSchema = z.object({
	endpoint: z.url().refine((url) => url.startsWith("https://"), {
		message: "Push endpoints are https",
	}),
	keys: z.object({
		p256dh: z.string().min(1).max(200),
		auth: z.string().min(1).max(100),
	}),
});

export const notifications = new Hono<AppEnv>();

notifications.use(requireUser);

/** The VAPID public key, for PushManager.subscribe({ applicationServerKey }). */
notifications.get("/key", (c) =>
	c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || null }),
);

/**
 * Saves this browser's push subscription (re-subscribing just updates it).
 * An endpoint saved by another account stays theirs (409) until they
 * unsubscribe, so nobody can redirect someone else's reminders.
 */
notifications.post("/subscribe", async (c) => {
	const { endpoint, keys } = await readJson(c, subscriptionSchema);
	const { meta } = await c.env.DB.prepare(
		`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
		 WHERE push_subscriptions.user_id = excluded.user_id`,
	)
		.bind(
			ulid(),
			c.get("user").id,
			endpoint,
			keys.p256dh,
			keys.auth,
			Date.now(),
		)
		.run();
	if (meta.changes === 0) throw new ApiError(409, "endpoint_taken");
	return c.json({ ok: true }, 201);
});

notifications.delete("/subscribe", async (c) => {
	const { endpoint } = await readJson(c, z.object({ endpoint: z.string() }));
	await c.env.DB.prepare(
		"DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
	)
		.bind(endpoint, c.get("user").id)
		.run();
	return c.json({ ok: true });
});
