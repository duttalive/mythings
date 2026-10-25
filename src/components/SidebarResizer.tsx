// Desktop sidebar width: drag the sidebar's edge (or focus it and use the
// arrow keys); double-click resets. Remembered per device.

import {
	type KeyboardEvent,
	type PointerEvent,
	useCallback,
	useState,
} from "react";

const KEY = "mythings:sidebarWidth";
export const SIDEBAR_DEFAULT = 240;
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 420;

export const clampWidth = (width: number) =>
	Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)));

function load(): number {
	try {
		const stored = Number(localStorage.getItem(KEY));
		return stored ? clampWidth(stored) : SIDEBAR_DEFAULT;
	} catch {
		return SIDEBAR_DEFAULT;
	}
}

function save(width: number) {
	try {
		if (width === SIDEBAR_DEFAULT) localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, String(width));
	} catch {}
}

export function useSidebarWidth() {
	const [width, setWidthState] = useState(load);
	/** Takes a width, or a function of the current one (safe for rapid key repeats). */
	const setWidth = useCallback(
		(next: number | ((current: number) => number), persist = true) => {
			setWidthState((current) => {
				const clamped = clampWidth(
					typeof next === "function" ? next(current) : next,
				);
				if (persist) save(clamped);
				return clamped;
			});
		},
		[],
	);
	return { width, setWidth };
}

export function SidebarResizer({
	width,
	setWidth,
}: ReturnType<typeof useSidebarWidth>) {
	const [dragging, setDragging] = useState(false);

	const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
		if (e.button !== 0) return;
		e.preventDefault();
		const startX = e.clientX;
		const startWidth = width;
		e.currentTarget.setPointerCapture(e.pointerId);
		setDragging(true);
		const move = (ev: globalThis.PointerEvent) =>
			setWidth(startWidth + ev.clientX - startX, false);
		const up = (ev: globalThis.PointerEvent) => {
			setWidth(startWidth + ev.clientX - startX);
			setDragging(false);
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	};

	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		const step = e.shiftKey ? 48 : 16;
		if (e.key === "ArrowLeft") setWidth((w) => w - step);
		else if (e.key === "ArrowRight") setWidth((w) => w + step);
		else if (e.key === "Home") setWidth(SIDEBAR_MIN);
		else if (e.key === "End") setWidth(SIDEBAR_MAX);
		else return;
		e.preventDefault();
		e.stopPropagation();
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: a focusable, adjustable separator has no native element
		<div
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize sidebar"
			aria-valuenow={width}
			aria-valuemin={SIDEBAR_MIN}
			aria-valuemax={SIDEBAR_MAX}
			tabIndex={0}
			title="Drag to resize · double-click to reset"
			onPointerDown={onPointerDown}
			onKeyDown={onKeyDown}
			onDoubleClick={() => setWidth(SIDEBAR_DEFAULT)}
			className={`group absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize touch-none focus-visible:outline-none ${dragging ? "select-none" : ""}`}
		>
			<div
				className={`mx-auto h-full w-0.5 transition-colors duration-150 group-hover:bg-accent/60 group-focus-visible:bg-accent ${dragging ? "bg-accent" : ""}`}
			/>
		</div>
	);
}
