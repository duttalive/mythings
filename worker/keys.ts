import { type Context, Hono } from "hono";
import type { z } from "zod";
import {
	confirmPasswordSchema,
	type KeyBundle,
	rewrapKeysSchema,
	setKeysSchema,
} from "../shared/schema";
import { confirmPassword, requireUser } from "./auth";
import { ApiError, readJson } from "./http";
import { userContext } from "./sync";
import type { AppEnv } from "./types";

// End-to-end encryption keys (SPEC §8.5). The server only ever holds the data
// key sealed under keys derived on the device; it can't open either seal.
export const keys = new Hono<AppEnv>();

keys.use(requireUser);

type KeyRow = {
	version: 1;
	wrapped_by_password: string;
	wrapped_by_recovery: string;
};

keys.get("/", async (c) => {
	const row = await c.env.DB.prepare(
		"SELECT version, wrapped_by_password, wrapped_by_recovery FROM user_keys WHERE user_id = ?",
	)
		.bind(c.get("user").id)
		.first<KeyRow>();
	if (!row) throw new ApiError(404, "no_keys");
	return c.json({
		version: row.version,
		wrappedByPassword: row.wrapped_by_password,
		wrappedByRecovery: row.wrapped_by_recovery,
	} satisfies KeyBundle);
});

/** Tells the user's store (and its open sockets) whether text must arrive encrypted. */
async function setEncrypted(c: Context<AppEnv>, encrypted: boolean) {
	const user = { ...c.get("user"), encrypted };
	await c.env.USER_STORE.getByName(user.id).updateUser(userContext(user));
	return user;
}

/**
 * Turns encryption on with a new data key, or replaces the keys of an
 * encrypted account (a new recovery key, or starting over without the old
 * key). From here on the server rejects plain text.
 */
keys.put("/", async (c) => {
	const body: z.infer<typeof setKeysSchema> = await readJson(c, setKeysSchema);
	const user = c.get("user");
	if (c.env.AUTH_MODE === "access") throw new ApiError(400, "auth_mode_access");
	await confirmPassword(c, user.id, body.password, body.legacyPassword);
	const now = Date.now();
	await c.env.DB.batch([
		c.env.DB.prepare(
			`INSERT INTO user_keys (user_id, version, wrapped_by_password, wrapped_by_recovery, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET version = excluded.version,
			   wrapped_by_password = excluded.wrapped_by_password,
			   wrapped_by_recovery = excluded.wrapped_by_recovery,
			   updated_at = excluded.updated_at`,
		).bind(
			user.id,
			body.version,
			body.wrappedByPassword,
			body.wrappedByRecovery,
			now,
			now,
		),
		c.env.DB.prepare("UPDATE users SET encrypted = 1 WHERE id = ?").bind(
			user.id,
		),
	]);
	return c.json(await setEncrypted(c, true));
});

/** After a password reset: the data key, opened with the recovery key, sealed under the new password. */
keys.post("/rewrap", async (c) => {
	const body = await readJson(c, rewrapKeysSchema);
	const user = c.get("user");
	await confirmPassword(c, user.id, body.password, undefined);
	const result = await c.env.DB.prepare(
		"UPDATE user_keys SET wrapped_by_password = ?, updated_at = ? WHERE user_id = ?",
	)
		.bind(body.wrappedByPassword, Date.now(), user.id)
		.run();
	if (result.meta.changes !== 1) throw new ApiError(404, "no_keys");
	return c.json({ ok: true });
});

/**
 * Turns encryption off. The keys stay, so devices can still read what's
 * encrypted while they write it back as plain text.
 */
keys.post("/disable", async (c) => {
	const body = await readJson(c, confirmPasswordSchema);
	const user = c.get("user");
	await confirmPassword(c, user.id, body.password, body.legacyPassword);
	await c.env.DB.prepare("UPDATE users SET encrypted = 0 WHERE id = ?")
		.bind(user.id)
		.run();
	return c.json(await setEncrypted(c, false));
});
