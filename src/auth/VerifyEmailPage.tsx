import { type FormEvent, useEffect, useId, useState } from "react";
import type { Me } from "../../shared/schema";
import { api } from "../api";
import { PasswordInput } from "../components/PasswordInput";
import { AgreementLine, messageFor } from "./LoginPage";

const inputClass =
	"w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

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
			const user = await api<Me>("/auth/signup/verify", {
				method: "POST",
				body: { token, name, password },
			});
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
								aria-describedby={error ? errorId : undefined}
								className={inputClass}
							/>
							<p className="text-xs text-[var(--fg-muted)]">
								At least 8 characters.
							</p>
						</div>
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
							{busy ? "…" : "Create account"}
						</button>
						<AgreementLine />
					</form>
				) : (
					error && (
						<div className="mt-8 text-center">
							<p role="alert" className="text-overdue">
								{error}
							</p>
							<a
								href="/signup"
								className="mt-6 inline-block font-medium text-accent"
							>
								Sign up again
							</a>
						</div>
					)
				)}
				<p className="mt-6 text-center text-sm">
					<a href="/login" className="font-medium text-accent">
						Already have an account? Sign in
					</a>
				</p>
			</div>
		</main>
	);
}
