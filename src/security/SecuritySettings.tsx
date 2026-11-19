// Settings → Security: end-to-end encryption, the recovery key, and this
// device's passcode (SPEC §8.5).

import { type FormEvent, type ReactNode, useId, useState } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth/AuthGate";
import { PasswordInput } from "../components/PasswordInput";
import {
	disableEncryption,
	enableEncryption,
	newRecoveryKey,
	removePasscode,
	replaceRecoveryKey,
	setPasscode,
} from "../crypto/account";
import { lockNow, useCryptoState } from "../crypto/session";
import {
	AUTO_LOCK_OPTIONS,
	type AutoLock,
	loadAutoLock,
	saveAutoLock,
} from "./autoLock";
import { RecoveryKeyCard } from "./RecoveryKeyCard";

const buttonClass =
	"rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60 pointer-coarse:py-2.5";
const primaryClass =
	"rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-60 pointer-coarse:py-2.5";
const dangerClass =
	"rounded-lg bg-overdue px-3 py-1.5 text-sm font-medium text-on-overdue hover:opacity-90 disabled:opacity-60 pointer-coarse:py-2.5";
const inputClass =
	"w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

export const MIN_PASSCODE_LENGTH = 6;

function errorText(err: unknown): string {
	if (err instanceof ApiError) {
		if (err.code === "wrong_password") return "That's not your password.";
		if (err.code === "too_many_attempts")
			return "Too many attempts. Wait a minute and try again.";
	}
	return "Something went wrong. Check your connection and try again.";
}

type Panel = "enable" | "disable" | "recovery" | "passcode" | null;

export function SecuritySettings() {
	const { user, updateUser } = useAuth();
	const crypto = useCryptoState();
	const [panel, setPanel] = useState<Panel>(null);
	const [status, setStatus] = useState<string | null>(null);

	const done = (text: string) => {
		setPanel(null);
		setStatus(text);
	};

	return (
		<>
			<Row
				text={
					user.encrypted
						? "End-to-end encryption is on. Your to-dos, notes, checklists and list names are encrypted on your devices; only you can read them."
						: "End-to-end encryption is off. Turn it on so your to-dos are encrypted on your devices and only you can read them."
				}
			>
				{panel === null &&
					(user.encrypted ? (
						<span className="flex flex-wrap justify-end gap-2">
							<button
								type="button"
								onClick={() => setPanel("recovery")}
								className={buttonClass}
							>
								New recovery key…
							</button>
							<button
								type="button"
								onClick={() => setPanel("disable")}
								className={buttonClass}
							>
								Turn off…
							</button>
						</span>
					) : (
						<button
							type="button"
							onClick={() => {
								setStatus(null);
								setPanel("enable");
							}}
							className={primaryClass}
						>
							Turn on encryption…
						</button>
					))}
			</Row>
			{status && (
				<p role="status" className="py-2 text-sm text-[var(--fg-muted)]">
					{status}
				</p>
			)}
			{panel === "enable" && (
				<KeyPanel
					intro="Before you turn it on, save your recovery key. If you forget your password, it's the only way to read your to-dos: we can't reset encryption for you."
					action="Turn on encryption"
					onCancel={() => setPanel(null)}
					onSubmit={async (password, recovery) => {
						updateUser(await enableEncryption(user, password, recovery));
						done(
							"Encryption is on. Your to-dos are being encrypted; your other devices will ask for your password once.",
						);
					}}
				/>
			)}
			{panel === "recovery" && (
				<KeyPanel
					intro="Your old recovery key will stop working."
					action="Save new recovery key"
					onCancel={() => setPanel(null)}
					onSubmit={async (password, recovery) => {
						await replaceRecoveryKey(user, password, recovery);
						done(
							"Your new recovery key is ready. The old one no longer works.",
						);
					}}
				/>
			)}
			{panel === "disable" && (
				<PasswordPanel
					intro="Your to-dos will be stored without end-to-end encryption again. Any passcode on this device is removed."
					action="Turn off encryption"
					danger
					onCancel={() => setPanel(null)}
					onSubmit={async (password) => {
						if (crypto.passcode) await removePasscode(user.id);
						updateUser(await disableEncryption(user, password));
						done("Encryption is off. Your to-dos are being decrypted.");
					}}
				/>
			)}

			<PasscodeSettings
				encrypted={user.encrypted}
				open={panel === "passcode"}
				onOpen={() => setPanel("passcode")}
				onClose={() => setPanel(null)}
			/>
		</>
	);
}

function Row({ text, children }: { text: ReactNode; children?: ReactNode }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 py-2">
			<p className="min-w-0 flex-1 text-sm sm:min-w-[16rem]">{text}</p>
			{children}
		</div>
	);
}

function PasswordField({
	value,
	onChange,
	label = "Your password",
}: {
	value: string;
	onChange: (value: string) => void;
	label?: string;
}) {
	const id = useId();
	const { user } = useAuth();
	return (
		<div className="flex flex-col gap-1 text-sm">
			<input
				type="email"
				autoComplete="username"
				value={user.email}
				readOnly
				hidden
			/>
			<label htmlFor={id}>{label}</label>
			<PasswordInput
				id={id}
				autoComplete="current-password"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={inputClass}
			/>
		</div>
	);
}

/** A new recovery key, confirmed as saved, plus the password. */
function KeyPanel({
	intro,
	action,
	onSubmit,
	onCancel,
}: {
	intro: string;
	action: string;
	onSubmit: (password: string, recovery: string) => Promise<void>;
	onCancel: () => void;
}) {
	const [recovery] = useState(newRecoveryKey);
	const [saved, setSaved] = useState(false);
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			await onSubmit(password, recovery);
		} catch (err) {
			setError(errorText(err));
			setBusy(false);
		}
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-3 py-2">
			<p className="text-sm text-[var(--fg-muted)]">{intro}</p>
			<RecoveryKeyCard
				recoveryKey={recovery}
				saved={saved}
				onSavedChange={setSaved}
			/>
			<PasswordField value={password} onChange={setPassword} />
			{error && (
				<p role="alert" className="text-sm text-overdue">
					{error}
				</p>
			)}
			<span className="flex gap-2">
				<button
					type="submit"
					disabled={busy || !saved || password === ""}
					className={primaryClass}
				>
					{busy ? "…" : action}
				</button>
				<button type="button" onClick={onCancel} className={buttonClass}>
					Cancel
				</button>
			</span>
		</form>
	);
}

function PasswordPanel({
	intro,
	action,
	danger,
	onSubmit,
	onCancel,
}: {
	intro: string;
	action: string;
	danger?: boolean;
	onSubmit: (password: string) => Promise<void>;
	onCancel: () => void;
}) {
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			await onSubmit(password);
		} catch (err) {
			setError(errorText(err));
			setBusy(false);
		}
	};
	return (
		<form onSubmit={submit} className="flex flex-col gap-3 py-2">
			<p className="text-sm text-[var(--fg-muted)]">{intro}</p>
			<PasswordField value={password} onChange={setPassword} />
			{error && (
				<p role="alert" className="text-sm text-overdue">
					{error}
				</p>
			)}
			<span className="flex gap-2">
				<button
					type="submit"
					disabled={busy || password === ""}
					className={danger ? dangerClass : primaryClass}
				>
					{busy ? "…" : action}
				</button>
				<button type="button" onClick={onCancel} className={buttonClass}>
					Cancel
				</button>
			</span>
		</form>
	);
}

function PasscodeSettings({
	encrypted,
	open,
	onOpen,
	onClose,
}: {
	encrypted: boolean;
	open: boolean;
	onOpen: () => void;
	onClose: () => void;
}) {
	const { user } = useAuth();
	const crypto = useCryptoState();
	const [first, setFirst] = useState("");
	const [second, setSecond] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [autoLock, setAutoLock] = useState<AutoLock>(loadAutoLock);
	const firstId = useId();
	const secondId = useId();
	const autoLockLabel = useId();

	if (!encrypted)
		return (
			<Row text="Passcode on this device: turn on encryption first, so a passcode can keep this device's copy unreadable while it's locked." />
		);

	const submit = async (e: FormEvent) => {
		e.preventDefault();
		setError(null);
		if (first.length < MIN_PASSCODE_LENGTH)
			return setError(`Use at least ${MIN_PASSCODE_LENGTH} characters.`);
		if (first !== second) return setError("The passcodes don't match.");
		try {
			await setPasscode(user.id, first);
			setFirst("");
			setSecond("");
			onClose();
			setStatus(
				"Passcode set. mythings locks on this device when you're away.",
			);
		} catch {
			setError("Couldn't set the passcode. Try again.");
		}
	};

	return (
		<>
			<Row
				text={
					crypto.passcode
						? "This device is protected by a passcode."
						: "Add a passcode to lock mythings on this device. While it's locked, nothing on this device can be read without the passcode."
				}
			>
				{!open && (
					<span className="flex flex-wrap justify-end gap-2">
						{crypto.passcode && (
							<button type="button" onClick={lockNow} className={buttonClass}>
								Lock now
							</button>
						)}
						<button
							type="button"
							onClick={() => {
								setStatus(null);
								onOpen();
							}}
							className={crypto.passcode ? buttonClass : primaryClass}
						>
							{crypto.passcode ? "Change passcode…" : "Set passcode…"}
						</button>
						{crypto.passcode && (
							<button
								type="button"
								onClick={async () => {
									await removePasscode(user.id);
									setStatus("Passcode removed.");
								}}
								className={buttonClass}
							>
								Remove
							</button>
						)}
					</span>
				)}
			</Row>
			{status && (
				<p role="status" className="py-2 text-sm text-[var(--fg-muted)]">
					{status}
				</p>
			)}
			{open && (
				<form onSubmit={submit} className="flex flex-col gap-3 py-2">
					<p className="text-sm text-[var(--fg-muted)]">
						This device only. A longer passcode is harder to guess. If you
						forget it, sign in with your password instead.
					</p>
					<div className="flex flex-col gap-1 text-sm">
						<label htmlFor={firstId}>New passcode</label>
						<PasswordInput
							id={firstId}
							autoComplete="off"
							value={first}
							onChange={(e) => setFirst(e.target.value)}
							className={inputClass}
						/>
					</div>
					<div className="flex flex-col gap-1 text-sm">
						<label htmlFor={secondId}>Repeat passcode</label>
						<PasswordInput
							id={secondId}
							autoComplete="off"
							value={second}
							onChange={(e) => setSecond(e.target.value)}
							className={inputClass}
						/>
					</div>
					{error && (
						<p role="alert" className="text-sm text-overdue">
							{error}
						</p>
					)}
					<span className="flex gap-2">
						<button type="submit" className={primaryClass}>
							Save passcode
						</button>
						<button type="button" onClick={onClose} className={buttonClass}>
							Cancel
						</button>
					</span>
				</form>
			)}
			{crypto.passcode && (
				<div className="flex flex-wrap items-center justify-between gap-2 py-2">
					<p id={autoLockLabel} className="text-sm">
						Lock after
					</p>
					<div
						role="radiogroup"
						aria-labelledby={autoLockLabel}
						className="flex rounded-lg bg-[var(--segment)] p-0.5 text-sm ring-1 ring-[var(--border)] ring-inset"
					>
						{AUTO_LOCK_OPTIONS.map(([value, label]) => (
							<label
								key={value}
								className="relative cursor-pointer rounded-md px-2 py-1 text-center text-[var(--fg-muted)] hover:text-[var(--fg)] has-[:checked]:bg-[var(--segment-on)] has-[:checked]:font-medium has-[:checked]:text-[var(--on-segment-on)] has-[:checked]:shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
							>
								<input
									type="radio"
									name={autoLockLabel}
									value={value}
									checked={autoLock === value}
									onChange={() => {
										setAutoLock(value);
										saveAutoLock(value);
									}}
									className="sr-only"
								/>
								{label}
							</label>
						))}
					</div>
				</div>
			)}
		</>
	);
}
