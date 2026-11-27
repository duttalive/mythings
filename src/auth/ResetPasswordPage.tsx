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
import { messageFor } from "./LoginPage";

/** /reset-password?token=…, from the email (SPEC §8). Sets the password and signs in. */
export function ResetPasswordPage({
	onSignedIn,
}: {
	onSignedIn: (user: Me) => void;
}) {
	const token = new URLSearchParams(window.location.search).get("token") ?? "";
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(
		token ? null : "This link is incomplete. Open it again from the email.",
	);
	const [busy, setBusy] = useState(false);
	/** Whose account: the key sent instead of the password is derived from the email. */
	const [email, setEmail] = useState<string | null>(null);
	const passwordId = useId();
	const errorId = useId();
	const hintId = useId();

	useEffect(() => {
		if (!token) return;
		api<{ email: string }>("/auth/reset/link", {
			method: "POST",
			body: { token },
		})
			.then((link) => setEmail(link.email))
			.catch((err) => setError(messageFor(err)));
	}, [token]);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (!email) return;
		setBusy(true);
		setError(null);
		try {
			const keys = await newPasswordKeys(email, password);
			const user = await api<Me>("/auth/reset", {
				method: "POST",
				body: { token, password: keys.authKey },
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
					Choose a new password
				</h1>
				<p className="mt-2 text-center text-sm text-[var(--fg-muted)]">
					You'll be signed out on your other devices.
				</p>
				<form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
					{/* For password managers, so they save the new password under this email. */}
					<input
						type="email"
						autoComplete="username"
						value={email ?? ""}
						readOnly
						hidden
					/>
					<div className="flex flex-col gap-1.5">
						<label htmlFor={passwordId} className="text-sm font-medium">
							New password
						</label>
						<PasswordInput
							id={passwordId}
							autoComplete="new-password"
							required
							minLength={8}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							aria-describedby={error ? `${hintId} ${errorId}` : hintId}
							className={largeInputClass}
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
						disabled={busy || !email}
						aria-busy={busy}
						className={`mt-2 ${largeButtonClass}`}
					>
						{busy ? "Saving…" : "Save and sign in"}
					</button>
				</form>
				<p className="mt-6 text-center text-sm">
					<a href="/today" className={standaloneLinkClass}>
						Back to sign in
					</a>
				</p>
			</div>
		</main>
	);
}
