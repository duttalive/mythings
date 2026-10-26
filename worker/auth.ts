import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { ulid } from "ulid";
import {
	changePasswordSchema,
	credentialsSchema,
	forgotPasswordSchema,
	resetPasswordSchema,
	signupLinkSchema,
	signupSchema,
	verifySignupSchema,
} from "../shared/schema";
import { getAccessUser } from "./access";
import {
	getDummyHash,
	hashPassword,
	randomToken,
	sha256Hex,
	verifyPassword,
} from "./crypto";
import { ApiError, readJson } from "./http";
import {
	accountExistsMail,
	type Mail,
	resetPasswordMail,
	sendMail,
	signupLinkMail,
} from "./mail";
import {
	createSession,
	destroyOtherSessions,
	destroySession,
	destroyUserSessions,
	getSessionUser,
} from "./session";
import { type AppEnv, toMe, type UserRow } from "./types";

export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
	const row =
		c.env.AUTH_MODE === "access"
			? await getAccessUser(c)
			: await getSessionUser(c);
	if (!row) throw new ApiError(401, "unauthorized");
	c.set("user", toMe(row));
	await next();
});

/** Rejects password-auth routes when the app runs behind Cloudflare Access. */
const passwordModeOnly = createMiddleware<AppEnv>(async (c, next) => {
	if (c.env.AUTH_MODE === "access") throw new ApiError(400, "auth_mode_access");
	await next();
});

export const auth = new Hono<AppEnv>();

/** The caller's IP, or null for local development (no header, or loopback), which isn't rate limited. */
export const clientIp = (c: {
	req: { header: (name: string) => string | undefined };
}) => {
	const ip = c.req.header("cf-connecting-ip");
	return !ip || ip === "127.0.0.1" || ip === "::1" ? null : ip;
};

/** Rejects with 429 once a key is over its limit. Local development (no client IP) isn't limited. */
async function limit(
	limiter: RateLimit,
	ip: string | null,
	scope = "",
): Promise<void> {
	if (ip === null) return;
	const { success } = await limiter.limit({
		key: scope ? `${ip}:${scope}` : ip,
	});
	if (!success) throw new ApiError(429, "too_many_attempts");
}

/** Limits by email address alone, whichever IPs the requests come from (so one inbox can't be flooded). */
function limitAddress(
	limiter: RateLimit,
	ip: string | null,
	email: string,
): Promise<void> {
	return ip === null ? Promise.resolve() : limit(limiter, "mail", email);
}

/** How long a password reset link works. */
export const RESET_TTL_MS = 60 * 60 * 1000;

auth.get("/config", (c) =>
	c.json({ mode: c.env.AUTH_MODE, signupsOpen: c.env.SIGNUPS_OPEN === "true" }),
);

/** How long a sign-up link works. */
export const SIGNUP_LINK_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Step 1 of signing up: emails a link to finish creating the account. No
 * account exists until the link is opened and a password chosen. Asking
 * again (e.g. "Resend") replaces the link.
 *
 * Answers the same whether or not the email already has an account (that
 * address gets a "you already have an account" email instead of a link), so
 * it can't be used to find out which emails are registered.
 */
auth.post("/signup", passwordModeOnly, async (c) => {
	if (c.env.SIGNUPS_OPEN !== "true") throw new ApiError(403, "signups_closed");
	const { name, email, tz } = await readJson(c, signupSchema);
	const ip = clientIp(c);
	await limit(c.env.SIGNUP_LIMITER, ip);
	await limitAddress(c.env.SIGNUP_LIMITER, ip, email);

	const existing = await c.env.DB.prepare("SELECT 1 FROM users WHERE email = ?")
		.bind(email)
		.first();

	// Both branches do the same work (a hash and a two-statement write), so
	// response timing doesn't reveal whether the email has an account.
	const now = Date.now();
	const token = randomToken();
	const tokenHash = await sha256Hex(token);
	const purgeExpired = c.env.DB.prepare(
		"DELETE FROM signup_links WHERE expires_at <= ?",
	).bind(now);
	let mail: Mail;
	if (existing) {
		await c.env.DB.batch([
			purgeExpired,
			c.env.DB.prepare("DELETE FROM signup_links WHERE email = ?").bind(email),
		]);
		mail = accountExistsMail(email, `${c.env.APP_ORIGIN}/login`);
	} else {
		// The password is chosen on the page the link opens, so whoever can read
		// this email chooses it: someone else signing up with this address
		// can't plant theirs.
		await c.env.DB.batch([
			purgeExpired,
			c.env.DB.prepare(
				`INSERT INTO signup_links (email, name, tz, token_hash, expires_at, created_at)
				 VALUES (?, ?, ?, ?, ?, ?)
				 ON CONFLICT(email) DO UPDATE SET name = excluded.name, tz = excluded.tz,
				   token_hash = excluded.token_hash, expires_at = excluded.expires_at`,
			).bind(
				email,
				name,
				tz ?? "UTC",
				tokenHash,
				now + SIGNUP_LINK_TTL_MS,
				now,
			),
		]);
		const link = `${c.env.APP_ORIGIN}/verify-email?token=${encodeURIComponent(token)}`;
		mail = signupLinkMail(email, link);
	}
	try {
		await sendMail(c.env, mail);
	} catch (err) {
		console.error("Sign-up email failed", err);
		throw new ApiError(502, "email_failed");
	}
	return c.json({ pending: true, email }, 202);
});

type SignupLink = { email: string; name: string; tz: string };

async function findSignupLink(
	env: AppEnv["Bindings"],
	token: string,
): Promise<SignupLink & { token_hash: string }> {
	const link = await env.DB.prepare(
		"SELECT email, name, tz, token_hash FROM signup_links WHERE token_hash = ? AND expires_at > ?",
	)
		.bind(await sha256Hex(token), Date.now())
		.first<SignupLink & { token_hash: string }>();
	if (!link) throw new ApiError(400, "link_expired");
	return link;
}

/** The page the link opens asks which sign-up it is, to show the email and name. */
auth.post("/signup/link", passwordModeOnly, async (c) => {
	if (c.env.SIGNUPS_OPEN !== "true") throw new ApiError(403, "signups_closed");
	const { token } = await readJson(c, signupLinkSchema);
	await limit(c.env.SIGNUP_LIMITER, clientIp(c), "verify");
	const { email, name } = await findSignupLink(c.env, token);
	return c.json({ email, name });
});

/** Step 2: the link's token, a name and a password create the account and sign in. */
auth.post("/signup/verify", passwordModeOnly, async (c) => {
	if (c.env.SIGNUPS_OPEN !== "true") throw new ApiError(403, "signups_closed");
	const { token, name, password } = await readJson(c, verifySignupSchema);
	await limit(c.env.SIGNUP_LIMITER, clientIp(c), "verify");

	const link = await findSignupLink(c.env, token);
	// Spent before creating the account, so the link can't be used twice at once.
	const claimed = await c.env.DB.prepare(
		"DELETE FROM signup_links WHERE token_hash = ?",
	)
		.bind(link.token_hash)
		.run();
	if (claimed.meta.changes !== 1) throw new ApiError(400, "link_expired");

	const user: UserRow = {
		id: ulid(),
		email: link.email,
		name,
		password_hash: await hashPassword(password),
		tz: link.tz,
		settings: "{}",
		created_at: Date.now(),
	};
	try {
		await c.env.DB.prepare(
			"INSERT INTO users (id, email, name, password_hash, tz, settings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		)
			.bind(
				user.id,
				user.email,
				user.name,
				user.password_hash,
				user.tz,
				user.settings,
				user.created_at,
			)
			.run();
	} catch (err) {
		// Someone finished signing up with this email a moment ago.
		if (String(err).includes("UNIQUE")) throw new ApiError(409, "email_taken");
		throw err;
	}

	await createSession(c, user.id);
	return c.json(toMe(user), 201);
});

auth.post("/login", passwordModeOnly, async (c) => {
	const { email, password } = await readJson(c, credentialsSchema);

	const ip = clientIp(c);
	// Per IP across all emails (so one IP can't try a password on many
	// accounts), per IP + email, and per email from any IP (so many IPs can't
	// share the guessing on one account).
	await limit(c.env.LOGIN_LIMITER, ip);
	await limit(c.env.LOGIN_LIMITER, ip, email);
	await limitAddress(c.env.LOGIN_LIMITER, ip, email);

	const user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?")
		.bind(email)
		.first<UserRow>();
	const { ok, needsRehash } = await verifyPassword(
		password,
		user?.password_hash ?? (await getDummyHash()),
	);
	if (!user || !ok) throw new ApiError(401, "invalid_credentials");

	if (needsRehash) {
		await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
			.bind(await hashPassword(password), user.id)
			.run();
	}

	await createSession(c, user.id);
	return c.json(toMe(user));
});

auth.post("/logout", async (c) => {
	if (c.env.AUTH_MODE === "access") {
		return c.json({ ok: true, redirect: "/cdn-cgi/access/logout" });
	}
	await destroySession(c);
	return c.json({ ok: true });
});

/** Changes the password and signs out every other device. */
auth.post("/password", passwordModeOnly, requireUser, async (c) => {
	const { currentPassword, newPassword } = await readJson(
		c,
		changePasswordSchema,
	);
	const user = c.get("user");
	// Per account from any IP, so a stolen session can't guess the password.
	if (clientIp(c) !== null)
		await limit(c.env.LOGIN_LIMITER, "password", user.id);
	const row = await c.env.DB.prepare(
		"SELECT password_hash FROM users WHERE id = ?",
	)
		.bind(user.id)
		.first<{ password_hash: string }>();
	const { ok } = await verifyPassword(
		currentPassword,
		row?.password_hash ?? (await getDummyHash()),
	);
	if (!row || !ok) throw new ApiError(403, "wrong_password");
	await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
		.bind(await hashPassword(newPassword), user.id)
		.run();
	await destroyOtherSessions(c, user.id);
	return c.json({ ok: true });
});

/** Signs out everywhere, this device included. */
auth.post("/logout-all", passwordModeOnly, requireUser, async (c) => {
	await destroyUserSessions(c, c.get("user").id);
	return c.json({ ok: true });
});

/**
 * Emails a one-time reset link. Always answers the same way, so it can't be
 * used to find out which emails have accounts.
 */
auth.post("/forgot", passwordModeOnly, async (c) => {
	const { email } = await readJson(c, forgotPasswordSchema);
	const ip = clientIp(c);
	await limit(c.env.RESET_LIMITER, ip);
	await limit(c.env.RESET_LIMITER, ip, email);
	await limitAddress(c.env.RESET_LIMITER, ip, email);
	// Everything after this point runs after the response, so how long the
	// response takes doesn't reveal whether the account exists.
	c.executionCtx.waitUntil(
		sendResetLink(c.env, email).catch((err) =>
			console.error("Password reset email failed", err),
		),
	);
	return c.json({ ok: true });
});

async function sendResetLink(env: AppEnv["Bindings"], email: string) {
	const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
		.bind(email)
		.first<{ id: string }>();
	if (!user) return;
	const token = randomToken();
	const now = Date.now();
	await env.DB.batch([
		// Only the newest link works; expired links are cleared out.
		env.DB.prepare(
			"DELETE FROM password_resets WHERE user_id = ? OR expires_at <= ?",
		).bind(user.id, now),
		env.DB.prepare(
			"INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
		).bind(await sha256Hex(token), user.id, now + RESET_TTL_MS, now),
	]);
	const link = `${env.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
	await sendMail(env, resetPasswordMail(email, link));
}

/** Sets a new password from a reset link, signs out everywhere else, and signs in here. */
auth.post("/reset", passwordModeOnly, async (c) => {
	const { token, password } = await readJson(c, resetPasswordSchema);
	await limit(c.env.RESET_LIMITER, clientIp(c), "reset");
	const tokenHash = await sha256Hex(token);
	const row = await c.env.DB.prepare(
		`SELECT u.* FROM password_resets r JOIN users u ON u.id = r.user_id
		 WHERE r.token_hash = ? AND r.expires_at > ?`,
	)
		.bind(tokenHash, Date.now())
		.first<UserRow>();
	if (!row) throw new ApiError(400, "invalid_token");
	await c.env.DB.batch([
		c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(
			await hashPassword(password),
			row.id,
		),
		c.env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(
			row.id,
		),
		c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.id),
	]);
	await createSession(c, row.id);
	return c.json(toMe(row));
});
