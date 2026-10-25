import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { useAuth } from "../auth/AuthGate";
import { type LocalDb, openLocalDb } from "../db/local";
import { syncPushSubscription } from "../push/notifications";
import { requestBackgroundSync } from "../pwa/backgroundSync";
import { WebSocketChannel } from "./channel";
import { SyncEngine } from "./engine";
import { HttpTransport } from "./transport";

type SyncContextValue = { db: LocalDb; engine: SyncEngine };

const SyncContext = createContext<SyncContextValue | null>(null);

export function useSyncContext(): SyncContextValue {
	const value = useContext(SyncContext);
	if (!value) throw new Error("Must be used inside <SyncProvider>");
	return value;
}

/** Opens the signed-in user's local database and keeps it in sync. Key it by user id. */
export function SyncProvider({ children }: { children: ReactNode }) {
	const { user, sessionExpired } = useAuth();
	const [value] = useState<SyncContextValue>(() => {
		const db = openLocalDb(user.id);
		const engine = new SyncEngine(db, new HttpTransport(), {
			onUnauthorized: sessionExpired,
			channel: new WebSocketChannel(),
			tz: user.tz,
			onRejected: (errors) =>
				console.warn("Changes rejected by the server", errors),
		});
		return { db, engine };
	});

	useEffect(() => {
		value.engine.start();
		return () => value.engine.stop();
	}, [value]);

	useEffect(() => value.engine.setTimeZone(user.tz), [value, user.tz]);

	// Changes stuck offline: let the service worker send them if the app is closed first.
	useEffect(() => {
		let requested = false;
		return value.engine.subscribe(() => {
			const { state, pending } = value.engine.getStatus();
			if (state === "offline" && pending > 0) {
				if (!requested) void requestBackgroundSync();
				requested = true;
			} else if (state === "idle") requested = false;
		});
	}, [value]);

	// Reminders: keep this browser's push subscription registered (never prompts).
	useEffect(() => {
		void syncPushSubscription();
	}, []);

	return <SyncContext value={value}>{children}</SyncContext>;
}
