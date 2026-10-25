import { type FormEvent, useId, useState } from "react";
import type { Me } from "../../shared/schema";
import { api } from "../api";
import { PasswordInput } from "../components/PasswordInput";
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
	const passwordId = useId();
	const errorId = useId();

	async function submit(e: FormEvent) {
		e.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const user = await api<Me>("/auth/reset", {
				method: "POST",
				body: { token, password },
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
					Choose a new password
				</h1>
				<p className="mt-2 text-center text-sm text-[var(--fg-muted)]">
					You'll be signed out on your other devices.
				</p>
				<form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
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
							aria-describedby={error ? errorId : undefined}
							className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
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
						disabled={busy || !token}
						className="mt-2 rounded-lg bg-accent px-3 py-2 font-medium text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
					>
						{busy ? "…" : "Save and sign in"}
					</button>
				</form>
				<p className="mt-6 text-center text-sm">
					<a href="/today" className="font-medium text-accent">
						Back to sign in
					</a>
				</p>
			</div>
		</main>
	);
}
