import { RouterProvider } from "@tanstack/react-router";
import { AuthGate, useAuth } from "./auth/AuthGate";
import { router } from "./router";
import { ChangelogPage } from "./routes/changelog";
import { PrivacyPage, TermsPage } from "./routes/legal";
import { SyncProvider } from "./sync/SyncProvider";

export function App() {
	// Public: readable without an account.
	if (window.location.pathname === "/changelog") return <ChangelogPage />;
	if (window.location.pathname === "/privacy") return <PrivacyPage />;
	if (window.location.pathname === "/terms") return <TermsPage />;
	return (
		<AuthGate>
			<SignedIn />
		</AuthGate>
	);
}

function SignedIn() {
	const { user } = useAuth();
	return (
		<SyncProvider key={user.id}>
			<RouterProvider router={router} />
		</SyncProvider>
	);
}
