import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
	addDays,
	addMonths,
	type LocalDate,
	monthOf,
	parseLocalDate,
	startOfWeek,
} from "../../shared/dates";
import { ChevronIcon } from "./icons";

function utc(date: LocalDate): Date {
	const { year, month, day } = parseLocalDate(date);
	return new Date(Date.UTC(year, month - 1, day));
}

const monthTitle = new Intl.DateTimeFormat(undefined, {
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});
const weekdayInitial = new Intl.DateTimeFormat(undefined, {
	weekday: "narrow",
	timeZone: "UTC",
});
const dayLabel = new Intl.DateTimeFormat(undefined, {
	weekday: "long",
	month: "long",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

/** A month grid. Arrow keys move between days (one tab stop), PageUp/PageDown change month. */
export function Calendar({
	value,
	today,
	weekStart,
	onSelect,
	disablePast = false,
}: {
	value: LocalDate | null;
	today: LocalDate;
	weekStart: number;
	onSelect: (date: LocalDate) => void;
	disablePast?: boolean;
}) {
	const [focused, setFocused] = useState<LocalDate>(value ?? today);
	const [month, setMonth] = useState(monthOf(value ?? today));
	const grid = useRef<HTMLDivElement>(null);
	const moved = useRef(false);

	const start = startOfWeek(`${month}-01`, weekStart);
	const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
	const weekdays = days.slice(0, 7);

	// Only move DOM focus after keyboard navigation, not on first render.
	useEffect(() => {
		if (!moved.current) return;
		grid.current
			?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
			?.focus();
	}, [focused]);

	const go = (date: LocalDate) => {
		moved.current = true;
		setFocused(date);
		if (monthOf(date) !== month) setMonth(monthOf(date));
	};

	const onKeyDown = (e: KeyboardEvent) => {
		let next: LocalDate;
		switch (e.key) {
			case "ArrowLeft":
				next = addDays(focused, -1);
				break;
			case "ArrowRight":
				next = addDays(focused, 1);
				break;
			case "ArrowUp":
				next = addDays(focused, -7);
				break;
			case "ArrowDown":
				next = addDays(focused, 7);
				break;
			case "PageUp":
				next = addMonths(focused, -1);
				break;
			case "PageDown":
				next = addMonths(focused, 1);
				break;
			default:
				return;
		}
		e.preventDefault();
		go(next);
	};

	const shiftMonth = (delta: number) => {
		const next = monthOf(addMonths(`${month}-01`, delta));
		setMonth(next);
		setFocused(`${next}-01`);
	};

	return (
		<div className="select-none">
			<div className="mb-1 flex items-center justify-between px-1">
				<span className="text-sm font-semibold" aria-live="polite">
					{monthTitle.format(utc(`${month}-01`))}
				</span>
				<div className="flex">
					<button
						type="button"
						aria-label="Previous month"
						onClick={() => shiftMonth(-1)}
						className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--hover)] pointer-coarse:p-2.5"
					>
						<ChevronIcon className="size-4 rotate-180" />
					</button>
					<button
						type="button"
						aria-label="Next month"
						onClick={() => shiftMonth(1)}
						className="rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--hover)] pointer-coarse:p-2.5"
					>
						<ChevronIcon className="size-4" />
					</button>
				</div>
			</div>
			<div
				className="grid grid-cols-7 text-center text-[0.6875rem] text-[var(--fg-muted)]"
				aria-hidden
			>
				{weekdays.map((d) => (
					<span key={d} className="py-1">
						{weekdayInitial.format(utc(d))}
					</span>
				))}
			</div>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: arrow-key navigation for the day buttons inside */}
			<div
				ref={grid}
				className="grid grid-cols-7 gap-y-0.5"
				onKeyDown={onKeyDown}
			>
				{days.map((date) => {
					const inMonth = monthOf(date) === month;
					const past = disablePast && date < today;
					const selected = date === value;
					return (
						<button
							key={date}
							type="button"
							data-date={date}
							tabIndex={date === focused ? 0 : -1}
							disabled={past}
							aria-pressed={selected}
							aria-label={`${dayLabel.format(utc(date))}${date === today ? ", today" : ""}`}
							onClick={() => onSelect(date)}
							onFocus={() => setFocused(date)}
							className={`mx-auto flex size-8 pointer-coarse:size-10 items-center justify-center rounded-full text-[0.8125rem] tabular-nums focus-visible:outline-2 focus-visible:outline-accent ${
								selected
									? "bg-accent font-semibold text-on-accent"
									: date === today
										? "font-semibold text-accent hover:bg-[var(--hover)]"
										: "hover:bg-[var(--hover)]"
							} ${inMonth ? "" : "text-[var(--fg-muted)] opacity-60"} disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent`}
						>
							{parseLocalDate(date).day}
						</button>
					);
				})}
			</div>
		</div>
	);
}
