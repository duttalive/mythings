// Shows the app only once this device can read the account's text (SPEC
// §8.5): asks for the password (or the recovery key) on a device that hasn't
// got the encryption key yet, and for the passcode on a locked device. Also
// locks a device with a passcode after a while away.

import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useId,
	useState,
} from "react";
import { ApiError } from "../api";
import { useAuth } from "../auth/AuthGate";
import { PasswordInput } from "../components/PasswordInput";
import {
	enableEncryption,
	forgetKeys,
	isRecoveryKey,
	newRecoveryKey,
	refreshPasswordWrap,
	takeTypedKeys,
	unlockWithKeys,
	unlockWithPassword,
	unlockWithRecovery,
	WrongPassword,
	WrongRecoveryKey,
} from "../crypto/account";
import { openWithPasscode, usableKey } from "../crypto/deviceKeys";
import {
	getCryptoState,
	lockNow,
	setEncrypted,
	setKey,
	startCrypto,
	useCryptoState,
} from "../crypto/session";
import { autoLockMs } from "./autoLock";
import { RecoveryKeyCard } from "./RecoveryKeyCard";

export const inputClass =
	"w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";
export const primaryClass =
	"rounded-lg bg-accent px-3 py-2 font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60";

export function SecurityGate({ children }: { children: ReactNode }) {
	const { user } = useAuth();
	const crypto = useCryptoState();
	const [checked, setChecked] = useState(false);

	// Load this device's key; right after signing in, the password just typed opens it.
	useEffect(() => {
		let cancelled = false;
		setChecked(false);
		void (async () => {
			await startCrypto(user.id, user.encrypted);
			const typed = takeTypedKeys(user.email);
			const state = getCryptoState();
			if (user.encrypted && typed) {
				if (!state.key && !state.passcode)
					await unlockWithKeys(user.id, typed.encKey).catch(() => false);
				else if (state.key)
					await refreshPasswordWrap(typed).catch((err) =>
						console.warn("Couldn't update the encryption key", err),
					);
			}
			if (!cancelled) setChecked(true);
		})();
		return () => {
			cancelled = true;
		};
	}, [user.id, user.email, user.encrypted]);

	useEffect(() => setEncrypted(user.encrypted), [user.encrypted]);

	useAutoLock(crypto.passcode && crypto.key !== null);

	if (!crypto.ready || !checked) return null;
	if (crypto.passcode && !crypto.key) return <LockScreen />;
	if (user.encrypted && !crypto.key) return <UnlockScreen />;
	return children;
}

/** Locks after the chosen time without input, or that long in the background. */
function useAutoLock(active: boolean) {
	useEffect(() => {
		if (!active) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let hiddenAt: number | null = null;
		const arm = () => {
			clearTimeout(timer);
			const ms = autoLockMs();
			if (ms > 0) timer = setTimeout(lockNow, ms);
		};
		const onVisibility = () => {
			if (document.visibilityState === "hidden") {
				hiddenAt = Date.now();
				if (autoLockMs() === 0) lockNow();
			} else {
				if (hiddenAt !== null && Date.now() - hiddenAt >= autoLockMs())
					lockNow();
				hiddenAt = null;
				arm();
			}
		};
		const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
		for (const event of events)
			window.addEventListener(event, arm, { passive: true });
		document.addEventListener("visibilitychange", onVisibility);
		arm();
		return () => {
			clearTimeout(timer);
			for (const event of events) window.removeEventListener(event, arm);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [active]);
}

function Screen({ title, children }: { title: string; children: ReactNode }) {
	return (
		<main className="flex min-h-full items-center justify-center px-4 py-12">
			<div className="w-full max-w-sm">
				<img src="/favicon.svg" alt="" className="mx-auto size-12" />
				<h1 className="mt-5 text-center text-2xl font-bold">{title}</h1>
				{children}
			</div>
		</main>
	);
}

function SignOutLink() {
	const { signOut } = useAuth();
	return (
		<p className="mt-6 text-center text-sm">
			<button
				type="button"
				onClick={() => void signOut()}
				className="font-medium text-accent"
			>
				Sign out
			</button>
		</p>
	);
}

/** The passcode, on a locked device. */
function LockScreen() {
	const { user } = useAuth();
	const [passcode, setPasscode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const id = useId();
	const errorId = useId();

	async function submit(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		const result = await openWithPasscode(user.id, passcode);
		if (result.ok) {
			setKey(await usableKey(result.raw), true);
			return;
		}
		setBusy(false);
		setPasscode("");
		if (result.attemptsLeft <= 0) {
			// Too many tries: this device forgot the key. The password opens it again.
			await forgetKeys(user.id);
			return;
		}
		setError(
			`Wrong passcode. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? "try" : "tries"} left before you'll need your password.`,
		);
	}

	return (
		<Screen title="mythings is locked">
			<p className="mt-2 text-center text-sm text-[var(--fg-muted)]">
				Enter this device's passcode.
			</p>
			<form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
				<div className="flex flex-col gap-1.5">
					<label htmlFor={id} className="text-sm font-medium">
						Passcode
					</label>
					<PasswordInput
						id={id}
						autoComplete="off"
						autoFocus
						value={passcode}
						onChange={(e) => setPasscode(e.target.value)}
						aria-describedby={error ? errorId : undefined}
						className={inputClass}
					/>
				</div>
				{error && (
					<p id={errorId} role="alert" className="text-sm text-overdue">
						{error}
					</p>
				)}
				<button
					type="submit"
					disabled={busy || passcode === ""}
					className={primaryClass}
				>
					{busy ? "…" : "Unlock"}
				</button>
			</form>
			<p className="mt-6 text-center text-sm text-[var(--fg-muted)]">
				Forgot it?{" "}
				<button
					type="button"
					onClick={() => void forgetKeys(user.id)}
					className="font-medium text-accent"
				>
					Use your password instead
				</button>
			</p>
		</Screen>
	);
}

type UnlockMode = "password" | "recovery" | "startOver";

/** The account's password (or recovery key), on a device without the key. */
function UnlockScreen() {
	const { user } = useAuth();
	const [mode, setMode] = useState<UnlockMode>("password");
	const [password, setPassword] = useState("");
	const [recovery, setRecovery] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [newKey, setNewKey] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const passwordId = useId();
	const recoveryId = useId();
	const errorId = useId();

	async function submit(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			if (mode === "password") await unlockWithPassword(user, password);
			else if (mode === "recovery")
				await unlockWithRecovery(user, password, recovery);
			else if (newKey && saved)
				await enableEncryption(user, password, newKey, { newDataKey: true });
		} catch (err) {
			setBusy(false);
			setError(
				err instanceof WrongPassword
					? mode === "password"
						? "That password doesn't unlock your data. If you reset your password, use your recovery key."
						: "That's not your current password."
					: err instanceof WrongRecoveryKey
						? "That recovery key doesn't match. Check it and try again."
						: err instanceof ApiError && err.code === "wrong_password"
							? "That's not your current password."
							: err instanceof ApiError && err.code === "too_many_attempts"
								? "Too many attempts. Wait a minute and try again."
								: "Couldn't unlock. Check your connection and try again.",
			);
		}
	}

	const switchTo = (next: UnlockMode) => {
		setMode(next);
		setError(null);
		if (next === "startOver") setNewKey(newRecoveryKey());
	};

	return (
		<Screen
			title={
				mode === "startOver" ? "Start over with encryption" : "Unlock your data"
			}
		>
			<p className="mt-2 text-center text-sm text-[var(--fg-muted)]">
				{mode === "password"
					? "Your tasks are end-to-end encrypted. Enter your password to read them on this device."
					: mode === "recovery"
						? "Enter the recovery key you saved when you turned on encryption, and your current password."
						: "Without your old password or recovery key, your encrypted tasks can't be read by anyone, including us. You can keep using mythings with a new key; anything that can't be read will show a lock."}
			</p>
			<form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
				<input
					type="email"
					autoComplete="username"
					value={user.email}
					readOnly
					hidden
				/>
				{mode === "recovery" && (
					<div className="flex flex-col gap-1.5">
						<label htmlFor={recoveryId} className="text-sm font-medium">
							Recovery key
						</label>
						<input
							id={recoveryId}
							autoComplete="off"
							spellCheck={false}
							value={recovery}
							onChange={(e) => setRecovery(e.target.value)}
							placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
							className={`${inputClass} font-mono`}
						/>
					</div>
				)}
				{mode === "startOver" && newKey && (
					<RecoveryKeyCard
						recoveryKey={newKey}
						saved={saved}
						onSavedChange={setSaved}
					/>
				)}
				<div className="flex flex-col gap-1.5">
					<label htmlFor={passwordId} className="text-sm font-medium">
						{mode === "password" ? "Password" : "Current password"}
					</label>
					<PasswordInput
						id={passwordId}
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						aria-describedby={error ? errorId : undefined}
						className={inputClass}
					/>
				</div>
				{error && (
					<p id={errorId} role="alert" className="text-sm text-overdue">
						{error}
					</p>
				)}
				<button
					type="submit"
					disabled={
						busy ||
						password === "" ||
						(mode === "recovery" && !isRecoveryKey(recovery)) ||
						(mode === "startOver" && !saved)
					}
					className={primaryClass}
				>
					{busy ? "…" : mode === "startOver" ? "Start over" : "Unlock"}
				</button>
			</form>
			<div className="mt-6 flex flex-col items-center gap-2 text-sm">
				{mode !== "password" && (
					<button
						type="button"
						onClick={() => switchTo("password")}
						className="font-medium text-accent"
					>
						Use my password
					</button>
				)}
				{mode !== "recovery" && (
					<button
						type="button"
						onClick={() => switchTo("recovery")}
						className="font-medium text-accent"
					>
						Use my recovery key
					</button>
				)}
				{mode === "recovery" && (
					<button
						type="button"
						onClick={() => switchTo("startOver")}
						className="text-[var(--fg-muted)] underline"
					>
						I don't have it
					</button>
				)}
			</div>
			<SignOutLink />
		</Screen>
	);
}
