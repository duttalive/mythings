import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { auth, clientIp } from "./auth";
import { ApiError } from "./http";
import { devMail } from "./mail";
import { me } from "./me";
import { notifications } from "./notifications";
import { sync } from "./sync";
import { transfer } from "./transfer";
import type { AppEnv } from "./types";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** CSRF guard: state-changing requests must come from our own origin. */
const sameOrigin = createMiddleware<AppEnv>(async (c, next) => {
	if (!SAFE_METHODS.has(c.req.method)) {
		const origin = c.req.header("origin");
		const allowed = [c.env.APP_ORIGIN, new URL(c.req.url).origin];
		if (!origin || !allowed.includes(origin))
			throw new ApiError(403, "bad_origin");
	}
	await next();
});

/**
 * Security headers on every API response (pages and files get theirs from
 * public/_headers). API answers are never cached: they're per account.
 */
const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
	await next();
	// A WebSocket handshake's response can't be changed.
	if (c.res.status === 101) return;
	c.header(
		"Content-Security-Policy",
		"default-src 'none'; frame-ancestors 'none'",
	);
	c.header("X-Frame-Options", "DENY");
	c.header("X-Content-Type-Options", "nosniff");
	c.header("Referrer-Policy", "no-referrer");
	if (!c.res.headers.has("Cache-Control"))
		c.header("Cache-Control", "no-store");
	const url = new URL(c.req.url);
	if (url.protocol === "https:" && url.origin === c.env.APP_ORIGIN) {
		c.header("Strict-Transport-Security", "max-age=31536000");
	}
});

const app = new Hono<AppEnv>().basePath("/api");

app.use(securityHeaders);
app.use(sameOrigin);

app.get("/health", async (c) => {
	const row = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
	return c.json({ ok: true, db: row?.ok === 1 });
});

app.route("/auth", auth);
app.route("/me", me);
app.route("/sync", sync);
app.route("/push", notifications);
app.route("/", transfer);

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Local development only: the emails the app would have sent, newest first.
// Needs DEV_MAILBOX=true *and* a request to a loopback host with no real
// client IP, which never happens on Cloudflare's network, so a mistaken
// variable in production can't expose sign-up codes or reset links.
app.get("/dev/mail", (c) => {
	const mailbox = devMail(c.env);
	const local =
		LOOPBACK_HOSTS.has(new URL(c.req.url).hostname) && clientIp(c) === null;
	if (!mailbox || !local) throw new ApiError(404, "not_found");
	const to = c.req.query("to");
	return c.json(mailbox.filter((m) => !to || m.to === to).toReversed());
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
	if (err instanceof ApiError) {
		return c.json(
			{ error: err.code, ...(err.issues && { issues: err.issues }) },
			err.status,
		);
	}
	console.error(err);
	return c.json({ error: "internal_error" }, 500);
});

export { UserStore } from "./user-store";

export default app;
