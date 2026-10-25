// The public home page at / for signed-out visitors: what mythings is, a small
// working preview of Today, and the way in (sign up or sign in).

import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import type { Status } from "../../shared/schema";
import { api } from "../api";
import { APP_VERSION } from "../changelog";
import {
	BellIcon,
	BoxIcon,
	CalendarIcon,
	CloudOffIcon,
	FlagIcon,
	InboxIcon,
	LayersIcon,
	LogbookIcon,
	MoonIcon,
	RepeatIcon,
	SearchIcon,
	StarIcon,
} from "../components/icons";
import { Checkbox } from "../components/rows";

const REPO_URL = "https://github.com/duttalive/mythings";

type Props = {
	/** Shows /login or /signup without reloading the page. */
	go: (path: "/login" | "/signup") => void;
};

export function HomePage({ go }: Props) {
	const [signupsOpen, setSignupsOpen] = useState(true);

	useEffect(() => {
		document.title = "mythings: a calm, local-first to-do app";
		api<{ signupsOpen: boolean }>("/auth/config")
			.then((c) => setSignupsOpen(c.signupsOpen))
			.catch(() => {});
	}, []);

	/** Plain links that still work with JavaScript off or opened in a new tab. */
	const link = (path: "/login" | "/signup") => ({
		href: path,
		onClick: (e: MouseEvent) => {
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
			e.preventDefault();
			go(path);
		},
	});

	const primaryCta = signupsOpen ? (
		<a
			{...link("/signup")}
			className="rounded-xl bg-accent px-5 py-3 font-semibold text-on-accent shadow-[0_6px_20px_-6px_var(--accent)] transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		>
			Get started, it's free
		</a>
	) : (
		<a
			{...link("/login")}
			className="rounded-xl bg-accent px-5 py-3 font-semibold text-on-accent transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
		>
			Sign in
		</a>
	);

	return (
		<div className="min-h-full overflow-x-clip bg-[var(--bg)]">
			{/* Soft accent glow behind the hero. */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_srgb,var(--accent)_16%,transparent),transparent)]"
			/>

			<header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
				<a href="/" className="flex items-center gap-2.5 font-semibold">
					<img src="/favicon.svg" alt="" className="size-8" />
					<span className="text-lg">mythings</span>
				</a>
				<nav aria-label="Site" className="flex items-center gap-1 text-sm">
					<a
						href="/changelog"
						className="hidden rounded-lg px-3 py-2 text-[var(--fg-muted)] hover:text-[var(--fg)] sm:block"
					>
						What's new
					</a>
					<a
						href={REPO_URL}
						className="hidden rounded-lg px-3 py-2 text-[var(--fg-muted)] hover:text-[var(--fg)] sm:block"
					>
						GitHub
					</a>
					<a
						{...link("/login")}
						className="rounded-lg px-3 py-2 font-medium hover:bg-[var(--hover)]"
					>
						Sign in
					</a>
				</nav>
			</header>

			<main>
				<section className="relative mx-auto max-w-6xl px-4 pt-14 pb-16 text-center sm:px-8 sm:pt-24">
					<p className="mx-auto inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--fg-muted)]">
						<span className="size-1.5 rounded-full bg-done" />
						Free and open source · Version {APP_VERSION}
					</p>
					<h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
						A calm place for everything you need to do.
					</h1>
					<p className="mx-auto mt-5 max-w-xl text-lg text-pretty text-[var(--fg-muted)]">
						A to-do app in the spirit of Things 3. It works offline, syncs
						across your devices in about a second, and installs like an app on
						your phone and computer.
					</p>
					<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
						{primaryCta}
						{signupsOpen && (
							<a
								{...link("/login")}
								className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-3 font-medium transition hover:bg-[var(--hover)]"
							>
								Sign in
							</a>
						)}
					</div>

					<TodayPreview />
				</section>

				<section
					aria-labelledby="features"
					className="mx-auto max-w-6xl px-4 py-16 sm:px-8"
				>
					<h2
						id="features"
						className="text-center text-3xl font-bold tracking-tight"
					>
						Quiet on the surface. Quick underneath.
					</h2>
					<ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						<Feature icon={<CloudOffIcon />} title="Works offline">
							Every device keeps a full copy. Plan on a plane; it all syncs when
							you land.
						</Feature>
						<Feature icon={<RepeatIcon />} title="Syncs in real time">
							Tick something off on your phone and it's done on your laptop a
							second later.
						</Feature>
						<Feature icon={<CalendarIcon />} title="Plans in plain words">
							Type “tomorrow”, “next fri” or “in 2 weeks”. Deadlines and
							repeating to-dos are built in.
						</Feature>
						<Feature icon={<SearchIcon />} title="Keyboard first">
							Quick Entry and Quick Find from anywhere, and shortcuts for nearly
							everything.
						</Feature>
						<Feature icon={<BellIcon />} title="Reminders that arrive">
							Notifications on your phone and desktop, without another app.
						</Feature>
						<Feature icon={<BoxIcon />} title="Yours to keep">
							Export everything any time. The code is open (AGPL-3.0), so you
							can even host your own.
						</Feature>
					</ul>
				</section>

				<section
					aria-labelledby="flow"
					className="mx-auto max-w-6xl px-4 py-16 sm:px-8"
				>
					<h2
						id="flow"
						className="text-center text-3xl font-bold tracking-tight"
					>
						A place for everything
					</h2>
					<p className="mx-auto mt-3 max-w-xl text-center text-[var(--fg-muted)]">
						Catch it in the Inbox, then give it a time. Today stays short, so
						you can actually finish it.
					</p>
					<ol className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
						<Step icon={<InboxIcon className="text-accent" />} name="Inbox">
							Catch every thought
						</Step>
						<Step icon={<StarIcon className="text-today" />} name="Today">
							What you'll do now
						</Step>
						<Step
							icon={<CalendarIcon className="text-overdue" />}
							name="Upcoming"
						>
							What's coming, by date
						</Step>
						<Step
							icon={<LayersIcon className="text-teal-600" />}
							name="Anytime"
						>
							Ready when you are
						</Step>
						<Step icon={<BoxIcon className="text-amber-700" />} name="Someday">
							Maybe, one day
						</Step>
						<Step icon={<LogbookIcon className="text-done" />} name="Logbook">
							Everything you did
						</Step>
					</ol>
				</section>

				<section className="mx-auto max-w-6xl px-4 pt-8 pb-20 sm:px-8">
					<div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-sidebar)] px-6 py-14 text-center">
						<h2 className="text-3xl font-bold tracking-tight text-balance">
							Clear your head. Start with your Inbox.
						</h2>
						<p className="mx-auto mt-3 max-w-md text-[var(--fg-muted)]">
							Free, no ads, works on any device with a modern browser.
						</p>
						<div className="mt-7 flex justify-center">{primaryCta}</div>
					</div>
				</section>
			</main>

			<footer className="border-t border-[var(--border)]">
				<div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-sm text-[var(--fg-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
					<p>
						mythings {APP_VERSION} · Inspired by Things 3; not affiliated with
						Cultured Code.
					</p>
					<nav aria-label="Footer" className="flex gap-4">
						<a href="/changelog" className="hover:text-[var(--fg)]">
							Changelog
						</a>
						<a href={REPO_URL} className="hover:text-[var(--fg)]">
							Source code
						</a>
						<a
							href={`${REPO_URL}/blob/main/SECURITY.md`}
							className="hover:text-[var(--fg)]"
						>
							Security
						</a>
					</nav>
				</div>
			</footer>
		</div>
	);
}

function Feature({
	icon,
	title,
	children,
}: {
	icon: ReactNode;
	title: string;
	children: ReactNode;
}) {
	return (
		<li className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
			<span className="flex size-10 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent [&>svg]:size-5">
				{icon}
			</span>
			<h3 className="mt-4 font-semibold">{title}</h3>
			<p className="mt-1.5 text-sm leading-relaxed text-[var(--fg-muted)]">
				{children}
			</p>
		</li>
	);
}

function Step({
	icon,
	name,
	children,
}: {
	icon: ReactNode;
	name: string;
	children: ReactNode;
}) {
	return (
		<li className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
			<span className="flex items-center gap-2 font-semibold [&>svg]:size-5">
				{icon}
				{name}
			</span>
			<p className="mt-1 text-sm text-[var(--fg-muted)]">{children}</p>
		</li>
	);
}

type PreviewTodo = {
	title: string;
	detail?: ReactNode;
	done?: boolean;
	evening?: boolean;
};

const PREVIEW_TODOS: PreviewTodo[] = [
	{ title: "Morning run", done: true },
	{
		title: "Book flights to Lisbon",
		detail: <Chip>travel</Chip>,
	},
	{
		title: "Send Q4 plan to the team",
		detail: (
			<span className="flex items-center gap-1 text-overdue">
				<FlagIcon className="size-3.5" /> Fri
			</span>
		),
	},
	{ title: "Pick up dry cleaning", detail: <Chip>errands</Chip> },
	{ title: "Call Mum", evening: true },
	{ title: "Read 20 pages", evening: true },
];

function Chip({ children }: { children: ReactNode }) {
	return (
		<span className="rounded-full border border-[var(--border)] px-2 py-px text-xs text-[var(--fg-muted)]">
			{children}
		</span>
	);
}

/** A small, working picture of the app: the to-dos can be ticked off. */
function TodayPreview() {
	const [done, setDone] = useState(() => PREVIEW_TODOS.map((t) => !!t.done));
	const toggle = (i: number) =>
		setDone((d) => d.map((v, j) => (j === i ? !v : v)));

	const row = (todo: PreviewTodo, i: number) => (
		<li key={todo.title} className="flex items-start gap-3 py-2">
			<Checkbox
				status={done[i] ? "completed" : ("open" satisfies Status)}
				label={todo.title}
				onToggle={() => toggle(i)}
			/>
			<span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
				<span
					className={
						done[i]
							? "text-[var(--fg-muted)] line-through decoration-[var(--fg-muted)]"
							: ""
					}
				>
					{todo.title}
				</span>
				{todo.detail}
			</span>
		</li>
	);

	return (
		<figure className="relative mx-auto mt-16 max-w-4xl text-left">
			<div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-[0_30px_80px_-30px_rgb(0_0_0/0.45)]">
				<div className="flex h-9 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg-sidebar)] px-4">
					<span className="size-2.5 rounded-full bg-[#ff5f57]" />
					<span className="size-2.5 rounded-full bg-[#febc2e]" />
					<span className="size-2.5 rounded-full bg-[#28c840]" />
				</div>
				<div className="flex min-h-80">
					<ul
						aria-hidden
						className="hidden w-52 shrink-0 flex-col gap-0.5 border-r border-[var(--border)] bg-[var(--bg-sidebar)] p-3 text-sm sm:flex"
					>
						<SideItem icon={<InboxIcon className="text-accent" />} count={3}>
							Inbox
						</SideItem>
						<SideItem
							icon={<StarIcon className="text-today" />}
							count={4}
							active
						>
							Today
						</SideItem>
						<SideItem icon={<CalendarIcon className="text-overdue" />}>
							Upcoming
						</SideItem>
						<SideItem icon={<LayersIcon className="text-teal-600" />}>
							Anytime
						</SideItem>
						<SideItem icon={<BoxIcon className="text-amber-700" />}>
							Someday
						</SideItem>
						<SideItem icon={<LogbookIcon className="text-done" />}>
							Logbook
						</SideItem>
						<li className="mt-4 px-2 pb-1 text-xs font-semibold text-[var(--fg-muted)]">
							Areas
						</li>
						<SideItem icon={<span className="size-2 rounded-full bg-accent" />}>
							Home
						</SideItem>
						<SideItem
							icon={<span className="size-2 rounded-full bg-evening" />}
						>
							Work
						</SideItem>
					</ul>
					<div className="flex-1 px-6 py-6 sm:px-10">
						<h2 className="flex items-center gap-2.5 text-2xl font-bold">
							<StarIcon className="size-6 text-today" /> Today
						</h2>
						<ul className="mt-4">
							{PREVIEW_TODOS.map((t, i) => (t.evening ? null : row(t, i)))}
						</ul>
						<h3 className="mt-5 flex items-center gap-2 border-b border-[var(--border)] pb-1.5 text-sm font-semibold text-evening">
							<MoonIcon className="size-4" /> This Evening
						</h3>
						<ul className="mt-1">
							{PREVIEW_TODOS.map((t, i) => (t.evening ? row(t, i) : null))}
						</ul>
					</div>
				</div>
			</div>
			<figcaption className="mt-4 text-center text-sm text-[var(--fg-muted)]">
				Go on, tick something off.
			</figcaption>
		</figure>
	);
}

function SideItem({
	icon,
	count,
	active,
	children,
}: {
	icon: ReactNode;
	count?: number;
	active?: boolean;
	children: ReactNode;
}) {
	return (
		<li
			className={`flex items-center gap-2.5 rounded-md px-2 py-1 ${active ? "bg-[var(--selected)] font-medium" : ""} [&>svg]:size-[1.125rem]`}
		>
			{icon}
			<span className="flex-1">{children}</span>
			{count !== undefined && (
				<span className="text-xs text-[var(--fg-muted)] tabular-nums">
					{count}
				</span>
			)}
		</li>
	);
}
