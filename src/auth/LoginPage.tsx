import { type FormEvent, useEffect, useId, useState } from "react";
import type { Me } from "../../shared/schema";
import { ApiError, api } from "../api";
import { PasswordInput } from "../components/PasswordInput";

type Mode = "login" | "signup" | "forgot" | "verify";

const MESSAGES: Record<string, string> = {
	invalid_credentials: "Incorrect email or password.",
	invalid_token:
		"This reset link has expired or was already used. Ask for a new one.",
	email_taken: "An account with this email already exists.",
	too_many_attempts: "Too many attempts. Wait a minute and try again.",
	signups_closed: "Sign-ups are closed on this server.",
	invalid_code: "That code isn't right. Check the email and try again.",
	code_expired: "This code has expired. Send a new one.",
	email_failed: "We couldn't send the email just now. Please try again.",
};

const FIELD_MESSAGES: Record<string, string> = {
	email: "Enter a valid email address.",
	password: "Password must be at least 8 characters.",
	code: "Enter the 6-digit code from the email.",
};

function messageFor(err: unknown): string {
	if (err instanceof ApiError) {
		const field = err.body.issues?.[0]?.path[0];
		const message =
			(typeof field === "string" && FIELD_MESSAGES[field]) ||
			MESSAGES[err.code];
		if (message) return message;
	}
	return "Something went wrong. Please try again.";
}

export { messageFor };

const inputClass =
	"w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Sign-up step 1: emails a confirmation code (also used to resend it). */
const startSignup = (email: string, password: string) =>
	api("/auth/signup", {
		method: "POST",
		body: { email, password, tz: timeZone() },
	});

/** Sign-up step 2: the code from the email creates the account. */
function VerifyEmail({
	email,
	password,
	onResend,
	onBack,
	onSignedIn,
}: {
	email: string;
	password: string;
	onResend: () => Promise<unknown>;
	onBack: () => void;
	onSignedIn: (user: Me) => void;
}) {
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	/** Seconds until "Resend code" works again. */
	const [cooldown, setCooldown] = useState(30);
	const codeId = useId();
	const errorId = useId();

	useEffect(() => {
		if (cooldown <= 0) return;
		const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
		return () => clearTimeout(timer);
	}, [cooldown]);

	async function verify(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			onSignedIn(
				await api<Me>("/auth/signup/verify", {
					method: "POST",
					body: { email, code, password },
				}),
			);
		} catch (err) {
			setError(messageFor(err));
			setBusy(false);
		}
	}

	async function resend() {
		setError(null);
		setNotice(null);
		setCooldown(30);
		try {
			await onResend();
			setCode("");
			setNotice("A new code is on its way.");
		} catch (err) {
			setError(messageFor(err));
		}
	}

	return (
		<main className="flex min-h-full items-center justify-center px-4 py-12">
			<div className="w-full max-w-sm">
				<img src="/favicon.svg" alt="" className="mx-auto size-12" />
				<h1 className="mt-5 text-center text-2xl font-bold">
					Check your email
				</h1>
				<p className="mt-2 text-center text-sm text-[var(--fg-muted)]">
					We sent a 6-digit code to <strong>{email}</strong>. Enter it to finish
					creating your account.
				</p>
				<form onSubmit={verify} className="mt-8 flex flex-col gap-4" noValidate>
					<div className="flex flex-col gap-1.5">
						<label htmlFor={codeId} className="text-sm font-medium">
							Code
						</label>
						<input
							id={codeId}
							// biome-ignore lint/a11y/noAutofocus: the screen exists to type the code
							autoFocus
							inputMode="numeric"
							autoComplete="one-time-code"
							pattern="[0-9]*"
							maxLength={6}
							required
							value={code}
							onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
							aria-describedby={error ? errorId : undefined}
							className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
						/>
					</div>
					{error && (
						<p id={errorId} role="alert" className="text-sm text-overdue">
							{error}
						</p>
					)}
					{notice && (
						<p role="status" className="text-sm text-[var(--fg-muted)]">
							{notice}
						</p>
					)}
					<button
						type="submit"
						disabled={busy || code.length !== 6}
						className="mt-2 rounded-lg bg-accent px-3 py-2 font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
					>
						{busy ? "…" : "Verify and create account"}
					</button>
				</form>
				<p className="mt-6 text-center text-sm text-[var(--fg-muted)]">
					No email? Check spam, or{" "}
					<button
						type="button"
						onClick={resend}
						disabled={cooldown > 0}
						className="font-medium text-accent disabled:text-[var(--fg-muted)]"
					>
						{cooldown > 0 ? `resend in ${cooldown}s` : "resend the code"}
					</button>
					.
				</p>
				<p className="mt-2 text-center text-sm">
					<button
						type="button"
						onClick={onBack}
						className="font-medium text-accent"
					>
						Use a different email
					</button>
				</p>
			</div>
		</main>
	);
}

export function LoginPage({ onSignedIn }: { onSignedIn: (user: Me) => void }) {
	const [mode, setMode] = useState<Mode>("login");
	const [signupsOpen, setSignupsOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	/** The forgot-password email went out (or would have, for an unknown address). */
	const [sentTo, setSentTo] = useState<string | null>(null);
	const emailId = useId();
	const passwordId = useId();
	const errorId = useId();

	useEffect(() => {
		api<{ signupsOpen: boolean }>("/auth/config")
			.then((c) => setSignupsOpen(c.signupsOpen))
			.catch(() => {});
	}, []);

	async function submit(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		if (mode === "forgot") {
			try {
				await api("/auth/forgot", { method: "POST", body: { email } });
				setSentTo(email);
			} catch (err) {
				setError(messageFor(err));
			}
			setBusy(false);
			return;
		}
		if (mode === "signup") {
			try {
				// Step 1: we email a code; the account is created once it's confirmed.
				await startSignup(email, password);
				setMode("verify");
			} catch (err) {
				setError(messageFor(err));
			}
			setBusy(false);
			return;
		}
		try {
			onSignedIn(
				await api<Me>("/auth/login", {
					method: "POST",
					body: { email, password },
				}),
			);
		} catch (err) {
			setError(messageFor(err));
			setBusy(false);
		}
	}

	function switchMode(next: Mode = mode === "login" ? "signup" : "login") {
		setMode(next);
		setError(null);
		setSentTo(null);
	}

	if (mode === "verify")
		return (
			<VerifyEmail
				email={email}
				password={password}
				onResend={() => startSignup(email, password)}
				onBack={() => switchMode("signup")}
				onSignedIn={onSignedIn}
			/>
		);

	return (
		<main className="flex min-h-full items-center justify-center px-4 py-12">
			<div className="w-full max-w-sm">
				<img src="/favicon.svg" alt="" className="mx-auto size-12" />
				<h1 className="mt-5 text-center text-2xl font-bold">
					{mode === "login"
						? "Sign in to mythings"
						: mode === "signup"
							? "Create your account"
							: "Reset your password"}
				</h1>
				{mode === "signup" && (
					<p className="mt-2 text-center text-sm text-[var(--fg-muted)]">
						Free. Your to-dos sync across all your devices and work offline.
					</p>
				)}
				{mode === "forgot" && !sentTo && (
					<p className="mt-2 text-center text-sm text-[var(--fg-muted)]">
						Enter your account's email and we'll send you a link to choose a new
						password.
					</p>
				)}

				{sentTo ? (
					<div role="status" className="mt-8 text-center">
						<p>
							If an account exists for <strong>{sentTo}</strong>, a reset link
							is on its way. It works for one hour.
						</p>
						<p className="mt-2 text-sm text-[var(--fg-muted)]">
							Nothing after a few minutes? Check your spam folder.
						</p>
						<button
							type="button"
							onClick={() => switchMode("login")}
							className="mt-6 font-medium text-accent"
						>
							Back to sign in
						</button>
					</div>
				) : (
					<form
						onSubmit={submit}
						className="mt-8 flex flex-col gap-4"
						noValidate
					>
						<div className="flex flex-col gap-1.5">
							<label htmlFor={emailId} className="text-sm font-medium">
								Email
							</label>
							<input
								id={emailId}
								type="email"
								autoComplete="email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								aria-describedby={error ? errorId : undefined}
								className={inputClass}
							/>
						</div>
						{mode !== "forgot" && (
							<div className="flex flex-col gap-1.5">
								<div className="flex items-baseline justify-between">
									<label htmlFor={passwordId} className="text-sm font-medium">
										Password
									</label>
									{mode === "login" && (
										<button
											type="button"
											onClick={() => switchMode("forgot")}
											className="text-sm text-accent"
										>
											Forgot password?
										</button>
									)}
								</div>
								<PasswordInput
									id={passwordId}
									autoComplete={
										mode === "login" ? "current-password" : "new-password"
									}
									required
									minLength={8}
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									aria-describedby={error ? errorId : undefined}
									className={inputClass}
								/>
							</div>
						)}

						{error && (
							<p id={errorId} role="alert" className="text-sm text-overdue">
								{error}
							</p>
						)}

						<button
							type="submit"
							disabled={busy}
							className="mt-2 rounded-lg bg-accent px-3 py-2 font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
						>
							{busy
								? "…"
								: mode === "login"
									? "Sign in"
									: mode === "signup"
										? "Create account"
										: "Send reset link"}
						</button>
					</form>
				)}

				{mode === "forgot" && !sentTo && (
					<p className="mt-6 text-center text-sm">
						<button
							type="button"
							onClick={() => switchMode("login")}
							className="font-medium text-accent"
						>
							Back to sign in
						</button>
					</p>
				)}
				{mode !== "forgot" && (signupsOpen || mode === "signup") && (
					<p className="mt-6 text-center text-sm text-[var(--fg-muted)]">
						{mode === "login" ? "New here?" : "Already have an account?"}{" "}
						<button
							type="button"
							onClick={() => switchMode()}
							className="font-medium text-accent"
						>
							{mode === "login" ? "Create an account" : "Sign in"}
						</button>
					</p>
				)}
			</div>
		</main>
	);
}
