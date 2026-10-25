// Small shared controls for editing cards and list headers.

import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import type { LocalDate } from "../../shared/dates";
import type { Project, Todo } from "../../shared/schema";
import { isEvening } from "../../shared/views";
import { useSavedField } from "../editing/useSavedField";
import { dayLabel } from "../lib/format";
import { BoxIcon, CalendarIcon, MoonIcon, StarIcon } from "./icons";

/** Grows a textarea to fit its content. */
export function useAutoGrow(
	ref: React.RefObject<HTMLTextAreaElement | null>,
	value: string,
) {
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the text changes
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, [ref, value]);
}

export function whenText(todo: Todo | Project, today: LocalDate): string {
	if (todo.when === "someday") return "Someday";
	if (isEvening(todo, today)) return "This Evening";
	if (todo.startDate && todo.startDate <= today) return "Today";
	return todo.startDate ? dayLabel(todo.startDate, today) : "";
}

export function WhenIcon({
	todo,
	today,
}: {
	todo: Todo | Project;
	today: LocalDate;
}) {
	if (todo.when === "someday")
		return <BoxIcon className="size-3.5 text-amber-700" />;
	if (isEvening(todo, today))
		return <MoonIcon className="size-3.5 text-evening" />;
	if (todo.startDate && todo.startDate <= today)
		return <StarIcon className="size-3.5 text-today" />;
	return <CalendarIcon className="size-3.5" />;
}

const chipClass =
	"flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--hover)] pointer-coarse:px-2.5 pointer-coarse:py-2";

export function Chip({
	icon,
	children,
}: {
	icon: ReactNode;
	children: ReactNode;
}) {
	return (
		<span className={chipClass.replace("hover:bg-[var(--hover)]", "")}>
			{icon}
			{children}
		</span>
	);
}

export function ChipButton({
	icon,
	children,
	danger,
	className = "",
	...props
}: {
	icon: ReactNode;
	children: ReactNode;
	danger?: boolean;
} & React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			{...props}
			className={`${chipClass} ${danger ? "text-overdue" : ""} ${className}`}
		>
			{icon}
			{children}
		</button>
	);
}

export function IconButton({
	label,
	children,
	...props
}: { label: string } & React.ComponentProps<"button">) {
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			{...props}
			className="rounded-md p-1.5 text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:p-2.5"
		>
			{children}
		</button>
	);
}

/** A borderless text input for list and heading titles; saves as you type. */
export function EditableTitle({
	value,
	onSave,
	placeholder,
	label,
	autoFocus = false,
	className = "",
}: {
	value: string;
	onSave: (value: string) => void;
	placeholder: string;
	label: string;
	autoFocus?: boolean;
	className?: string;
}) {
	const field = useSavedField(value, onSave);
	const input = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (autoFocus) input.current?.select();
	}, [autoFocus]);
	return (
		<input
			ref={input}
			value={field.value}
			onChange={(e) => field.onChange(e.target.value)}
			onBlur={field.flush}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === "Escape") {
					e.preventDefault();
					field.flush();
					input.current?.blur();
				}
			}}
			placeholder={placeholder}
			aria-label={label}
			className={`min-w-0 flex-1 rounded bg-transparent outline-none placeholder:text-[var(--fg-muted)] focus-visible:ring-2 focus-visible:ring-accent/30 ${className}`}
		/>
	);
}

/** An auto-growing notes field that saves as you type. */
export function NotesField({
	value,
	onSave,
	className = "",
}: {
	value: string;
	onSave: (value: string) => void;
	className?: string;
}) {
	const field = useSavedField(value, onSave);
	const ref = useRef<HTMLTextAreaElement>(null);
	useAutoGrow(ref, field.value);
	return (
		<textarea
			ref={ref}
			value={field.value}
			onChange={(e) => field.onChange(e.target.value)}
			onBlur={field.flush}
			rows={1}
			placeholder="Notes"
			aria-label="Notes"
			className={`block w-full resize-none overflow-hidden rounded bg-transparent leading-relaxed outline-none placeholder:text-[var(--fg-muted)] focus-visible:ring-2 focus-visible:ring-accent/30 ${className}`}
		/>
	);
}
