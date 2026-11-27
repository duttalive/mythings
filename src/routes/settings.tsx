// Settings (SPEC §10.9): appearance, dates, lists, notifications, data and account.

import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	DEFAULT_SIDEBAR_VIEWS,
	type Me,
	OPTIONAL_VIEWS,
	type Settings,
} from "../../shared/schema";
import { ApiError, api } from "../api";
import { useAuth } from "../auth/AuthGate";
import { APP_VERSION } from "../changelog";
import { ChevronIcon, GearIcon } from "../components/icons";
import { ListPage } from "../components/ListPage";
import { PasswordInput } from "../components/PasswordInput";
import { ActionRow, Field, Segmented } from "../components/SettingsRows";
import { SignOutButton } from "../components/SignOutButton";
import {
	buttonClass,
	dangerButtonClass,
	dangerOutlineClass,
	inputClass,
	quietLinkClass,
	secondaryButtonClass,
} from "../components/ui";
import {
	confirmBody,
	markUpgraded,
	newPasswordKeys,
	PasswordTooShort,
	wrapForPassword,
} from "../crypto/account";
import {
	applyTextSize,
	loadTextSize,
	TEXT_SIZES,
	type TextSize,
} from "../lib/textSize";
import { downloadExport, importFile } from "../lib/transfer";
import { sidebarViews, VIEWS } from "../lib/views";
import { useNotificationState } from "../push/notifications";
import { SecuritySettings } from "../security/SecuritySettings";
import { useSyncContext } from "../sync/SyncProvider";

const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function allTimeZones(current: string): string[] {
	const zones = Intl.supportedValuesOf?.("timeZone") ?? [];
	return zones.includes(current) ? zones : [current, ...zones];
}

/** Optimistic: shows the change at once, saves it, and puts it back if saving fails. */
function useSaveProfile() {
	const { user, updateUser } = useAuth();
	const [error, setError] = useState<string | null>(null);
	const save = async (patch: {
		name?: string;
		tz?: string;
		settings?: Settings;
	}) => {
		const before = user;
		setError(null);
		updateUser({
			...user,
			name: patch.name === undefined ? user.name : patch.name.trim() || null,
			tz: patch.tz ?? user.tz,
			settings: { ...user.settings, ...patch.settings },
		});
		try {
			updateUser(await api<Me>("/me", { method: "PATCH", body: patch }));
			return true;
		} catch (err) {
			updateUser(before);
			setError(
				err instanceof ApiError && err.code === "invalid_input"
					? (err.body.issues?.[0]?.message ?? "Couldn't save that change.")
					: err instanceof ApiError
						? "Couldn't save that change."
						: "You're offline — settings need a connection to change.",
			);
			return false;
		}
	};
	return { user, save, error };
}

/** The sections, in page order, for the jump bar. Security shows only with password sign-in. */
const SECTIONS = [
	["appearance", "Appearance"],
	["date-time", "Date & time"],
	["lists", "Lists"],
	["sidebar", "Sidebar"],
	["notifications", "Notifications"],
	["data", "Data"],
	["security", "Security"],
	["account", "Account"],
	["about", "About"],
] as const;
type SectionId = (typeof SECTIONS)[number][0];

export function SettingsPage() {
	const { user, save, error } = useSaveProfile();
	const settings = user.settings;
	const shownViews = sidebarViews(settings);
	const device = deviceTimeZone();
	const zones = useMemo(() => allTimeZones(user.tz), [user.tz]);
	const passwordMode = usePasswordMode();
	const sections = useMemo(
		() => SECTIONS.filter(([id]) => id !== "security" || passwordMode),
		[passwordMode],
	);
	const isDefaultSidebar =
		DEFAULT_SIDEBAR_VIEWS.every((v) => shownViews.has(v)) &&
		shownViews.size === DEFAULT_SIDEBAR_VIEWS.length;

	return (
		<ListPage
			title="Settings"
			icon={<GearIcon className="size-7 text-[var(--fg-muted)]" />}
		>
			<SectionNav sections={sections} />
			{error && (
				<p
					role="alert"
					className="mb-4 rounded-lg bg-overdue/10 px-3 py-2 text-sm text-overdue"
				>
					{error}
				</p>
			)}

			<Section id="appearance" title="Appearance">
				<Field label="Theme" group>
					{(ids) => (
						<Segmented
							ids={ids}
							value={settings.theme ?? "system"}
							options={[
								["system", "System"],
								["light", "Light"],
								["dark", "Dark"],
							]}
							onChange={(theme) => save({ settings: { theme } })}
						/>
					)}
				</Field>
				<TextSizeField />
				<Field
					group
					label="Long task titles"
					hint="How titles show in lists. An open task always shows the whole title and checklist."
				>
					{(ids) => (
						<Segmented
							ids={ids}
							value={settings.longTitles ?? "wrap"}
							options={[
								["wrap", "Wrap"],
								["oneLine", "One line"],
							]}
							onChange={(longTitles) => save({ settings: { longTitles } })}
						/>
					)}
				</Field>
				{/* Phones always use the whole width, so it only matters on bigger screens. */}
				<Toggle
					label="Full width"
					hint="Lists use the whole window instead of a centered column."
					className="max-md:hidden"
					checked={settings.fullWidth ?? false}
					onChange={(fullWidth) => save({ settings: { fullWidth } })}
				/>
			</Section>

			<Section id="date-time" title="Date & time">
				<Field
					label="Time zone"
					hint={
						user.tz !== device ? (
							<button
								type="button"
								onClick={() => save({ tz: device })}
								className={`text-left ${quietLinkClass} pointer-coarse:py-1.5`}
							>
								Use this device's time zone ({device.replaceAll("_", " ")})
							</button>
						) : (
							"Matches this device."
						)
					}
				>
					{({ id, hintId }) => (
						<select
							id={id}
							aria-describedby={hintId}
							value={user.tz}
							onChange={(e) => save({ tz: e.target.value })}
							className={inputClass}
						>
							{zones.map((zone) => (
								<option key={zone} value={zone}>
									{zone.replaceAll("_", " ")}
								</option>
							))}
						</select>
					)}
				</Field>
				<Field label="Week starts on">
					{({ id, hintId }) => (
						<select
							id={id}
							aria-describedby={hintId}
							value={settings.weekStart ?? 1}
							onChange={(e) =>
								save({
									settings: {
										weekStart: Number(e.target.value) as 0 | 1 | 6,
									},
								})
							}
							className={inputClass}
						>
							<option value={1}>Monday</option>
							<option value={0}>Sunday</option>
							<option value={6}>Saturday</option>
						</select>
					)}
				</Field>
			</Section>

			<Section id="lists" title="Lists">
				<Toggle
					label="Group tasks in Today by project"
					checked={settings.groupTodayByProject ?? false}
					onChange={(groupTodayByProject) =>
						save({ settings: { groupTodayByProject } })
					}
				/>
				<Field
					group
					label="Move completed tasks to the Logbook"
					hint="Daily keeps them in their lists, checked, until the end of the day."
				>
					{(ids) => (
						<Segmented
							ids={ids}
							value={settings.logbookTiming ?? "immediately"}
							options={[
								["immediately", "Immediately"],
								["daily", "Daily"],
							]}
							onChange={(logbookTiming) =>
								save({ settings: { logbookTiming } })
							}
						/>
					)}
				</Field>
			</Section>

			<Section
				id="sidebar"
				title="Sidebar"
				footer="Inbox, Today, Logbook and Trash always show. Every view can be found with search, shown in the sidebar or not."
			>
				{OPTIONAL_VIEWS.map((view) => (
					<Toggle
						key={view}
						label={`Show ${VIEWS[view].title}`}
						icon={VIEWS[view].icon("size-4")}
						checked={shownViews.has(view)}
						onChange={(on) =>
							save({
								settings: {
									sidebarViews: OPTIONAL_VIEWS.filter((v) =>
										v === view ? on : shownViews.has(v),
									),
								},
							})
						}
					/>
				))}
				<ActionRow
					text="Reset sidebar to default"
					hint={
						isDefaultSidebar
							? "The sidebar shows the default views."
							: "Shows Upcoming, Anytime, Someday and Overdue again."
					}
				>
					<button
						type="button"
						aria-label="Reset sidebar to default"
						disabled={isDefaultSidebar}
						onClick={() =>
							save({ settings: { sidebarViews: [...DEFAULT_SIDEBAR_VIEWS] } })
						}
						className={secondaryButtonClass}
					>
						Reset
					</button>
				</ActionRow>
			</Section>

			<Section id="notifications" title="Notifications">
				<NotificationsSetting />
			</Section>

			<Section id="data" title="Data">
				<DataSettings />
			</Section>

			{passwordMode && (
				<Section id="security" title="Security">
					<SecuritySettings />
				</Section>
			)}

			<Section id="account" title="Account">
				<AccountSettings passwordMode={passwordMode} />
			</Section>

			<Section id="about" title="About">
				<div className="flex min-h-12 items-center justify-between gap-4 py-2 text-sm">
					<span>Version</span>
					<span className="text-[var(--fg-muted)] tabular-nums">
						{APP_VERSION}
					</span>
				</div>
				<LinkRow href="/changelog">What's new</LinkRow>
				<LinkRow href="/privacy">Privacy Policy</LinkRow>
				<LinkRow href="/terms">Terms of Service</LinkRow>
			</Section>
		</ListPage>
	);
}

// ---------------------------------------------------------------------------
// Sections

/** Password sign-in (not single sign-on): Security and the password rows show. */
function usePasswordMode(): boolean {
	const [passwordMode, setPasswordMode] = useState(false);
	useEffect(() => {
		api<{ mode: string }>("/auth/config")
			.then((config) => setPasswordMode(config.mode === "password"))
			.catch(() => {});
	}, []);
	return passwordMode;
}

/** Per device (so a phone and a laptop can differ); applies instantly. */
function TextSizeField() {
	const [size, setSize] = useState<TextSize>(loadTextSize);
	return (
		<Field
			group
			label="Text size"
			hint="This device only. On a computer you can also drag the sidebar's edge to resize it."
		>
			{(ids) => (
				<Segmented
					ids={ids}
					value={size}
					options={TEXT_SIZES.map(([value, label]) => [value, label])}
					onChange={(next) => {
						setSize(next);
						applyTextSize(next);
					}}
				/>
			)}
		</Field>
	);
}

function NotificationsSetting() {
	const [state, enable] = useNotificationState();
	const text = {
		unsupported: "This browser can't show reminders as notifications.",
		default: "Reminders can notify you on this device.",
		granted: "Reminders notify you on this device.",
		denied:
			"Notifications are blocked. Allow them for this site in your browser's settings.",
	}[state];
	const on = state === "granted";
	return (
		<ActionRow
			text={
				<span className="flex items-center gap-2">
					<span
						aria-hidden
						className={`size-2 shrink-0 rounded-full ${on ? "bg-done" : state === "denied" ? "bg-overdue" : "bg-[var(--checkbox)]"}`}
					/>
					Reminders on this device
				</span>
			}
			hint={text}
		>
			{state === "default" && (
				<button type="button" onClick={enable} className={buttonClass}>
					Turn on
				</button>
			)}
		</ActionRow>
	);
}

function DataSettings() {
	const { user } = useAuth();
	const { db, engine } = useSyncContext();
	const fileInput = useRef<HTMLInputElement>(null);
	const [status, setStatus] = useState<{
		text: string;
		error?: boolean;
	} | null>(null);
	const [busy, setBusy] = useState(false);

	const run = async (work: () => Promise<string>) => {
		setBusy(true);
		setStatus(null);
		try {
			setStatus({ text: await work() });
		} catch (err) {
			setStatus({
				text: err instanceof Error ? err.message : String(err),
				error: true,
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<ActionRow
			text="Export and import"
			hint="Export everything as a JSON file. Importing a file adds copies of its lists and tasks; nothing you have is changed."
			note={
				status && (
					<p
						role={status.error ? "alert" : "status"}
						className={`mt-2 text-sm ${status.error ? "text-overdue" : "text-[var(--fg-muted)]"}`}
					>
						{status.text}
					</p>
				)
			}
		>
			<span className="contents" aria-busy={busy}>
				<button
					type="button"
					disabled={busy}
					onClick={() =>
						run(async () => `Saved ${await downloadExport(user.encrypted)}.`)
					}
					className={buttonClass}
				>
					Export…
				</button>
				<button
					type="button"
					disabled={busy}
					onClick={() => fileInput.current?.click()}
					className={secondaryButtonClass}
				>
					Import…
				</button>
				<input
					ref={fileInput}
					type="file"
					accept="application/json,.json"
					className="hidden"
					tabIndex={-1}
					aria-hidden
					onChange={(e) => {
						const file = e.target.files?.[0];
						e.target.value = "";
						if (file)
							void run(() =>
								importFile(file, user.encrypted ? { db, engine } : undefined),
							);
					}}
				/>
			</span>
		</ActionRow>
	);
}

/** The person's name; empty removes it. */
function NameSetting() {
	const { user, save, error } = useSaveProfile();
	const [draft, setDraft] = useState(user.name ?? "");
	const [saved, setSaved] = useState(false);
	const id = useId();
	const hintId = useId();
	const changed = draft.trim() !== (user.name ?? "");

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		setSaved(false);
		if (await save({ name: draft })) {
			setDraft(draft.trim());
			setSaved(true);
		}
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-1 py-3 text-sm">
			<label htmlFor={id}>Name</label>
			<div className="flex gap-2">
				<input
					id={id}
					autoComplete="name"
					maxLength={100}
					value={draft}
					onChange={(e) => {
						setDraft(e.target.value);
						setSaved(false);
					}}
					aria-describedby={hintId}
					className={inputClass}
				/>
				<button type="submit" disabled={!changed} className={buttonClass}>
					Save
				</button>
			</div>
			<p
				id={hintId}
				role={error ? "alert" : "status"}
				className={`text-xs ${error ? "text-overdue" : "text-[var(--fg-muted)]"}`}
			>
				{error ?? (saved ? "Saved." : "Leave it empty to remove your name.")}
			</p>
		</form>
	);
}

function AccountSettings({ passwordMode }: { passwordMode: boolean }) {
	const { user, sessionExpired } = useAuth();
	const [confirming, setConfirming] = useState(false);

	const signOutEverywhere = async () => {
		await api("/auth/logout-all", { method: "POST" });
		sessionExpired();
	};

	return (
		<>
			<ActionRow
				text="Signed in as"
				hint={
					<span className="block truncate font-medium text-[var(--fg)]">
						{user.email}
					</span>
				}
			>
				<SignOutButton className={secondaryButtonClass} />
			</ActionRow>
			<NameSetting />
			{passwordMode && (
				<>
					<ChangePassword />
					<ActionRow
						text="Sign out of all devices"
						hint="Including this one. You'll need to sign in again everywhere."
					>
						{confirming ? (
							<span className="flex gap-2">
								<button
									type="button"
									onClick={() => void signOutEverywhere()}
									className={dangerButtonClass}
								>
									Sign out everywhere
								</button>
								<button
									type="button"
									onClick={() => setConfirming(false)}
									className={secondaryButtonClass}
								>
									Cancel
								</button>
							</span>
						) : (
							<button
								type="button"
								onClick={() => setConfirming(true)}
								className={dangerOutlineClass}
							>
								Sign out everywhere…
							</button>
						)}
					</ActionRow>
				</>
			)}
		</>
	);
}

function ChangePassword() {
	const { user } = useAuth();
	const [open, setOpen] = useState(false);
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [status, setStatus] = useState<{
		text: string;
		error?: boolean;
	} | null>(null);
	const currentId = useId();
	const nextId = useId();
	const nextHintId = useId();

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		setStatus(null);
		try {
			const { body } = await confirmBody(user.email, current);
			const keys = await newPasswordKeys(user.email, next);
			await api("/auth/password", {
				method: "POST",
				body: {
					currentPassword: body.password,
					currentLegacyPassword: body.legacyPassword,
					newPassword: keys.authKey,
					wrappedByPassword: await wrapForPassword(keys.encKey),
				},
			});
			await markUpgraded(user.email);
			setCurrent("");
			setNext("");
			setOpen(false);
			setStatus({ text: "Password changed. Other devices were signed out." });
		} catch (err) {
			const code =
				err instanceof ApiError
					? err.code
					: err instanceof PasswordTooShort
						? "invalid_input"
						: null;
			setStatus({
				error: true,
				text:
					code === "wrong_password"
						? "That's not your current password."
						: code === "invalid_input"
							? "The new password needs at least 8 characters."
							: "Couldn't change your password. Check your connection.",
			});
		}
	};

	if (!open) {
		return (
			<ActionRow
				text="Password"
				hint={
					status && (
						<span
							role={status.error ? "alert" : "status"}
							className={status.error ? "text-overdue" : undefined}
						>
							{status.text}
						</span>
					)
				}
			>
				<button
					type="button"
					onClick={() => setOpen(true)}
					className={secondaryButtonClass}
				>
					Change password…
				</button>
			</ActionRow>
		);
	}
	return (
		<form onSubmit={submit} className="flex flex-col gap-3 py-3">
			<p className="text-sm font-medium">Change password</p>
			<div className="flex flex-col gap-1 text-sm">
				<label htmlFor={currentId}>Current password</label>
				<PasswordInput
					id={currentId}
					autoComplete="current-password"
					required
					value={current}
					onChange={(e) => setCurrent(e.target.value)}
					className={inputClass}
				/>
			</div>
			<div className="flex flex-col gap-1 text-sm">
				<label htmlFor={nextId}>New password</label>
				<PasswordInput
					id={nextId}
					autoComplete="new-password"
					required
					minLength={8}
					value={next}
					onChange={(e) => setNext(e.target.value)}
					aria-describedby={nextHintId}
					className={inputClass}
				/>
				<p id={nextHintId} className="text-xs text-[var(--fg-muted)]">
					At least 8 characters.
				</p>
			</div>
			{status?.error && (
				<p role="alert" className="text-sm text-overdue">
					{status.text}
				</p>
			)}
			<div className="flex gap-2">
				<button type="submit" className={buttonClass}>
					Change password
				</button>
				<button
					type="button"
					onClick={() => {
						setOpen(false);
						setStatus(null);
					}}
					className={secondaryButtonClass}
				>
					Cancel
				</button>
			</div>
		</form>
	);
}

/** Jump links to each section; stays under the top bar while scrolling, and marks where you are. */
function SectionNav({
	sections,
}: {
	sections: readonly (readonly [SectionId, string])[];
}) {
	const [active, setActive] = useState<SectionId>(
		sections[0]?.[0] ?? "appearance",
	);
	const bar = useRef<HTMLElement>(null);
	// A jump in progress: the section, whether it's the follow-up jump, and the
	// timer that ends it once the page stops scrolling. While it runs, the
	// picked section stays highlighted.
	const jump = useRef<{
		id: SectionId;
		retried: boolean;
		timer: number;
	} | null>(null);

	const scroller = () => bar.current?.closest("main") ?? null;
	/** How far the page must scroll to land a section's heading just under the bars. */
	const offsetOf = (id: SectionId) => {
		const nav = bar.current;
		const el = document.getElementById(`settings-${id}`);
		if (!nav || !el) return null;
		return (
			el.getBoundingClientRect().top - nav.getBoundingClientRect().bottom - 12
		);
	};

	const jumpTo = (id: SectionId, retried = false) => {
		const main = scroller();
		const offset = offsetOf(id);
		if (!main || offset === null) return;
		setActive(id);
		if (jump.current) clearTimeout(jump.current.timer);
		// Ends on a quiet moment if the page doesn't scroll at all.
		jump.current = { id, retried, timer: window.setTimeout(endJump, 600) };
		main.scrollTo({
			top: main.scrollTop + offset,
			behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
				? "auto"
				: "smooth",
		});
	};

	const endJump = () => {
		const done = jump.current;
		if (!done) return;
		clearTimeout(done.timer);
		jump.current = null;
		// Sections that load late can move the target while the page scrolls;
		// finish the jump once if it fell short.
		const main = scroller();
		const offset = offsetOf(done.id);
		if (done.retried || !main || offset === null || Math.abs(offset) <= 4)
			return;
		const atEnd = main.scrollTop >= main.scrollHeight - main.clientHeight - 1;
		if (offset < 0 || !atEnd) jumpTo(done.id, true);
	};
	const endJumpRef = useRef(endJump);
	endJumpRef.current = endJump;

	// The current section is the last one whose heading has passed under the bars;
	// at the very bottom it's the last section, however short.
	useEffect(() => {
		const main = bar.current?.closest("main");
		if (!main) return;
		const update = () => {
			// A jump ends when the page stops scrolling ("scrollend", or a quiet
			// moment where that event isn't supported).
			if (jump.current) {
				clearTimeout(jump.current.timer);
				jump.current.timer = window.setTimeout(() => endJumpRef.current(), 200);
				return;
			}
			const navBottom = bar.current?.getBoundingClientRect().bottom ?? 0;
			const atEnd = main.scrollTop + main.clientHeight >= main.scrollHeight - 4;
			let current = sections[0]?.[0];
			for (const [id] of sections) {
				const el = document.getElementById(`settings-${id}`);
				if (el && el.getBoundingClientRect().top <= navBottom + 24)
					current = id;
			}
			if (atEnd) current = sections.at(-1)?.[0];
			if (current) setActive(current);
		};
		const onScrollEnd = () => endJumpRef.current();
		update();
		main.addEventListener("scroll", update, { passive: true });
		main.addEventListener("scrollend", onScrollEnd);
		return () => {
			main.removeEventListener("scroll", update);
			main.removeEventListener("scrollend", onScrollEnd);
		};
	}, [sections]);
	// Keep the current link in view when the bar scrolls sideways (phones).
	// Only the bar moves, and at once: a smooth scroll here (or scrollIntoView)
	// stops the page's own smooth scroll in Chrome.
	useEffect(() => {
		const nav = bar.current;
		const link = nav?.querySelector<HTMLElement>(`[data-section="${active}"]`);
		if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
		const left = link.offsetLeft - nav.offsetLeft;
		if (
			left < nav.scrollLeft ||
			left + link.offsetWidth > nav.scrollLeft + nav.clientWidth
		)
			nav.scrollLeft = left - 16;
	}, [active]);

	return (
		<nav
			ref={bar}
			aria-label="Settings sections"
			className="sticky top-[calc(2.75rem+env(safe-area-inset-top))] z-[9] -mx-4 mb-6 flex gap-1 overflow-x-auto md:flex-wrap md:overflow-visible bg-[var(--bg)]/90 px-4 py-2 backdrop-blur [scrollbar-width:none] max-md:[mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)]"
		>
			{sections.map(([id, title]) => (
				<a
					key={id}
					href={`#settings-${id}`}
					data-section={id}
					aria-current={active === id ? "true" : undefined}
					onClick={(e) => {
						e.preventDefault();
						jumpTo(id);
					}}
					className="shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap text-[var(--fg-muted)] transition-colors duration-150 hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-[current=true]:bg-[var(--selected)] aria-[current=true]:text-[var(--fg)] pointer-coarse:py-2 relative pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-1.5"
				>
					{title}
				</a>
			))}
		</nav>
	);
}

/** A titled group of settings in a rounded panel, with an optional note under it. */
function Section({
	id,
	title,
	footer,
	children,
}: {
	id: SectionId;
	title: string;
	footer?: ReactNode;
	children: ReactNode;
}) {
	const headingId = useId();
	return (
		<section
			id={`settings-${id}`}
			aria-labelledby={headingId}
			// Clears the top bar and the jump bar when jumped to.
			className="mb-8 scroll-mt-28 md:scroll-mt-36"
		>
			<h2
				id={headingId}
				className="mb-2 px-1 text-xs font-semibold tracking-wide text-[var(--fg-muted)] uppercase"
			>
				{title}
			</h2>
			<div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4">
				{children}
			</div>
			{footer && (
				<p className="mt-2 px-1 text-xs text-[var(--fg-muted)]">{footer}</p>
			)}
		</section>
	);
}

/** A row that opens another page. */
function LinkRow({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a
			href={href}
			className="-mx-4 flex min-h-12 items-center justify-between gap-4 px-4 py-2 text-sm transition-colors duration-150 first:rounded-t-xl last:rounded-b-xl hover:bg-[var(--hover)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
		>
			{children}
			<ChevronIcon className="size-4 text-[var(--fg-muted)]" />
		</a>
	);
}

function Toggle({
	label,
	hint,
	icon,
	className = "",
	checked,
	onChange,
}: {
	label: string;
	hint?: string;
	icon?: ReactNode;
	className?: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	const id = useId();
	const hintId = useId();
	return (
		<div
			className={`flex min-h-12 items-center justify-between gap-4 py-3 ${className}`}
		>
			<div className="flex min-w-0 items-center gap-2.5">
				{icon && <span className="flex shrink-0">{icon}</span>}
				<div className="min-w-0">
					<label htmlFor={id} className="text-sm">
						{label}
					</label>
					{hint && (
						<p id={hintId} className="mt-0.5 text-xs text-[var(--fg-muted)]">
							{hint}
						</p>
					)}
				</div>
			</div>
			<input
				id={id}
				type="checkbox"
				role="switch"
				aria-checked={checked}
				aria-describedby={hint ? hintId : undefined}
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-[var(--checkbox)] transition-colors duration-150 before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-white before:shadow-sm before:transition-transform before:duration-150 checked:bg-accent checked:before:translate-x-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:before:transition-none pointer-coarse:h-7 pointer-coarse:w-12 pointer-coarse:before:size-6 pointer-coarse:checked:before:translate-x-5 pointer-coarse:after:absolute pointer-coarse:after:-inset-2"
			/>
		</div>
	);
}
