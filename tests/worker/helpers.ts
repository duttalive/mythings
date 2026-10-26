import { exports } from "cloudflare:workers";
import { expect } from "vitest";

export const ORIGIN = "https://example.com";
export const PASSWORD = "correct horse battery";

type Options = {
	method?: string;
	body?: unknown;
	/** Sent as-is instead of JSON-encoding `body`. */
	rawBody?: string;
	cookie?: string;
	headers?: Record<string, string>;
};

/** A different client IP per request, so per-IP rate limits don't add up across tests. */
let ipCounter = 0;
const nextIp = () => `198.18.${(ipCounter >> 8) & 255}.${ipCounter++ & 255}`;

export function api(
	path: string,
	{ method = "GET", body, rawBody, cookie, headers }: Options = {},
) {
	return exports.default.fetch(`${ORIGIN}/api${path}`, {
		method,
		headers: {
			origin: ORIGIN,
			"cf-connecting-ip": nextIp(),
			"content-type": "application/json",
			...(cookie && { cookie }),
			...headers,
		},
		body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
	});
}

let counter = 0;
export function uniqueEmail() {
	return `user-${Date.now()}-${counter++}@example.com`;
}

/** `mt_session=<token>` from a response's Set-Cookie, for sending back. */
export function sessionCookie(res: Response): string {
	const match = res.headers.get("set-cookie")?.match(/mt_session=([^;]*)/);
	expect(match?.[1]).toBeTruthy();
	return `mt_session=${match?.[1]}`;
}

export type SentMail = { to: string; subject: string; text: string };

/** Emails the app sent to an address, newest first (the dev mailbox, which only answers local requests). */
export async function mailTo(email: string): Promise<SentMail[]> {
	const res = await exports.default.fetch(
		`http://localhost/api/dev/mail?to=${encodeURIComponent(email)}`,
	);
	expect(res.status).toBe(200);
	return res.json();
}

/** The token from the newest sign-up link emailed to an address. */
export async function signupToken(email: string): Promise<string> {
	const [mail] = await mailTo(email);
	const token = mail?.text.match(/\/verify-email\?token=([\w-]+)/)?.[1];
	expect(token).toBeTruthy();
	return token as string;
}

/** Signs up all the way: asks for a link, then opens it and chooses a password. */
export async function signup(
	email = uniqueEmail(),
	password = PASSWORD,
	name = "Test User",
) {
	const started = await api("/auth/signup", {
		method: "POST",
		body: { name, email },
	});
	expect(started.status).toBe(202);
	const res = await api("/auth/signup/verify", {
		method: "POST",
		body: { token: await signupToken(email), name, password },
	});
	expect(res.status).toBe(201);
	return { res, email, password, cookie: sessionCookie(res) };
}
