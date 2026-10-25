// Swipe gestures on touch screens (SPEC §10.1): swipe a row right to set When,
// left to delete. Only touch pointers swipe; mice and pens drag as before.
// A gesture is decided after a few pixels: mostly sideways swipes, anything
// else is left to scrolling (and long presses to drag and drop).

import { useCallback, useRef, useState } from "react";

/** How far a row must travel to trigger its action. */
export const SWIPE_THRESHOLD = 72;
/** Rows stop following the finger this far out. */
const MAX_OFFSET = 120;
/** Movement before we decide between swiping and scrolling. */
const DECIDE_AFTER = 10;

export type SwipeDirection = "left" | "right";

type Phase = "idle" | "pending" | "swiping" | "scrolling";

/** Pure decision step, exported for tests: what a move of (dx, dy) means while pending. */
export function decide(dx: number, dy: number): Phase {
	if (Math.abs(dx) < DECIDE_AFTER && Math.abs(dy) < DECIDE_AFTER)
		return "pending";
	return Math.abs(dx) > Math.abs(dy) * 1.5 ? "swiping" : "scrolling";
}

/** Where the row sits for a finger at dx: follows it, with resistance past the limit. */
export function offsetFor(dx: number): number {
	const sign = Math.sign(dx);
	const distance = Math.abs(dx);
	if (distance <= MAX_OFFSET) return dx;
	return sign * (MAX_OFFSET + (distance - MAX_OFFSET) * 0.2);
}

export function swipeResult(offset: number): SwipeDirection | null {
	if (offset >= SWIPE_THRESHOLD) return "right";
	if (offset <= -SWIPE_THRESHOLD) return "left";
	return null;
}

export function useSwipe(
	onSwipe: ((direction: SwipeDirection) => void) | undefined,
) {
	const [offset, setOffset] = useState(0);
	const [settling, setSettling] = useState(false);
	const start = useRef<{ x: number; y: number; id: number } | null>(null);
	const phase = useRef<Phase>("idle");
	const swipedAt = useRef(0);

	const reset = useCallback(() => {
		start.current = null;
		phase.current = "idle";
		setSettling(true);
		setOffset(0);
	}, []);

	const handlers = onSwipe
		? {
				onPointerDown: (e: React.PointerEvent) => {
					if (e.pointerType !== "touch" || !e.isPrimary) return;
					start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
					phase.current = "pending";
					setSettling(false);
				},
				onPointerMove: (e: React.PointerEvent) => {
					const s = start.current;
					if (!s || s.id !== e.pointerId) return;
					const dx = e.clientX - s.x;
					const dy = e.clientY - s.y;
					if (phase.current === "pending") {
						phase.current = decide(dx, dy);
						if (phase.current === "swiping")
							e.currentTarget.setPointerCapture(e.pointerId);
					}
					if (phase.current === "swiping") setOffset(offsetFor(dx));
				},
				onPointerUp: (e: React.PointerEvent) => {
					if (start.current?.id !== e.pointerId) return;
					if (phase.current === "swiping") {
						swipedAt.current = Date.now();
						const direction = swipeResult(offset);
						if (direction) onSwipe(direction);
					}
					reset();
				},
				onPointerCancel: reset,
				// The tap that ends a swipe shouldn't also open the row.
				onClickCapture: (e: React.MouseEvent) => {
					if (Date.now() - swipedAt.current < 300) {
						e.preventDefault();
						e.stopPropagation();
					}
				},
			}
		: {};

	return { offset, settling, handlers };
}
