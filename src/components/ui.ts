// Shared class strings for buttons, fields, links and dialogs, so every screen
// looks and behaves the same. Compose with template strings.

/** The accent ring for keyboard focus, set off from the control. */
export const focusRing =
	"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// Finger-sized on touch screens (44px), whatever the text size.
const buttonBase = `inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition duration-150 ${focusRing} disabled:cursor-not-allowed pointer-coarse:min-h-11`;
const small = "px-3 py-1.5 text-sm";
// Sign-in and lock screens: body-size text and a little more height.
const large = "px-3 py-2";

// Disabled buttons go grey instead of a faded colour, so they don't look pressable.
const primary =
	"bg-accent text-on-accent hover:opacity-90 disabled:bg-[var(--segment)] disabled:text-[var(--fg-muted)] disabled:hover:opacity-100";
const secondary =
	"border border-[var(--border)] bg-[var(--bg)] hover:bg-[var(--hover)] disabled:text-[var(--fg-muted)] disabled:hover:bg-[var(--bg)]";
const danger =
	"bg-overdue text-on-overdue hover:opacity-90 disabled:opacity-50 disabled:hover:opacity-50";

export const buttonClass = `${buttonBase} ${small} ${primary}`;
export const secondaryButtonClass = `${buttonBase} ${small} ${secondary}`;
export const dangerButtonClass = `${buttonBase} ${small} ${danger}`;
export const dangerOutlineClass = `${buttonBase} ${small} border border-overdue/40 bg-[var(--bg)] text-overdue hover:bg-overdue/10 disabled:opacity-50`;
/** A quiet button with no border: Cancel beside stacked choices. */
export const ghostButtonClass = `${buttonBase} ${small} text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)]`;

// Inside popovers (Reminder, Repeat) and beside list headings: a size smaller.
const compactBase = `inline-flex shrink-0 items-center justify-center rounded-md py-1 transition duration-150 ${focusRing} disabled:cursor-not-allowed pointer-coarse:min-h-11`;
export const compactButtonClass = `${compactBase} px-2.5 font-medium ${primary}`;
export const compactSecondaryButtonClass = `${compactBase} border border-[var(--border)] px-2.5 hover:bg-[var(--hover)]`;
export const compactGhostButtonClass = `${compactBase} px-2 hover:bg-[var(--hover)]`;

export const largeButtonClass = `${buttonBase} ${large} ${primary}`;
export const largeSecondaryButtonClass = `${buttonBase} ${large} ${secondary}`;
export const largeDangerButtonClass = `${buttonBase} ${large} ${danger}`;

const fieldBase =
	"w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] outline-none transition-shadow duration-150 focus:border-accent focus:ring-2 focus:ring-accent/30";
export const inputClass = `${fieldBase} px-2.5 py-1.5 text-sm pointer-coarse:py-2.5`;
export const largeInputClass = `${fieldBase} px-3 py-2 pointer-coarse:py-2.5`;

/** A text link, or a button that reads as one. */
const linkBase = `rounded text-accent underline-offset-2 hover:underline ${focusRing}`;
export const linkClass = `${linkBase} font-medium`;
/** The same link at the weight of the text around it. */
export const quietLinkClass = linkBase;
/** A link on a line of its own: taller to tap on touch screens. */
export const standaloneLinkClass = `${linkClass} pointer-coarse:py-2`;

/** An error under a form's fields. */
export const errorClass = "text-sm text-overdue";

/** A centred dialog and the dimmed page behind it. */
export const dialogOverlayClass = "fixed inset-0 z-50 animate-fade-in bg-scrim";
export const dialogContentClass =
	"fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 animate-fade-in rounded-2xl bg-[var(--card)] p-5 text-[var(--fg)] shadow-[var(--card-shadow)] ring-1 ring-[var(--border)] outline-none";
