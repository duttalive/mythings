// Focus Mode (SPEC §10.13): one focus countdown per device, on one to-do.
// The session lives in localStorage (per account), so it survives reloads and
// is shared by this device's browser tabs; it's never synced. When the
// countdown reaches zero the app chimes, and the server pings this device's
// notifications (only the end time is sent, never the to-do).

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useAuth } from "../auth/AuthGate";
import { clearFocusAlert, setFocusAlert } from "../push/notifications";
import { playChime, primeChime } from "./chime";
import {
	clampMinutes,
	endsAt,
	extend,
	type FocusSession,
	finish,
	focusedMs,
	isOver,
	newSession,
	pause,
	readMinutes,
	readSession,
	restart,
	setMinutes,
	start,
} from "./timer";

const MINUTES_KEY = "mythings:focus-minutes";
const sessionKey = (userId: string) => `mythings:focus:${userId}`;

function load<T>(key: string, read: (raw: unknown) => T): T {
	try {
		const text = localStorage.getItem(key);
		return read(text ? JSON.parse(text) : null);
	} catch {
		return read(null);
	}
}

function save(key: string, value: unknown) {
	try {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// Private mode or full storage: the session just won't survive a reload.
	}
}

type FocusContextValue = {
	session: FocusSession | null;
	/** The current time, ticking while the countdown runs. */
	now: number;
	/** Opens Focus Mode on a to-do (replacing any other session), set to the last length used. */
	open: (todoId: string) => void;
	/** Sets the length before starting (and remembers it for next time). */
	setLength: (minutes: number) => void;
	/** Start, pause or resume. */
	toggleRunning: () => void;
	/** +5 min (and runs again if it had finished). */
	addTime: () => void;
	/** The same length again, from the top. */
	startAgain: () => void;
	/** Ends the session; returns how long you focused. */
	end: () => number;
	setMinimized: (minimized: boolean) => void;
};

const FocusContext = createContext<FocusContextValue | null>(null);

export function useFocus(): FocusContextValue {
	const value = useContext(FocusContext);
	if (!value) throw new Error("useFocus outside FocusProvider");
	return value;
}

export function FocusProvider({ children }: { children: ReactNode }) {
	const { user } = useAuth();
	const key = sessionKey(user.id);
	const [session, setSessionState] = useState<FocusSession | null>(() =>
		load(key, readSession),
	);
	const [now, setNow] = useState(() => Date.now());

	const sessionRef = useRef(session);
	sessionRef.current = session;

	const setSession = useCallback(
		(next: FocusSession | null) => {
			sessionRef.current = next;
			setSessionState(next);
			save(key, next);
		},
		[key],
	);

	// Other browser tabs on this device share the session.
	useEffect(() => {
		const onStorage = (e: StorageEvent) => {
			if (e.key !== key) return;
			const next = load(key, readSession);
			sessionRef.current = next;
			setSessionState(next);
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, [key]);

	// Tick while running; stop at zero.
	const running = session?.runningSince != null;
	useEffect(() => {
		if (!running) return;
		const tick = () => {
			const t = Date.now();
			setNow(t);
			const s = sessionRef.current;
			if (!s || !isOver(s, t)) return;
			setSession(finish(s));
			// A hidden tab is told by the notification instead (and other tabs would chime too).
			if (document.visibilityState === "visible") playChime();
		};
		tick();
		const id = setInterval(tick, 250);
		return () => clearInterval(id);
	}, [running, setSession]);

	// Ask the server to ping this device when the countdown reaches zero.
	const alertAt = session ? endsAt(session) : null;
	const alertSet = useRef(false);
	useEffect(() => {
		if (alertAt !== null) {
			alertSet.current = true;
			void setFocusAlert(alertAt, "focus").catch(() => {});
		} else if (alertSet.current) {
			alertSet.current = false;
			void clearFocusAlert().catch(() => {});
		}
	}, [alertAt]);

	const value = useMemo<FocusContextValue>(() => {
		const update = (fn: (s: FocusSession, t: number) => FocusSession) => {
			const s = sessionRef.current;
			if (!s) return;
			const t = Date.now();
			setNow(t);
			setSession(fn(s, t));
		};
		return {
			session,
			now,
			open: (todoId) => {
				primeChime();
				setNow(Date.now());
				setSession(newSession(todoId, load(MINUTES_KEY, readMinutes)));
			},
			setLength: (minutes) => {
				save(MINUTES_KEY, clampMinutes(minutes));
				update((s) => setMinutes(s, minutes));
			},
			toggleRunning: () => {
				primeChime();
				update((s, t) => (s.runningSince === null ? start(s, t) : pause(s, t)));
			},
			addTime: () => update((s, t) => extend(s, t)),
			startAgain: () => {
				primeChime();
				update((s, t) => restart(s, t));
			},
			end: () => {
				const s = sessionRef.current;
				const total = s ? focusedMs(s, Date.now()) : 0;
				setSession(null);
				return total;
			},
			setMinimized: (minimized) => update((s) => ({ ...s, minimized })),
		};
	}, [session, now, setSession]);

	return <FocusContext value={value}>{children}</FocusContext>;
}
