// Settings → Security: end-to-end encryption, the recovery key, and this
// device's passcode (SPEC §8.5).

import { type FormEvent, useId, useState } from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth/AuthGate";
import { PasswordInput } from "../components/PasswordInput";
import { ActionRow, Field, Segmented } from "../components/SettingsRows";
import {
	secondaryButtonClass as buttonClass,
	dangerButtonClass as dangerClass,
	dangerOutlineClass,
	errorClass,
	inputClass,
	buttonClass as primaryClass,
} from "../components/ui";
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

const statusClass = "mt-1 text-xs text-[var(--fg-muted)]";

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
			<ActionRow
				text={
					user.encrypted
						? "End-to-end encryption is on."
						: "End-to-end encryption is off."
				}
				hint={
					user.encrypted
						? "Your tasks, notes, checklists and list names are encrypted on your devices; only you can read them."
						: "Turn it on so your tasks are encrypted on your devices and only you can read them."
				}
				note={
					status && (
						<p role="status" className={statusClass}>
							{status}
						</p>
					)
				}
			>
				{panel === null &&
					(user.encrypted ? (
						<span className="flex flex-wrap gap-2">
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
								className={dangerOutlineClass}
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
			</ActionRow>
			{panel === "enable" && (
				<KeyPanel
					intro="Before you turn it on, save your recovery key. If you forget your password, it's the only way to read your tasks: we can't reset encryption for you."
					action="Turn on encryption"
					onCancel={() => setPanel(null)}
					onSubmit={async (password, recovery) => {
						updateUser(await enableEncryption(user, password, recovery));
						done(
							"Encryption is on. Your tasks are being encrypted; your other devices will ask for your password once.",
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
					intro="Your tasks will be stored without end-to-end encryption again. Any passcode on this device is removed."
					action="Turn off encryption"
					danger
					onCancel={() => setPanel(null)}
					onSubmit={async (password) => {
						if (crypto.passcode) await removePasscode(user.id);
						updateUser(await disableEncryption(user, password));
						done("Encryption is off. Your tasks are being decrypted.");
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

function PasswordField({
	value,
	onChange,
	label = "Your password",
	describedBy,
}: {
	value: string;
	onChange: (value: string) => void;
	label?: string;
	/** The id of an error about this field, read out with it. */
	describedBy?: string;
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
				aria-describedby={describedBy}
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
	const errorId = useId();

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
		<form onSubmit={submit} className="flex flex-col gap-3 py-3">
			<p className="text-sm text-[var(--fg-muted)]">{intro}</p>
			<RecoveryKeyCard
				recoveryKey={recovery}
				saved={saved}
				onSavedChange={setSaved}
			/>
			<PasswordField
				value={password}
				onChange={setPassword}
				describedBy={error ? errorId : undefined}
			/>
			{error && (
				<p id={errorId} role="alert" className={errorClass}>
					{error}
				</p>
			)}
			<span className="flex gap-2">
				<button
					type="submit"
					disabled={busy || !saved || password === ""}
					aria-busy={busy}
					className={primaryClass}
				>
					{busy ? "Saving…" : action}
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
	const errorId = useId();
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
		<form onSubmit={submit} className="flex flex-col gap-3 py-3">
			<p className="text-sm text-[var(--fg-muted)]">{intro}</p>
			<PasswordField
				value={password}
				onChange={setPassword}
				describedBy={error ? errorId : undefined}
			/>
			{error && (
				<p id={errorId} role="alert" className={errorClass}>
					{error}
				</p>
			)}
			<span className="flex gap-2">
				<button
					type="submit"
					disabled={busy || password === ""}
					aria-busy={busy}
					className={danger ? dangerClass : primaryClass}
				>
					{busy ? "Saving…" : action}
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
	const errorId = useId();

	if (!encrypted)
		return (
			<ActionRow
				text="Passcode on this device"
				hint="Turn on encryption first, so a passcode can keep this device's copy unreadable while it's locked."
			/>
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
			<ActionRow
				text={
					crypto.passcode
						? "This device is protected by a passcode."
						: "Add a passcode to lock mythings on this device."
				}
				hint={
					crypto.passcode
						? undefined
						: "While it's locked, nothing on this device can be read without the passcode."
				}
				note={
					status && (
						<p role="status" className={statusClass}>
							{status}
						</p>
					)
				}
			>
				{!open && (
					<span className="flex flex-wrap gap-2">
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
								className={dangerOutlineClass}
							>
								Remove
							</button>
						)}
					</span>
				)}
			</ActionRow>
			{open && (
				<form onSubmit={submit} className="flex flex-col gap-3 py-3">
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
							aria-describedby={error ? errorId : undefined}
							className={inputClass}
						/>
					</div>
					{error && (
						<p id={errorId} role="alert" className={errorClass}>
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
				<Field group wide label="Lock after">
					{(ids) => (
						<Segmented
							ids={ids}
							value={autoLock}
							options={AUTO_LOCK_OPTIONS.map(([value, label]) => [
								value,
								label,
							])}
							onChange={(value) => {
								setAutoLock(value);
								saveAutoLock(value);
							}}
						/>
					)}
				</Field>
			)}
		</>
	);
}
