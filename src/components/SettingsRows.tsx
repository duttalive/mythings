// The rows that make up a Settings panel, shared by Settings and its Security section.

import { type ReactNode, useId } from "react";

export type FieldIds = { id: string; labelId: string; hintId?: string };

/** A setting with a control: side by side on wider screens, stacked on phones. */
export function Field({
	label,
	hint,
	group = false,
	wide = false,
	children,
}: {
	label: string;
	hint?: ReactNode;
	/** The control is a group of choices (it names itself from the label), not one field. */
	group?: boolean;
	/** The control is as wide as its choices need, not the usual column. */
	wide?: boolean;
	children: (ids: FieldIds) => ReactNode;
}) {
	const id = useId();
	const labelId = useId();
	const hintId = useId();
	return (
		<div
			className={`grid min-h-12 gap-2 py-3 sm:items-center sm:gap-6 ${
				wide
					? "sm:grid-cols-[minmax(0,1fr)_auto]"
					: "sm:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]"
			}`}
		>
			<div className="min-w-0">
				{group ? (
					<span id={labelId} className="text-sm">
						{label}
					</span>
				) : (
					<label id={labelId} htmlFor={id} className="text-sm">
						{label}
					</label>
				)}
				{hint && (
					<p id={hintId} className="mt-0.5 text-xs text-[var(--fg-muted)]">
						{hint}
					</p>
				)}
			</div>
			{children({ id, labelId, hintId: hint ? hintId : undefined })}
		</div>
	);
}

/** Text (and a note) with buttons: side by side on wider screens; on phones the buttons go underneath. */
export function ActionRow({
	text,
	hint,
	note,
	children,
}: {
	text: ReactNode;
	hint?: ReactNode;
	/** What just happened ("Saved…"), shown under the text. */
	note?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<div className="flex min-h-12 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
			<div className="min-w-0 text-sm">
				<div>{text}</div>
				{hint && (
					<div className="mt-0.5 text-xs text-[var(--fg-muted)]">{hint}</div>
				)}
				{note}
			</div>
			{children && (
				<div className="flex shrink-0 flex-wrap gap-2">{children}</div>
			)}
		</div>
	);
}

/** A row of mutually exclusive buttons (a radio group). */
export function Segmented<T extends string>({
	ids,
	value,
	options,
	onChange,
}: {
	ids: FieldIds;
	value: T;
	options: [T, string][];
	onChange: (value: T) => void;
}) {
	const name = useId();
	return (
		<div
			id={ids.id}
			role="radiogroup"
			aria-labelledby={ids.labelId}
			aria-describedby={ids.hintId}
			className="flex rounded-lg bg-[var(--segment)] p-0.5 text-sm ring-1 ring-[var(--border)] ring-inset"
		>
			{options.map(([option, label]) => (
				<label
					key={option}
					className="relative flex flex-1 cursor-pointer items-center justify-center rounded-md px-2 py-1 text-center text-[var(--fg-muted)] sm:whitespace-nowrap transition-colors duration-150 hover:text-[var(--fg)] has-[:checked]:bg-[var(--segment-on)] has-[:checked]:font-medium has-[:checked]:text-[var(--on-segment-on)] has-[:checked]:shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent pointer-coarse:min-h-10"
				>
					<input
						type="radio"
						name={name}
						value={option}
						checked={value === option}
						onChange={() => onChange(option)}
						className="sr-only"
					/>
					{label}
				</label>
			))}
		</div>
	);
}
