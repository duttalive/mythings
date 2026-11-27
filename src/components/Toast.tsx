// A short message at the bottom of the screen, optionally with an action
// (e.g. "Moved to Trash · Undo"). One at a time; a new one replaces the last.

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

type Toast = {
	id: number;
	message: string;
	action?: { label: string; run: () => void };
};

type ToastContextValue = {
	show: (message: string, action?: Toast["action"]) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
	const value = useContext(ToastContext);
	if (!value) throw new Error("Must be used inside <ToastProvider>");
	return value;
}

const VISIBLE_MS = 5000;
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toast, setToast] = useState<Toast | null>(null);

	useEffect(() => {
		if (!toast) return;
		const timer = setTimeout(() => setToast(null), VISIBLE_MS);
		return () => clearTimeout(timer);
	}, [toast]);

	const show = useCallback<ToastContextValue["show"]>(
		(message, action) => setToast({ id: nextId++, message, action }),
		[],
	);
	const value = useMemo(() => ({ show }), [show]);

	return (
		<ToastContext value={value}>
			{children}
			<div
				role="status"
				aria-live="polite"
				// Above the + button on phones, and above the selection bar when that shows too.
				className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-[calc(2rem+env(safe-area-inset-bottom))] [body:has([data-bulk-bar])_&]:bottom-[calc(9.5rem+env(safe-area-inset-bottom))] md:[body:has([data-bulk-bar])_&]:bottom-[calc(5rem+env(safe-area-inset-bottom))]"
			>
				{toast && (
					<div
						key={toast.id}
						className="pointer-events-auto flex animate-slide-up items-center gap-4 rounded-xl bg-[var(--fg)] px-4 py-2.5 text-sm text-[var(--bg)] shadow-[var(--card-shadow)]"
					>
						<span>{toast.message}</span>
						{toast.action && (
							<button
								type="button"
								onClick={() => {
									toast.action?.run();
									setToast(null);
								}}
								className="-my-1.5 rounded-md px-1.5 py-1.5 font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--bg)] pointer-coarse:-my-3 pointer-coarse:py-3"
							>
								{toast.action.label}
							</button>
						)}
					</div>
				)}
			</div>
		</ToastContext>
	);
}
