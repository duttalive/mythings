// Transactional email through Cloudflare Email Sending (the EMAIL binding).
// The sender domain is onboarded in the dashboard (Email Service → Email Sending).

import type { AppEnv } from "./types";

type Env = AppEnv["Bindings"];

export type Mail = { to: string; subject: string; text: string; html: string };

/**
 * Local development only (DEV_MAILBOX=true in .dev.vars): mail is kept here
 * instead of sent, and GET /api/dev/mail shows it to local requests only.
 * Production never sets it.
 */
const devMailbox: Mail[] = [];

export function devMail(env: Env): Mail[] | null {
	return env.DEV_MAILBOX === "true" ? devMailbox : null;
}

export async function sendMail(env: Env, mail: Mail): Promise<void> {
	const mailbox = devMail(env);
	if (mailbox) {
		mailbox.push(mail);
		console.log(`[dev mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
		return;
	}
	await env.EMAIL.send({
		from: { email: env.MAIL_FROM, name: "mythings" },
		to: mail.to,
		subject: mail.subject,
		text: mail.text,
		html: mail.html,
	});
}

const escapeHtml = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			] as string,
	);

/** The password reset email. The link is single-use and expires in an hour. */
export function resetPasswordMail(to: string, link: string): Mail {
	const url = escapeHtml(link);
	return {
		to,
		subject: "Reset your mythings password",
		text: `Someone (hopefully you) asked to reset the password for your mythings account.

Choose a new password here (the link works once, for one hour):
${link}

If you didn't ask for this, ignore this email; your password won't change.`,
		html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
<tr><td>
<h1 style="margin:0 0 16px;font-size:20px">Reset your password</h1>
<p style="margin:0 0 24px;line-height:1.5">Someone (hopefully you) asked to reset the password for your mythings account. The link works once, for one hour.</p>
<p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#2f63e6;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Choose a new password</a></p>
<p style="margin:0;font-size:13px;color:#5f5f64;line-height:1.5">If you didn't ask for this, ignore this email; your password won't change.<br>Or paste this link into your browser: ${url}</p>
</td></tr></table></body></html>`,
	};
}

/** The sign-up confirmation email with its 6-digit code. */
export function signupCodeMail(to: string, code: string): Mail {
	return {
		to,
		subject: `${code} is your mythings code`,
		text: `Welcome to mythings! Enter this code to confirm your email and finish creating your account:

${code}

It works for 15 minutes. If you didn't try to sign up, ignore this email; no account is created.`,
		html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
<tr><td>
<h1 style="margin:0 0 16px;font-size:20px">Confirm your email</h1>
<p style="margin:0 0 20px;line-height:1.5">Welcome to mythings! Enter this code to finish creating your account:</p>
<p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:8px;font-family:ui-monospace,Menlo,monospace">${code}</p>
<p style="margin:0;font-size:13px;color:#5f5f64;line-height:1.5">It works for 15 minutes. If you didn't try to sign up, ignore this email; no account is created.</p>
</td></tr></table></body></html>`,
	};
}

/** Sent instead of a code when someone signs up with an email that already has an account. */
export function accountExistsMail(to: string, signInUrl: string): Mail {
	const url = escapeHtml(signInUrl);
	return {
		to,
		subject: "You already have a mythings account",
		text: `Someone (hopefully you) tried to create a mythings account with this email, but you already have one.

Sign in here: ${signInUrl}
Forgot your password? Choose "Forgot password?" on the sign-in page.

If this wasn't you, ignore this email; nothing has changed.`,
		html: `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1d1d1f">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
<tr><td>
<h1 style="margin:0 0 16px;font-size:20px">You already have an account</h1>
<p style="margin:0 0 24px;line-height:1.5">Someone (hopefully you) tried to create a mythings account with this email, but you already have one. Forgot your password? Choose "Forgot password?" on the sign-in page.</p>
<p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#2f63e6;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Sign in</a></p>
<p style="margin:0;font-size:13px;color:#5f5f64;line-height:1.5">If this wasn't you, ignore this email; nothing has changed.</p>
</td></tr></table></body></html>`,
	};
}
