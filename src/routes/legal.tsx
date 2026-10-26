// /privacy and /terms: public (no sign-in), bundled so they work offline.
// They describe the hosted instance at mythings.dynocoder.com; a fork that
// runs its own instance should replace the operator and contact details.

import { type ReactNode, useEffect } from "react";

export const LEGAL_CONTACT = "dutta@dynocoder.com";
/** When the policies last changed. Update it with any change to their text. */
export const LEGAL_UPDATED = "2026-10-27";

const updated = new Date(`${LEGAL_UPDATED}T12:00:00Z`).toLocaleDateString(
	undefined,
	{ year: "numeric", month: "long", day: "numeric", timeZone: "UTC" },
);

const Mail = () => (
	<a href={`mailto:${LEGAL_CONTACT}`} className="text-accent underline">
		{LEGAL_CONTACT}
	</a>
);

function LegalPage({
	title,
	intro,
	children,
}: {
	title: string;
	intro: ReactNode;
	children: ReactNode;
}) {
	useEffect(() => {
		document.title = `${title} · mythings`;
	}, [title]);
	return (
		<main className="mx-auto w-full max-w-[680px] px-4 py-12 md:px-8">
			<header className="flex items-center gap-3">
				<a href="/" className="shrink-0 rounded-xl">
					<img src="/favicon.svg" alt="mythings home" className="size-9" />
				</a>
				<div className="flex-1">
					<h1 className="text-2xl font-bold">{title}</h1>
					<p className="text-sm text-[var(--fg-muted)]">
						Last updated {updated}
					</p>
				</div>
				<a
					href="/today"
					className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:opacity-90"
				>
					Open mythings
				</a>
			</header>
			<div className="mt-8 leading-relaxed [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
				<p>{intro}</p>
				{children}
			</div>
			<nav
				aria-label="Legal"
				className="mt-12 flex flex-wrap gap-4 border-t border-[var(--border)] pt-6 text-sm text-[var(--fg-muted)]"
			>
				<a href="/privacy" className="hover:text-[var(--fg)]">
					Privacy Policy
				</a>
				<a href="/terms" className="hover:text-[var(--fg)]">
					Terms of Service
				</a>
				<a href="/changelog" className="hover:text-[var(--fg)]">
					Changelog
				</a>
			</nav>
		</main>
	);
}

export function PrivacyPage() {
	return (
		<LegalPage
			title="Privacy Policy"
			intro={
				<>
					This policy explains what the mythings service at
					mythings.dynocoder.com stores about you, why, who else handles it, and
					what you can do about it. The service is run by the owner of
					dynocoder.com ("we", "us"). Questions or requests: <Mail />.
				</>
			}
		>
			<h2>The short version</h2>
			<ul>
				<li>
					We store what the app needs to work: your account and your to-dos.
				</li>
				<li>
					No ads, no analytics or tracking scripts, no selling or sharing of
					your data for marketing.
				</li>
				<li>
					You can export everything at any time, and ask us to delete your
					account.
				</li>
			</ul>

			<h2>What we store on our servers</h2>
			<ul>
				<li>
					<strong>Your account:</strong> your email address, your name (if you
					give one), your password (only as a salted, one-way hash; we can't
					read it), your time zone, your app settings, and when you signed up.
				</li>
				<li>
					<strong>Your to-dos:</strong> everything you put into mythings
					(to-dos, notes, checklists, projects, areas, headings, tags, dates,
					reminders and repeat rules), and items in Trash until they're deleted
					permanently (after 30 days, or sooner if you empty Trash).
				</li>
				<li>
					<strong>Sign-in sessions:</strong> for each device you're signed in
					on, a hash of the session token, its expiry, and the browser's
					user-agent string (which says the browser and operating system).
				</li>
				<li>
					<strong>Sign-up and password reset links:</strong> while a link is
					waiting to be used, a hash of its token, its expiry, and for a sign-up
					the email, name and time zone you entered. Unused sign-up links expire
					after 24 hours and reset links after one hour.
				</li>
				<li>
					<strong>Reminders:</strong> if you turn on notifications, the push
					address your browser gives us for that device (an endpoint URL and its
					encryption keys).
				</li>
			</ul>

			<h2>What stays on your device</h2>
			<p>
				mythings works offline, so each browser you use keeps a full copy of
				your to-dos in its local database (IndexedDB), plus changes waiting to
				sync. It also keeps a few preferences for that device in local storage
				(your profile for starting offline, theme, text size, sidebar width) and
				a cached copy of the app. This data stays in your browser; signing out
				or clearing the site's data in your browser removes it.
			</p>
			<p>
				We set a single cookie, <code>mt_session</code>, which keeps you signed
				in. It's strictly necessary for the service, so there's no cookie
				banner. We don't use any other cookies, and no third-party cookies.
			</p>

			<h2>Why we use it</h2>
			<ul>
				<li>
					To provide the service you asked for: storing and syncing your to-dos,
					signing you in, and sending the reminders you set.
				</li>
				<li>
					To send account emails: confirming your email when you sign up, and
					password reset links when you ask for one. We don't send newsletters
					or marketing.
				</li>
				<li>
					To keep the service secure: limiting repeated sign-in, sign-up and
					reset attempts (counted per IP address and email address for a short
					time), and finding and fixing faults.
				</li>
			</ul>
			<p>
				If you're in the EU, UK or a similar jurisdiction: we use your data
				because it's needed to provide the service you signed up for (contract),
				and for security and abuse prevention (legitimate interests).
			</p>

			<h2>Who else handles it</h2>
			<ul>
				<li>
					<strong>Cloudflare</strong> hosts the app, its database and storage,
					sends our emails (Cloudflare Email Sending), and keeps short-lived
					request logs (including IP addresses) that we use to find faults. Your
					data may be processed in any country where Cloudflare operates.
				</li>
				<li>
					<strong>Your browser's push service</strong> (for example Apple,
					Google or Mozilla, depending on your browser) delivers reminders. The
					reminder text is encrypted so that only your browser can read it; the
					push service sees when a message is sent to your device.
				</li>
				<li>
					<strong>Our email provider (Zoho Mail)</strong> holds any email you
					send to us.
				</li>
			</ul>
			<p>
				We don't sell your data or share it with anyone else, unless the law
				requires us to.
			</p>

			<h2>How long we keep it</h2>
			<p>
				We keep your account and to-dos for as long as you have an account.
				Sessions end after 30 days without use. When you ask us to delete your
				account, we delete it and your to-dos within 30 days; copies in backups
				or logs held by our providers expire on their own schedule.
			</p>

			<h2>Your choices and rights</h2>
			<ul>
				<li>
					<strong>Access and export:</strong> Settings → Data → Export downloads
					all your to-dos as a file.
				</li>
				<li>
					<strong>Correct:</strong> change your name, time zone and settings in
					Settings. To change your email address, write to us.
				</li>
				<li>
					<strong>Delete:</strong> delete to-dos at any time, or email us from
					your account's address to delete your whole account.
				</li>
				<li>
					<strong>Notifications:</strong> turn reminders off in Settings or in
					your browser at any time.
				</li>
			</ul>
			<p>
				Depending on where you live you may have further rights, such as to
				object to or restrict processing, and to complain to your data
				protection authority. Email us and we'll answer within 30 days.
			</p>

			<h2>Security</h2>
			<p>
				Connections are encrypted (HTTPS). Passwords, session tokens and email
				links are stored only as hashes. No system is perfectly secure; if
				something goes wrong that affects your data, we'll tell you.
			</p>

			<h2>Children</h2>
			<p>
				mythings isn't meant for children under 13 (or the minimum age for using
				online services without a parent's consent where you live), and we don't
				knowingly collect their data.
			</p>

			<h2>Changes</h2>
			<p>
				If we change this policy, we'll update it here and change the date at
				the top. For significant changes we'll let you know in the app or by
				email.
			</p>
		</LegalPage>
	);
}

export function TermsPage() {
	return (
		<LegalPage
			title="Terms of Service"
			intro={
				<>
					These terms cover your use of the mythings service at
					mythings.dynocoder.com, run by the owner of dynocoder.com ("we",
					"us"). By creating an account or using the service, you agree to them.
					Questions: <Mail />.
				</>
			}
		>
			<h2>The service</h2>
			<p>
				mythings is a free to-do app. We offer it as it is and may change, pause
				or stop it. If we plan to shut it down, we'll give you at least 30 days'
				notice so you can export your data.
			</p>
			<p>
				The mythings software is open source under the GNU Affero General Public
				License v3. These terms are about using our hosted service; your rights
				to the code itself come from that license.
			</p>

			<h2>Your account</h2>
			<ul>
				<li>
					Give a real email address you control. You need to be at least 13, or
					the minimum age for online services where you live.
				</li>
				<li>
					Keep your password safe; you're responsible for what happens under
					your account. Tell us if you think someone else has access to it.
				</li>
				<li>One person per account.</li>
			</ul>

			<h2>Your content</h2>
			<p>
				What you put into mythings stays yours. You give us only the permission
				we need to store, sync and show it to you, and to send the reminders you
				set. We don't look at your to-dos except when you ask us to for support,
				or when the law requires it.
			</p>

			<h2>Acceptable use</h2>
			<p>Don't use the service to:</p>
			<ul>
				<li>break the law or infringe anyone's rights;</li>
				<li>
					store or spread malware, or attack, probe or overload the service
					(including automated sign-ups or bypassing rate limits);
				</li>
				<li>access other people's accounts or data;</li>
				<li>resell the hosted service.</li>
			</ul>
			<p>
				We may suspend or close accounts that break these terms or put the
				service or its users at risk. Where we reasonably can, we'll tell you
				first and give you a chance to export your data.
			</p>

			<h2>Ending your account</h2>
			<p>
				You can stop using mythings at any time. Export your data from Settings
				→ Data, then email us from your account's address to delete the account.
			</p>

			<h2>No warranty</h2>
			<p>
				The service is provided "as is" and "as available", without warranties
				of any kind, to the extent the law allows. We work to keep your data
				safe and the service running, but we can't promise it will always be
				available, error-free, or that data can never be lost. Keep exports of
				anything important. Reminders may arrive late or not at all (for example
				if your device is offline or your browser's push service is
				unavailable), so don't rely on mythings for anything critical such as
				medication or safety.
			</p>

			<h2>Limitation of liability</h2>
			<p>
				To the extent the law allows, we aren't liable for indirect or
				consequential losses, or for lost data, profits or opportunities,
				arising from your use of the service. Because the service is free, our
				total liability to you is limited to US$100. Nothing in these terms
				limits rights you have under consumer law that can't be excluded.
			</p>

			<h2>Changes</h2>
			<p>
				We may update these terms. We'll change the date at the top and, for
				significant changes, let you know in the app or by email. If you keep
				using the service after a change, the new terms apply; if you don't
				agree, you can export your data and close your account.
			</p>
		</LegalPage>
	);
}
