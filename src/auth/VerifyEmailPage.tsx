import { type FormEvent, useEffect, useId, useState } from "react";
import type { Me } from "../../shared/schema";
import { api } from "../api";
import { PasswordInput } from "../components/PasswordInput";
import {
	errorClass,
	largeButtonClass,
	largeInputClass,
	standaloneLinkClass,
} from "../components/ui";
import { markUpgraded, newPasswordKeys } from "../crypto/account";
import { AgreementLine, messageFor } from "./LoginPage";

const inputClass = largeInputClass;

/**
 * /verify-email?token=…, from the sign-up email (SPEC §8). Opening it
 * confirms the email; choosing a password here creates the account and signs in.
 */
export function VerifyEmailPage({
	onSignedIn,
}: {
	onSignedIn: (user: Me) => void;
}) {
	const token = new URLSearchParams(window.location.search).get("token") ?? "";
	const [email, setEmail] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(
		token ? null : "This link is incomplete. Open it again from the email.",
	);
	const [busy, setBusy] = useState(false);
	const nameId = useId();
	const passwordId = useId();
	const errorId = useId();
	const hintId = useId();

	useEffect(() => {
		if (!token) return;
		api<{ email: string; name: string }>("/auth/signup/link", {
			method: "POST",
			body: { token },
		})
			.then((link) => {
				setEmail(link.email);
				setName(link.name);
			})
			.catch((err) => setError(messageFor(err)));
	}, [token]);

	async function submit(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			if (!email) return;
			const keys = await newPasswordKeys(email, password);
			const user = await api<Me>("/auth/signup/verify", {
				method: "POST",
				body: { token, name, password: keys.authKey },
			});
			await markUpgraded(email);
			// Into the app, without the token in the address bar or history.
			window.history.replaceState(null, "", "/today");
			onSignedIn(user);
		} catch (err) {
			setError(messageFor(err));
			setBusy(false);
		}
	}

	return (
		<main className="flex min-h-full items-center justify-center px-4 py-12">
			<div className="w-full max-w-sm">
				<img src="/favicon.svg" alt="" className="mx-auto size-12" />
				<h1 className="mt-5 text-center text-2xl font-bold">
					Finish creating your account
				</h1>
				{email && (
					<p className="mt-2 text-center text-sm text-[var(--fg-muted)]">
						Your email <strong className="text-[var(--fg)]">{email}</strong> is
						confirmed. Choose a password to sign in with.
					</p>
				)}
				{email ? (
					<form
						onSubmit={submit}
						className="mt-8 flex flex-col gap-4"
						noValidate
					>
						{/* For password managers, so they save the password under this email. */}
						<input
							type="email"
							autoComplete="username"
							value={email}
							readOnly
							hidden
						/>
						<div className="flex flex-col gap-1.5">
							<label htmlFor={nameId} className="text-sm font-medium">
								Name
							</label>
							<input
								id={nameId}
								autoComplete="name"
								required
								maxLength={100}
								value={name}
								onChange={(e) => setName(e.target.value)}
								aria-describedby={error ? errorId : undefined}
								className={inputClass}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<label htmlFor={passwordId} className="text-sm font-medium">
								Password
							</label>
							<PasswordInput
								id={passwordId}
								autoFocus
								autoComplete="new-password"
								required
								minLength={8}
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								aria-describedby={error ? `${hintId} ${errorId}` : hintId}
								className={inputClass}
							/>
							<p id={hintId} className="text-xs text-[var(--fg-muted)]">
								At least 8 characters.
							</p>
						</div>
						{error && (
							<p id={errorId} role="alert" className={errorClass}>
								{error}
							</p>
						)}
						<button
							type="submit"
							disabled={busy}
							aria-busy={busy}
							className={`mt-2 ${largeButtonClass}`}
						>
							{busy ? "Creating account…" : "Create account"}
						</button>
						<AgreementLine />
					</form>
				) : (
					error && (
						<div className="mt-8 text-center">
							<p role="alert" className={errorClass}>
								{error}
							</p>
							<a
								href="/signup"
								className={`mt-6 inline-block ${standaloneLinkClass}`}
							>
								Sign up again
							</a>
						</div>
					)
				)}
				<p className="mt-6 text-center text-sm">
					<a href="/login" className={standaloneLinkClass}>
						Already have an account? Sign in
					</a>
				</p>
			</div>
		</main>
	);
}
