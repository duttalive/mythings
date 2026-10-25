import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { randomToken, sha256Hex } from "./crypto";
import type { AppEnv, UserRow } from "./types";

export const SESSION_COOKIE = "mt_session";
const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;
// Sliding expiry: extend at most once a day so reads don't write on every request.
const REFRESH_AFTER_MS = DAY_MS;

/** The cookie's attributes, the same when it's set and when it's cleared. */
const cookieOptions = (c: Context<AppEnv>) =>
	({
		path: "/",
		httpOnly: true,
		// Plain-http localhost in dev can't hold Secure cookies in every browser.
		secure: new URL(c.req.url).protocol === "https:",
		sameSite: "Lax",
	}) as const;

function writeCookie(c: Context<AppEnv>, token: string) {
	setCookie(c, SESSION_COOKIE, token, {
		...cookieOptions(c),
		maxAge: SESSION_TTL_MS / 1000,
	});
}

export async function createSession(
	c: Context<AppEnv>,
	userId: string,
): Promise<void> {
	const token = randomToken();
	const now = Date.now();
	await c.env.DB.batch([
		c.env.DB.prepare(
			"DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?",
		).bind(userId, now),
		c.env.DB.prepare(
			"INSERT INTO sessions (token_hash, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)",
		).bind(
			await sha256Hex(token),
			userId,
			now + SESSION_TTL_MS,
			c.req.header("user-agent") ?? null,
		),
	]);
	writeCookie(c, token);
}

export async function getSessionUser(
	c: Context<AppEnv>,
): Promise<UserRow | null> {
	const token = getCookie(c, SESSION_COOKIE);
	if (!token) return null;

	const tokenHash = await sha256Hex(token);
	const now = Date.now();
	const row = await c.env.DB.prepare(
		`SELECT u.*, s.expires_at AS session_expires_at
		 FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.token_hash = ? AND s.expires_at > ?`,
	)
		.bind(tokenHash, now)
		.first<UserRow & { session_expires_at: number }>();
	if (!row) return null;

	if (row.session_expires_at - now < SESSION_TTL_MS - REFRESH_AFTER_MS) {
		await c.env.DB.prepare(
			"UPDATE sessions SET expires_at = ? WHERE token_hash = ?",
		)
			.bind(now + SESSION_TTL_MS, tokenHash)
			.run();
		writeCookie(c, token);
	}

	const { session_expires_at: _, ...user } = row;
	return user;
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
	const token = getCookie(c, SESSION_COOKIE);
	if (token) {
		await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
			.bind(await sha256Hex(token))
			.run();
	}
	deleteCookie(c, SESSION_COOKIE, cookieOptions(c));
}

/** Ends every session of the user except the one making this request. */
export async function destroyOtherSessions(
	c: Context<AppEnv>,
	userId: string,
): Promise<void> {
	const token = getCookie(c, SESSION_COOKIE);
	await c.env.DB.prepare(
		"DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
	)
		.bind(userId, token ? await sha256Hex(token) : "")
		.run();
}

/** Ends every session of the user, including this one. */
export async function destroyUserSessions(
	c: Context<AppEnv>,
	userId: string,
): Promise<void> {
	await c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?")
		.bind(userId)
		.run();
	deleteCookie(c, SESSION_COOKIE, cookieOptions(c));
}
