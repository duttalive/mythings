// Focus Mode (SPEC §10.13): one focus session per device, on one to-do.
// The session lives in localStorage (per account), so it survives reloads and
// is shared by this device's tabs; it's never synced. When a Pomodoro phase
// ends the app chimes, and the server pings this device's notifications
// (only the end time is sent, never the to-do).

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
	type FocusMode,
	type FocusSession,
	type FocusSettings,
	focusedMs,
	isPhaseOver,
	nextPhase,
	pause,
	phaseMs,
	readSession,
	readSettings,
	resume,
	startSession,
} from "./timer";

const SETTINGS_KEY = "mythings:focus-settings";
const MODE_KEY = "mythings:focus-mode";
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

/** What just ended, shown on the focus screen until the next phase starts. */
export type FocusNotice = "focus" | "break" | null;

type FocusContextValue = {
	session: FocusSession | null;
	settings: FocusSettings;
	/** The current time, ticking while a session runs. */
	now: number;
	notice: FocusNotice;
	/** Starts focusing on a to-do (replacing any other session) in the last mode used. */
	start: (todoId: string, mode?: FocusMode) => void;
	/** Switches mode, starting the timer again. */
	setMode: (mode: FocusMode) => void;
	toggleRunning: () => void;
	/** Ends the current Pomodoro phase now. */
	skip: () => void;
	/** Ends the session; returns how long you focused. */
	end: () => number;
	setMinimized: (minimized: boolean) => void;
	updateSettings: (settings: FocusSettings) => void;
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
	const [settings, setSettings] = useState<FocusSettings>(() =>
		load(SETTINGS_KEY, readSettings),
	);
	const [now, setNow] = useState(() => Date.now());
	const [notice, setNotice] = useState<FocusNotice>(null);

	const sessionRef = useRef(session);
	sessionRef.current = session;
	const settingsRef = useRef(settings);
	settingsRef.current = settings;

	const setSession = useCallback(
		(next: FocusSession | null) => {
			sessionRef.current = next;
			setSessionState(next);
			save(key, next);
		},
		[key],
	);

	// Other tabs on this device share the session.
	useEffect(() => {
		const onStorage = (e: StorageEvent) => {
			if (e.key === key) {
				const next = load(key, readSession);
				sessionRef.current = next;
				setSessionState(next);
			} else if (e.key === SETTINGS_KEY) {
				setSettings(load(SETTINGS_KEY, readSettings));
			}
		};
		window.addEventListener("storage", onStorage);
		return () => window.removeEventListener("storage", onStorage);
	}, [key]);

	// Tick while running; move on when a Pomodoro phase runs out.
	const running = session?.runningSince != null;
	useEffect(() => {
		if (!running) return;
		const tick = () => {
			const t = Date.now();
			setNow(t);
			const s = sessionRef.current;
			if (!s || !isPhaseOver(s, settingsRef.current, t)) return;
			setNotice(s.phase === "focus" ? "focus" : "break");
			setSession(nextPhase(s, settingsRef.current, t));
			// A hidden tab is told by the notification instead (and other tabs would chime too).
			if (document.visibilityState === "visible") playChime();
		};
		tick();
		const id = setInterval(tick, 250);
		return () => clearInterval(id);
	}, [running, setSession]);

	// Ask the server to ping this device when the running phase ends.
	const alert =
		session && session.mode === "pomodoro" && session.runningSince !== null
			? {
					at:
						session.runningSince +
						(phaseMs(session, settings) ?? 0) -
						session.elapsed,
					kind:
						session.phase === "focus" ? ("focus" as const) : ("break" as const),
				}
			: null;
	const alertKey = alert ? `${alert.at}|${alert.kind}` : "";
	const alertSet = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: alertKey stands for alert
	useEffect(() => {
		if (alert) {
			alertSet.current = true;
			void setFocusAlert(alert.at, alert.kind).catch(() => {});
		} else if (alertSet.current) {
			alertSet.current = false;
			void clearFocusAlert().catch(() => {});
		}
	}, [alertKey]);

	const value = useMemo<FocusContextValue>(() => {
		const update = (fn: (s: FocusSession) => FocusSession) => {
			const s = sessionRef.current;
			if (s) setSession(fn(s));
		};
		return {
			session,
			settings,
			now,
			notice,
			start: (todoId, mode) => {
				primeChime();
				const chosen =
					mode ??
					load(MODE_KEY, (raw) => (raw === "pomodoro" ? "pomodoro" : "normal"));
				save(MODE_KEY, chosen);
				setNotice(null);
				setNow(Date.now());
				setSession(startSession(todoId, chosen, Date.now()));
			},
			setMode: (mode) => {
				save(MODE_KEY, mode);
				setNotice(null);
				update((s) => ({
					...startSession(s.todoId, mode, Date.now()),
					focused: focusedMs(s, Date.now()),
				}));
			},
			toggleRunning: () => {
				primeChime();
				setNotice(null);
				const t = Date.now();
				setNow(t);
				update((s) => (s.runningSince === null ? resume(s, t) : pause(s, t)));
			},
			skip: () => {
				setNotice(null);
				update((s) => nextPhase(s, settingsRef.current, Date.now()));
			},
			end: () => {
				const s = sessionRef.current;
				const total = s ? focusedMs(s, Date.now()) : 0;
				setNotice(null);
				setSession(null);
				return total;
			},
			setMinimized: (minimized) => update((s) => ({ ...s, minimized })),
			updateSettings: (next) => {
				setSettings(next);
				save(SETTINGS_KEY, next);
			},
		};
	}, [session, settings, now, notice, setSession]);

	return <FocusContext value={value}>{children}</FocusContext>;
}
