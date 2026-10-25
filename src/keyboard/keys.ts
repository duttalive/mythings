// Normalizing keyboard events into combos like "mod+shift+d" (SPEC §10.6).
// `mod` is ⌘ on Apple platforms and Ctrl elsewhere. Letters come from
// `event.code`, since Alt changes `event.key` on macOS (Alt+T types "†").

export const isApple =
	typeof navigator !== "undefined" &&
	/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

type KeyLike = Pick<
	KeyboardEvent,
	"code" | "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

/** The base key: "a"–"z", "0"–"9", "up", "down", "enter", "space", "?" etc. */
export function baseKey(e: KeyLike): string {
	if (e.key === "?") return "?";
	if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
	if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
	const named: Record<string, string> = {
		ArrowUp: "up",
		ArrowDown: "down",
		ArrowLeft: "left",
		ArrowRight: "right",
		Enter: "enter",
		NumpadEnter: "enter",
		Escape: "escape",
		Space: "space",
		Backspace: "backspace",
		Delete: "delete",
		Slash: "/",
	};
	return named[e.code] ?? e.key.toLowerCase();
}

export function comboFromEvent(e: KeyLike, apple = isApple): string {
	const mod = apple ? e.metaKey : e.ctrlKey;
	const parts: string[] = [];
	if (mod) parts.push("mod");
	if (e.altKey) parts.push("alt");
	const key = baseKey(e);
	// "?" already implies Shift.
	if (e.shiftKey && key !== "?") parts.push("shift");
	parts.push(key);
	return parts.join("+");
}

/** "mod+shift+d" → "⌘⇧D" on Apple, "Ctrl+Shift+D" elsewhere. */
export function formatCombo(combo: string, apple = isApple): string {
	const names: Record<string, [string, string]> = {
		mod: ["⌘", "Ctrl+"],
		alt: ["⌥", "Alt+"],
		shift: ["⇧", "Shift+"],
		up: ["↑", "↑"],
		down: ["↓", "↓"],
		enter: ["↩", "Enter"],
		escape: ["Esc", "Esc"],
		space: ["Space", "Space"],
		backspace: ["⌫", "Backspace"],
		delete: ["⌦", "Delete"],
	};
	return combo
		.split("+")
		.map((part) => {
			const name = names[part];
			return name ? (apple ? name[0] : name[1]) : part.toUpperCase();
		})
		.join("");
}

/** True when typing is going into a text field, where most shortcuts shouldn't fire. */
export function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	if (target instanceof HTMLTextAreaElement) return true;
	if (target instanceof HTMLInputElement) {
		return ![
			"checkbox",
			"radio",
			"button",
			"submit",
			"reset",
			"range",
			"color",
		].includes(target.type);
	}
	return target instanceof HTMLSelectElement;
}

/** A single printable character with no ⌘/Ctrl/Alt, e.g. what opens Quick Find. */
export function printableChar(e: KeyLike): string | null {
	if (e.metaKey || e.ctrlKey || e.altKey) return null;
	return e.key.length === 1 && e.key !== " " ? e.key : null;
}
