// Limits kept in D1 because they outlast the Rate Limiting binding's
// one-minute window: how often an address gets account emails, and the lock
// after repeated failed sign-ins (SPEC §8).

import { ApiError } from "./http";
import type { AppEnv } from "./types";

type Env = AppEnv["Bindings"];

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Time between two emails of one kind to one address. */
export const EMAIL_COOLDOWN_MS = MINUTE_MS;
/** Emails of one kind to one address per 24 hours. */
export const EMAILS_PER_DAY = 5;

/** Failed sign-ins in a row before an email's password sign-in is locked. */
export const LOGIN_FAILURES_BEFORE_LOCK = 10;
export const LOGIN_LOCK_MS = 15 * MINUTE_MS;

/**
 * Counts an email of `kind` to `email`, or rejects with 429 if one went out
 * less than a minute ago (`too_many_attempts`) or the day's allowance is used
 * up (`too_many_emails`). Counted per address whether or not it has an
 * account, so the answer doesn't reveal which emails are registered.
 */
export async function countEmail(
	env: Env,
	kind: "signup" | "reset",
	email: string,
): Promise<void> {
	const now = Date.now();
	const dayAgo = now - DAY_MS;
	// One statement, so parallel requests can't both slip under the limit.
	// In SET and WHERE, columns are the row's values before this update.
	const [, counted] = await env.DB.batch([
		env.DB.prepare("DELETE FROM email_sends WHERE last_sent_at <= ?").bind(
			dayAgo,
		),
		env.DB.prepare(
			`INSERT INTO email_sends (email, kind, window_start, sends, last_sent_at)
			 VALUES (?1, ?2, ?3, 1, ?3)
			 ON CONFLICT(email, kind) DO UPDATE SET
			   window_start = CASE WHEN window_start <= ?4 THEN ?3 ELSE window_start END,
			   sends = CASE WHEN window_start <= ?4 THEN 1 ELSE sends + 1 END,
			   last_sent_at = ?3
			 WHERE last_sent_at <= ?5 AND (window_start <= ?4 OR sends < ?6)
			 RETURNING sends`,
		).bind(email, kind, now, dayAgo, now - EMAIL_COOLDOWN_MS, EMAILS_PER_DAY),
	]);
	if (counted?.results.length) return;
	const row = await env.DB.prepare(
		"SELECT last_sent_at FROM email_sends WHERE email = ? AND kind = ?",
	)
		.bind(email, kind)
		.first<{ last_sent_at: number }>();
	throw new ApiError(
		429,
		row && row.last_sent_at > now - EMAIL_COOLDOWN_MS
			? "too_many_attempts"
			: "too_many_emails",
	);
}

/** Rejects with 429 `login_locked` while the email's password sign-in is locked. */
export async function checkLoginLock(env: Env, email: string): Promise<void> {
	const row = await env.DB.prepare(
		"SELECT locked_until FROM login_failures WHERE email = ?",
	)
		.bind(email)
		.first<{ locked_until: number }>();
	if (row && row.locked_until > Date.now())
		throw new ApiError(429, "login_locked");
}

/** Counts a failed sign-in; the tenth in a row locks the email for 15 minutes. */
export async function recordLoginFailure(
	env: Env,
	email: string,
): Promise<void> {
	await env.DB.prepare(
		`INSERT INTO login_failures (email, failures, locked_until) VALUES (?1, 1, 0)
		 ON CONFLICT(email) DO UPDATE SET
		   failures = CASE WHEN failures + 1 >= ?2 THEN 0 ELSE failures + 1 END,
		   locked_until = CASE WHEN failures + 1 >= ?2 THEN ?3 ELSE locked_until END`,
	)
		.bind(email, LOGIN_FAILURES_BEFORE_LOCK, Date.now() + LOGIN_LOCK_MS)
		.run();
}

/** A successful sign-in or a password reset starts the count over. */
export function clearLoginFailures(env: Env, email: string) {
	return env.DB.prepare("DELETE FROM login_failures WHERE email = ?").bind(
		email,
	);
}
