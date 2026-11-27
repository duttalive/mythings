// The filter bar at the top of a list (SPEC §6.6): one dropdown each for Life
// Buckets, Areas, Projects and Tags. Each dropdown picks any number; the
// choices live in the page's search params, so they survive reloads and tabs.

import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { UNREADABLE } from "../../shared/crypto/fields";
import { bySortKey, type FilterKind } from "../../shared/views";
import { FILTER_PARAMS, useListData, useListFilter } from "../data";
import {
	AreaIcon,
	BucketIcon,
	CheckIcon,
	ChevronIcon,
	CrossIcon,
	SearchIcon,
	TagIcon,
} from "./icons";
import { Popover } from "./Popover";
import { flattenTags } from "./pickers";
import { ProgressRing } from "./rows";

type Option = {
	id: string;
	title: string;
	/** Where it sits, e.g. the Life Bucket of an area. */
	detail?: string;
	depth?: number;
	icon?: ReactNode;
	muted?: boolean;
};

const LABELS: Record<FilterKind, { one: string; untitled: string }> = {
	buckets: { one: "Life Bucket", untitled: "New Life Bucket" },
	areas: { one: "Area", untitled: "New Area" },
	projects: { one: "Project", untitled: "New Project" },
	tags: { one: "Tag", untitled: "New Tag" },
};

const shown = (title: string, untitled: string) =>
	title === UNREADABLE ? "🔒" : title || untitled;

/** All four kinds unless a page narrows it (e.g. a project page offers only tags). */
export function FilterBar({
	kinds = ["buckets", "areas", "projects", "tags"],
	onlyTags,
}: {
	kinds?: FilterKind[];
	/** Only these tags (and any chosen) are offered; all if omitted. */
	onlyTags?: Set<string>;
}) {
	const { data } = useListData();
	const filter = useListFilter();
	const navigate = useNavigate();

	const options = useMemo(() => {
		const buckets = data.buckets
			.filter((b) => b.deletedAt === null)
			.sort(bySortKey);
		const bucketOrder = new Map(buckets.map((b, i) => [b.id, i]));
		const bucketTitle = (id: string | null) => {
			const bucket = id ? data.buckets.find((b) => b.id === id) : undefined;
			return bucket && bucket.deletedAt === null
				? shown(bucket.title, LABELS.buckets.untitled)
				: undefined;
		};
		const inBucketOrder = <T extends { id: string; sortKey: string }>(
			bucketId: (item: T) => string | null,
		) => {
			return (a: T, b: T) =>
				(bucketOrder.get(bucketId(a) ?? "") ?? -1) -
					(bucketOrder.get(bucketId(b) ?? "") ?? -1) || bySortKey(a, b);
		};
		const byKind: Record<FilterKind, Option[]> = {
			buckets: buckets.map((b) => ({
				id: b.id,
				title: shown(b.title, LABELS.buckets.untitled),
				icon: <BucketIcon className="size-4 text-[var(--fg-muted)]" />,
			})),
			areas: data.areas
				.filter((a) => a.deletedAt === null)
				.sort(inBucketOrder((a) => a.bucketId))
				.map((a) => ({
					id: a.id,
					title: shown(a.title, LABELS.areas.untitled),
					detail: bucketTitle(a.bucketId),
					icon: <AreaIcon className="size-4 text-[var(--fg-muted)]" />,
				})),
			// Open projects first, then finished ones (for the Logbook and Trash).
			projects: data.projects
				.filter((p) => p.deletedAt === null)
				.sort(
					(a, b) =>
						Number(a.status !== "open") - Number(b.status !== "open") ||
						inBucketOrder<typeof a>((p) => p.areaId)(a, b),
				)
				.map((p) => ({
					id: p.id,
					title: shown(p.title, LABELS.projects.untitled),
					detail: bucketTitle(p.areaId),
					muted: p.status !== "open",
					icon: (
						<ProgressRing
							progress={{ completed: 0, total: 0 }}
							status={p.status}
							decorative
							className="size-4"
						/>
					),
				})),
			tags: flattenTags(data.tags)
				.filter(
					({ tag }) =>
						!onlyTags ||
						onlyTags.has(tag.id) ||
						(filter.tags ?? []).includes(tag.id),
				)
				.map(({ tag, depth }) => ({
					id: tag.id,
					title: shown(tag.title, LABELS.tags.untitled),
					depth,
					icon: <TagIcon className="size-4 text-[var(--fg-muted)]" />,
				})),
		};
		return byKind;
	}, [data, onlyTags, filter.tags]);

	const set = (kind: FilterKind, ids: string[]) =>
		navigate({
			to: ".",
			search: (prev: Record<string, unknown>) => ({
				...prev,
				[FILTER_PARAMS[kind]]: ids.length ? ids.join(",") : undefined,
			}),
			replace: true,
		});

	const clearAll = () =>
		navigate({
			to: ".",
			search: (prev: Record<string, unknown>) => {
				const next = { ...prev };
				for (const param of Object.values(FILTER_PARAMS)) delete next[param];
				return next;
			},
			replace: true,
		});

	const visible = kinds.filter(
		(kind) => options[kind].length > 0 || (filter[kind]?.length ?? 0) > 0,
	);
	if (visible.length === 0) return null;
	const filtering = kinds.some((kind) => (filter[kind]?.length ?? 0) > 0);

	return (
		<div
			role="toolbar"
			aria-label="Filters"
			className="mb-4 flex flex-wrap items-center gap-1.5"
		>
			{visible.map((kind) => (
				<FilterDropdown
					key={kind}
					kind={kind}
					options={options[kind]}
					selected={filter[kind] ?? []}
					onChange={(ids) => set(kind, ids)}
				/>
			))}
			{filtering && (
				<button
					type="button"
					onClick={clearAll}
					className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:py-2"
				>
					<CrossIcon className="size-3" />
					Clear filters
				</button>
			)}
		</div>
	);
}

function FilterDropdown({
	kind,
	options,
	selected,
	onChange,
}: {
	kind: FilterKind;
	options: Option[];
	selected: string[];
	onChange: (ids: string[]) => void;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const { one } = LABELS[kind];
	const count = selected.length;
	const chosen = new Set(selected);
	const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	const matching = words.length
		? options.filter((o) => {
				const text = `${o.title} ${o.detail ?? ""}`.toLowerCase();
				return words.every((w) => text.includes(w));
			})
		: options;
	const single =
		count === 1 ? options.find((o) => o.id === selected[0])?.title : undefined;

	const toggle = (id: string) =>
		onChange(
			chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id],
		);

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setQuery("");
			}}
			label={`Filter by ${one}`}
			width="w-72"
			trigger={
				<button
					type="button"
					aria-label={
						count ? `${one} filter: ${count} chosen` : `Filter by ${one}`
					}
					className={`flex max-w-56 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors duration-150 pointer-coarse:px-3 pointer-coarse:py-2 ${
						count
							? "border-accent bg-accent text-on-accent"
							: "border-[var(--border)] text-[var(--fg-muted)] hover:bg-[var(--hover)]"
					}`}
				>
					<span className="truncate">
						{count === 0
							? one
							: single
								? `${one}: ${single}`
								: `${one} · ${count}`}
					</span>
					<ChevronIcon className="size-3 shrink-0 rotate-90" />
				</button>
			}
		>
			{options.length > 8 && (
				<div className="mb-1 flex items-center gap-2 rounded-md border border-[var(--border)] px-2 focus-within:border-accent">
					<SearchIcon className="size-3.5 shrink-0 text-[var(--fg-muted)]" />
					<input
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={`Find a ${one}`}
						aria-label={`Find a ${one}`}
						className="min-w-0 flex-1 bg-transparent py-1 outline-none"
					/>
				</div>
			)}
			<div className="max-h-72 overflow-y-auto">
				{matching.length === 0 && (
					<p className="px-2 py-1.5 text-[var(--fg-muted)]">No matches.</p>
				)}
				{matching.map((o) => (
					<button
						key={o.id}
						type="button"
						aria-pressed={chosen.has(o.id)}
						onClick={() => toggle(o.id)}
						style={
							o.depth && !words.length
								? { paddingLeft: `${0.5 + o.depth}rem` }
								: undefined
						}
						className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left pointer-coarse:py-3 hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)] focus-visible:outline-none"
					>
						<span className="flex w-4 shrink-0 justify-center">{o.icon}</span>
						<span className="min-w-0 flex-1">
							<span
								className={`block truncate ${o.muted ? "text-[var(--fg-muted)]" : ""}`}
							>
								{o.title}
							</span>
							{o.detail && (
								<span className="block truncate text-xs text-[var(--fg-muted)]">
									{o.detail}
								</span>
							)}
						</span>
						<CheckIcon
							className={`size-4 shrink-0 text-accent ${chosen.has(o.id) ? "" : "invisible"}`}
						/>
					</button>
				))}
			</div>
			{count > 0 && (
				<button
					type="button"
					onClick={() => onChange([])}
					className="mt-1 w-full rounded-md border-t border-[var(--border)] px-2 pt-2 pb-1 text-left text-[var(--fg-muted)] hover:text-[var(--fg)]"
				>
					Show all{" "}
					{one === "Life Bucket" ? "Life Buckets" : `${one.toLowerCase()}s`}
				</button>
			)}
		</Popover>
	);
}
