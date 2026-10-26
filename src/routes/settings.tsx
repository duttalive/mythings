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
import type { Me, Settings } from "../../shared/schema";
import { ApiError, api } from "../api";
import { useAuth } from "../auth/AuthGate";
import { APP_VERSION } from "../changelog";
import { GearIcon } from "../components/icons";
import { ListPage } from "../components/ListPage";
import { PasswordInput } from "../components/PasswordInput";
import { SignOutButton } from "../components/SignOutButton";
import {
	applyTextSize,
	loadTextSize,
	TEXT_SIZES,
	type TextSize,
} from "../lib/textSize";
import { downloadExport, importFile } from "../lib/transfer";
import { useNotificationState } from "../push/notifications";

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

export function SettingsPage() {
	const { user, save, error } = useSaveProfile();
	const settings = user.settings;
	const device = deviceTimeZone();
	const zones = useMemo(() => allTimeZones(user.tz), [user.tz]);

	return (
		<ListPage
			title="Settings"
			icon={<GearIcon className="size-7 text-[var(--fg-muted)]" />}
		>
			{error && (
				<p
					role="alert"
					className="mb-4 rounded-lg bg-overdue/10 px-3 py-2 text-sm text-overdue"
				>
					{error}
				</p>
			)}

			<Section title="Appearance">
				<Field label="Theme">
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
			</Section>

			<Section title="Date & time">
				<Field
					label="Time zone"
					hint={
						user.tz !== device ? (
							<button
								type="button"
								onClick={() => save({ tz: device })}
								className="text-accent hover:underline"
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

			<Section title="Lists">
				<Toggle
					label="Group to-dos in Today by project"
					checked={settings.groupTodayByProject ?? false}
					onChange={(groupTodayByProject) =>
						save({ settings: { groupTodayByProject } })
					}
				/>
				<Field
					label="Move completed to-dos to the Logbook"
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

			<Section title="Notifications">
				<NotificationsSetting />
			</Section>

			<Section title="Data">
				<DataSettings />
			</Section>

			<Section title="Account">
				<AccountSettings />
			</Section>

			<Section title="About">
				<div className="flex items-center justify-between gap-4 py-2">
					<p className="text-sm">mythings version {APP_VERSION}</p>
					<a href="/changelog" className={secondaryButtonClass}>
						What's new
					</a>
				</div>
				<div className="flex items-center justify-between gap-4 py-2">
					<p className="text-sm">Legal</p>
					<span className="flex flex-wrap justify-end gap-2">
						<a href="/privacy" className={secondaryButtonClass}>
							Privacy Policy
						</a>
						<a href="/terms" className={secondaryButtonClass}>
							Terms of Service
						</a>
					</span>
				</div>
			</Section>
		</ListPage>
	);
}

// ---------------------------------------------------------------------------
// Sections

/** Per device (so a phone and a laptop can differ); applies instantly. */
function TextSizeField() {
	const [size, setSize] = useState<TextSize>(loadTextSize);
	return (
		<Field
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
	return (
		<div className="flex items-center justify-between gap-4 py-2">
			<p className="text-sm">{text}</p>
			{state === "default" && (
				<button type="button" onClick={enable} className={buttonClass}>
					Turn on
				</button>
			)}
		</div>
	);
}

function DataSettings() {
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
		<div className="py-2">
			<p className="text-sm text-[var(--fg-muted)]">
				Export everything as a JSON file. Importing a file adds copies of its
				lists and to-dos; nothing you have is changed.
			</p>
			<div className="mt-3 flex flex-wrap gap-2">
				<button
					type="button"
					disabled={busy}
					onClick={() => run(async () => `Saved ${await downloadExport()}.`)}
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
						if (file) void run(() => importFile(file));
					}}
				/>
			</div>
			{status && (
				<p
					role={status.error ? "alert" : "status"}
					className={`mt-2 text-sm ${status.error ? "text-overdue" : "text-[var(--fg-muted)]"}`}
				>
					{status.text}
				</p>
			)}
		</div>
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
		<form onSubmit={submit} className="flex flex-col gap-1 py-2 text-sm">
			<label htmlFor={id} className="font-medium">
				Name
			</label>
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

function AccountSettings() {
	const { user, sessionExpired } = useAuth();
	const [passwordMode, setPasswordMode] = useState(false);
	const [confirming, setConfirming] = useState(false);

	useEffect(() => {
		api<{ mode: string }>("/auth/config")
			.then((config) => setPasswordMode(config.mode === "password"))
			.catch(() => {});
	}, []);

	const signOutEverywhere = async () => {
		await api("/auth/logout-all", { method: "POST" });
		sessionExpired();
	};

	return (
		<>
			<div className="flex items-center justify-between gap-4 py-2">
				<p className="min-w-0 truncate text-sm">
					Signed in as <span className="font-medium">{user.email}</span>
				</p>
				<SignOutButton className={secondaryButtonClass} />
			</div>
			<NameSetting />
			{passwordMode && (
				<>
					<ChangePassword />
					<div className="flex flex-wrap items-center justify-between gap-2 py-2">
						<p className="text-sm">
							Sign out of all devices, including this one.
						</p>
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
								className={secondaryButtonClass}
							>
								Sign out of all devices…
							</button>
						)}
					</div>
				</>
			)}
		</>
	);
}

function ChangePassword() {
	const [open, setOpen] = useState(false);
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [status, setStatus] = useState<{
		text: string;
		error?: boolean;
	} | null>(null);
	const currentId = useId();
	const nextId = useId();

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		setStatus(null);
		try {
			await api("/auth/password", {
				method: "POST",
				body: { currentPassword: current, newPassword: next },
			});
			setCurrent("");
			setNext("");
			setOpen(false);
			setStatus({ text: "Password changed. Other devices were signed out." });
		} catch (err) {
			const code = err instanceof ApiError ? err.code : null;
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
			<div className="flex flex-wrap items-center justify-between gap-2 py-2">
				<p role={status?.error ? "alert" : "status"} className="text-sm">
					{status?.text ?? "Password"}
				</p>
				<button
					type="button"
					onClick={() => setOpen(true)}
					className={secondaryButtonClass}
				>
					Change password…
				</button>
			</div>
		);
	}
	return (
		<form onSubmit={submit} className="flex flex-col gap-3 py-2">
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
					className={inputClass}
				/>
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

// ---------------------------------------------------------------------------
// Building blocks

const inputClass =
	"w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-accent";
const buttonBase =
	"shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50";
const buttonClass = `${buttonBase} bg-accent text-on-accent hover:opacity-90`;
const secondaryButtonClass = `${buttonBase} border border-[var(--border)] hover:bg-[var(--hover)]`;
const dangerButtonClass = `${buttonBase} bg-overdue text-on-overdue hover:opacity-90`;

function Section({ title, children }: { title: string; children: ReactNode }) {
	const id = useId();
	return (
		<section aria-labelledby={id} className="mb-8">
			<h2
				id={id}
				className="mb-1 border-b border-[var(--border)] pb-1.5 text-sm font-semibold text-[var(--fg-muted)]"
			>
				{title}
			</h2>
			<div className="divide-y divide-[var(--border)]">{children}</div>
		</section>
	);
}

type FieldIds = { id: string; labelId: string; hintId?: string };

function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: ReactNode;
	children: (ids: FieldIds) => ReactNode;
}) {
	const id = useId();
	const labelId = useId();
	const hintId = useId();
	return (
		<div className="grid gap-1.5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] sm:items-center sm:gap-4">
			<div>
				<label id={labelId} htmlFor={id} className="text-sm">
					{label}
				</label>
				{hint && (
					<p id={hintId} className="text-xs text-[var(--fg-muted)]">
						{hint}
					</p>
				)}
			</div>
			{children({ id, labelId, hintId: hint ? hintId : undefined })}
		</div>
	);
}

/** A row of mutually exclusive buttons (a radio group). */
function Segmented<T extends string>({
	ids,
	value,
	options,
	onChange,
}: {
	ids: FieldIds;
	value: T;
	options: [T, string][];
	onChange: (value: T) => void;
}) {
	const name = useId();
	return (
		<div
			id={ids.id}
			role="radiogroup"
			aria-labelledby={ids.labelId}
			aria-describedby={ids.hintId}
			className="flex rounded-lg bg-[var(--hover)] p-0.5 text-sm"
		>
			{options.map(([option, label]) => (
				<label
					key={option}
					className="relative flex-1 cursor-pointer rounded-md px-2 py-1 text-center has-[:checked]:bg-[var(--card)] has-[:checked]:font-medium has-[:checked]:shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
				>
					<input
						type="radio"
						name={name}
						value={option}
						checked={value === option}
						onChange={() => onChange(option)}
						className="sr-only"
					/>
					{label}
				</label>
			))}
		</div>
	);
}

function Toggle({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	const id = useId();
	return (
		<div className="flex items-center justify-between gap-4 py-3">
			<label htmlFor={id} className="text-sm">
				{label}
			</label>
			<input
				id={id}
				type="checkbox"
				role="switch"
				aria-checked={checked}
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-[var(--checkbox)] transition-colors duration-150 before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-full before:bg-white before:transition-transform before:duration-150 checked:bg-accent checked:before:translate-x-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:before:transition-none"
			/>
		</div>
	);
}
