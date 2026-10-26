import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import type { Me } from "../../shared/schema";
import { ApiError, api } from "../api";
import { HomePage } from "../home/HomePage";
import { applyTheme } from "../lib/theme";
import { forgetPushSubscription } from "../push/notifications";
import { clearCachedUser, loadCachedUser, saveCachedUser } from "./cachedUser";
import { LoginPage } from "./LoginPage";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { VerifyEmailPage } from "./VerifyEmailPage";

type AuthContextValue = {
	user: Me;
	signOut: () => Promise<void>;
	/** The server no longer accepts our session (e.g. it expired); show the login page. */
	sessionExpired: () => void;
	/** Saves a new profile from the server (after PATCH /me). */
	updateUser: (user: Me) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
	const value = useContext(AuthContext);
	if (!value) throw new Error("useAuth must be used inside <AuthGate>");
	return value;
}

const AUTH_PATHS = new Set(["/", "/login", "/signup"]);

type State =
	| { status: "loading" }
	| { status: "signedOut" }
	/** Can't reach the server and this device has never been signed in. */
	| { status: "offline" }
	| { status: "signedIn"; user: Me };

/**
 * Renders the login page until there is a session, then the app with the
 * user in context. Offline, it starts with the last signed-in profile; sync
 * signs the user out later if the session turns out to be gone.
 */
export function AuthGate({ children }: { children: ReactNode }) {
	const [state, setState] = useState<State>({ status: "loading" });
	// Signed out, the path picks the page: / is the home page, /signup and
	// /login the forms, anything else sign-in.
	const [path, setPath] = useState(window.location.pathname);
	useEffect(() => {
		const sync = () => setPath(window.location.pathname);
		window.addEventListener("popstate", sync);
		return () => window.removeEventListener("popstate", sync);
	}, []);
	const go = useCallback((to: string) => {
		window.history.pushState(null, "", to);
		setPath(to);
	}, []);

	const signIn = useCallback((user: Me) => {
		// The app has no /login or /signup page: land on Today.
		if (AUTH_PATHS.has(window.location.pathname))
			window.history.replaceState(null, "", "/today");
		saveCachedUser(user);
		setState({ status: "signedIn", user });
	}, []);

	const signedOut = useCallback(() => {
		clearCachedUser();
		setPath(window.location.pathname);
		setState({ status: "signedOut" });
	}, []);

	const check = useCallback(() => {
		api<Me>("/me")
			.then(signIn)
			.catch((err) => {
				if (err instanceof ApiError && err.status === 401) return signedOut();
				// Network or server trouble: carry on with what this device knows.
				const cached = loadCachedUser();
				setState(
					cached ? { status: "signedIn", user: cached } : { status: "offline" },
				);
			});
	}, [signIn, signedOut]);

	useEffect(() => check(), [check]);

	// Waiting on the network: try again as soon as it's back.
	useEffect(() => {
		if (state.status !== "offline") return;
		window.addEventListener("online", check);
		return () => window.removeEventListener("online", check);
	}, [state.status, check]);

	const signOut = useCallback(async () => {
		await forgetPushSubscription().catch((err) =>
			console.warn("Couldn't remove this browser's reminders", err),
		);
		const res = await api<{ ok: true; redirect?: string }>("/auth/logout", {
			method: "POST",
		});
		clearCachedUser();
		if (res.redirect) {
			window.location.href = res.redirect;
			return;
		}
		setPath(window.location.pathname);
		setState({ status: "signedOut" });
	}, []);

	const theme =
		state.status === "signedIn"
			? (state.user.settings.theme ?? "system")
			: undefined;
	useEffect(() => {
		if (theme) applyTheme(theme);
	}, [theme]);

	// A reset link works whether or not someone is signed in on this device.
	if (
		window.location.pathname === "/reset-password" &&
		state.status !== "loading"
	)
		return <ResetPasswordPage onSignedIn={signIn} />;
	// So does a sign-up link (it may be opened on a device someone else uses).
	if (
		window.location.pathname === "/verify-email" &&
		state.status !== "loading"
	)
		return <VerifyEmailPage onSignedIn={signIn} />;
	// First visit to the home page: show it straight away instead of a blank
	// screen while we ask the server (a device that was signed in has a cached user).
	if (state.status === "loading")
		return path === "/" && !loadCachedUser() ? <HomePage go={go} /> : null;
	if (state.status === "offline") return <OfflineStart onRetry={check} />;
	if (state.status === "signedOut") {
		if (path === "/") return <HomePage go={go} />;
		return (
			<LoginPage
				key={path}
				initialMode={path === "/signup" ? "signup" : "login"}
				onSignedIn={signIn}
				onHome={() => go("/")}
			/>
		);
	}
	return (
		<AuthContext
			value={{
				user: state.user,
				signOut,
				sessionExpired: signedOut,
				updateUser: signIn,
			}}
		>
			{children}
		</AuthContext>
	);
}

function OfflineStart({ onRetry }: { onRetry: () => void }) {
	return (
		<main className="flex min-h-full items-center justify-center px-4 py-12">
			<div className="max-w-sm text-center">
				<img src="/favicon.svg" alt="" className="mx-auto size-12" />
				<h1 className="mt-5 text-xl font-bold">You're offline</h1>
				<p className="mt-2 text-sm text-[var(--fg-muted)]">
					mythings needs a connection the first time you use it on this device.
					After that it works offline.
				</p>
				<button
					type="button"
					onClick={onRetry}
					className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90"
				>
					Try again
				</button>
			</div>
		</main>
	);
}
