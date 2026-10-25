// Text size (Settings → Appearance). Per device, so a phone and a desktop can
// differ. Applied as the root font size; index.html applies it before first paint.

export type TextSize = "small" | "default" | "large" | "larger";

export const TEXT_SIZES: [TextSize, string, string][] = [
	["small", "Small", "87.5%"],
	["default", "Default", "100%"],
	["large", "Large", "112.5%"],
	["larger", "Larger", "125%"],
];

const KEY = "mythings:textSize";

export function loadTextSize(): TextSize {
	try {
		const value = localStorage.getItem(KEY);
		return TEXT_SIZES.some(([size]) => size === value)
			? (value as TextSize)
			: "default";
	} catch {
		return "default";
	}
}

export function applyTextSize(size: TextSize): void {
	const scale = TEXT_SIZES.find(([s]) => s === size)?.[2] ?? "100%";
	document.documentElement.style.setProperty("--text-scale", scale);
	try {
		if (size === "default") localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, size);
	} catch {}
}
