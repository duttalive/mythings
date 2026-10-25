import * as RadixPopover from "@radix-ui/react-popover";
import { type ReactNode, useMemo, useRef } from "react";

/**
 * A popover anchored to its trigger. Content renders in place (no portal), so
 * it stays inside the card that opened it — clicks in it don't count as
 * "outside" the card.
 */
export function Popover({
	trigger,
	open,
	onOpenChange,
	label,
	returnFocus,
	width = "w-64",
	anchorOnly = false,
	children,
}: {
	trigger: ReactNode;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	label: string;
	/** Asked on close; returning false leaves focus where an action put it. See useFocusHandoff. */
	returnFocus?: () => boolean;
	/** Tailwind width class for the panel. */
	width?: string;
	/** `trigger` only positions the panel; something else opens it. */
	anchorOnly?: boolean;
	children: ReactNode;
}) {
	return (
		<RadixPopover.Root open={open} onOpenChange={onOpenChange}>
			{anchorOnly ? (
				<RadixPopover.Anchor asChild>{trigger}</RadixPopover.Anchor>
			) : (
				<RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
			)}
			<RadixPopover.Content
				data-popover-content
				aria-label={label}
				side="bottom"
				align="start"
				sideOffset={6}
				collisionPadding={12}
				onCloseAutoFocus={(e) => {
					if (returnFocus && !returnFocus()) e.preventDefault();
				}}
				className={`z-40 animate-pop-in ${width} max-w-[calc(100vw-1.5rem)] rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 text-sm shadow-[var(--card-shadow)] outline-none`}
			>
				{children}
			</RadixPopover.Content>
		</RadixPopover.Root>
	);
}

/** A full-width option row inside a popover. */
export function PopoverOption({
	icon,
	children,
	onSelect,
	pressed,
}: {
	icon?: ReactNode;
	children: ReactNode;
	onSelect: () => void;
	pressed?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={pressed}
			className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left pointer-coarse:py-3 hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)] focus-visible:outline-none aria-pressed:font-medium"
		>
			<span className="flex w-4 justify-center">{icon}</span>
			{children}
		</button>
	);
}

/**
 * For menus whose actions move focus somewhere new (a new title, another
 * page): call handOff() in the action, and pass returnFocus to the Popover so
 * closing doesn't pull focus back to the menu button.
 */
export function useFocusHandoff() {
	const handedOff = useRef(false);
	return useMemo(
		() => ({
			handOff: () => {
				handedOff.current = true;
			},
			returnFocus: () => {
				const restore = !handedOff.current;
				handedOff.current = false;
				return restore;
			},
		}),
		[],
	);
}
