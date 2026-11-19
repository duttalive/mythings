import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import type { Me } from "../../shared/schema";
import { api } from "../api";
import { useAuth } from "../auth/AuthGate";
import { reconcileEncryption } from "../crypto/reconcile";
import {
	encryptForSync,
	getCryptoState,
	subscribeCrypto,
} from "../crypto/session";
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
	const { user, sessionExpired, updateUser } = useAuth();
	const [value] = useState<SyncContextValue>(() => {
		const db = openLocalDb(user.id);
		const engine = new SyncEngine(db, new HttpTransport(), {
			onUnauthorized: sessionExpired,
			channel: new WebSocketChannel(),
			tz: user.tz,
			onRejected: (errors) =>
				console.warn("Changes rejected by the server", errors),
			encrypt: encryptForSync,
			// Another device turned encryption on: pick it up (this device then asks to unlock).
			onEncryptionRequired: () =>
				void api<Me>("/me")
					.then(updateUser)
					.catch(() => {}),
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

	// Encryption turned on or off, or the key opened: send what's waiting, and once
	// this device has caught up, encrypt (or decrypt) what's left (SPEC §8.5).
	useEffect(() => {
		let dirty = true;
		let last = getCryptoState();
		const maybeReconcile = () => {
			const { state, pending, hasSnapshot, live } = value.engine.getStatus();
			if (!dirty || !hasSnapshot || pending > 0) return;
			if (state !== "idle" || !(live || navigator.onLine)) return;
			dirty = false;
			void reconcileEncryption(value.db, value.engine).catch((err) => {
				dirty = true;
				console.warn("Couldn't update encryption", err);
			});
		};
		const offCrypto = subscribeCrypto(() => {
			const next = getCryptoState();
			if (next.key !== last.key || next.encrypted !== last.encrypted) {
				dirty = true;
				value.engine.requestSync();
			}
			last = next;
		});
		const offEngine = value.engine.subscribe(maybeReconcile);
		maybeReconcile();
		return () => {
			offCrypto();
			offEngine();
		};
	}, [value]);

	// Reminders: keep this browser's push subscription registered (never prompts).
	useEffect(() => {
		void syncPushSubscription();
	}, []);

	return <SyncContext value={value}>{children}</SyncContext>;
}
