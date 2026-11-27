import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { bySortKey } from "../../shared/views";
import { useListData } from "../data";
import { bucketOnPage, useCreateList } from "../editing/useCreateList";
import { AreaIcon, BucketIcon, PlusIcon } from "./icons";
import { Popover, PopoverOption, useFocusHandoff } from "./Popover";
import { ProgressRing } from "./rows";

type Kind = "project" | "area";

/**
 * Sidebar "+ New List": a project or area, then which Life Bucket it goes in
 * (the one open on screen comes first and is picked; with only one bucket,
 * there's nothing to ask), or a new Life Bucket.
 */
export function NewListButton() {
	const [open, setOpen] = useState(false);
	const [kind, setKind] = useState<Kind | null>(null);
	const focus = useFocusHandoff();
	const { pathname } = useLocation();
	const { data } = useListData();
	const { createProject, createArea, createBucket, addBucket } =
		useCreateList();
	const buckets = data.buckets
		.filter((b) => b.deletedAt === null)
		.sort(bySortKey);
	const here = bucketOnPage(pathname, data);
	const ordered = here
		? [
				...buckets.filter((b) => b.id === here),
				...buckets.filter((b) => b.id !== here),
			]
		: buckets;

	const finish = (create: () => Promise<unknown>) => {
		focus.handOff();
		setOpen(false);
		setKind(null);
		void create().catch(console.error);
	};
	const createIn = (k: Kind, bucketId: string | null) =>
		finish(() => (k === "project" ? createProject : createArea)(bucketId));
	const choose = (k: Kind) => {
		// With one Life Bucket (or none yet), there's nothing to choose.
		if (buckets.length <= 1) createIn(k, buckets[0]?.id ?? null);
		else setKind(k);
	};

	return (
		<Popover
			label={
				kind ? `New ${kind === "project" ? "Project" : "Area"} in` : "New list"
			}
			returnFocus={focus.returnFocus}
			open={open}
			onOpenChange={(o) => {
				setOpen(o);
				if (!o) setKind(null);
			}}
			trigger={
				<button
					type="button"
					className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent"
				>
					<PlusIcon className="size-4" />
					New List
				</button>
			}
		>
			{kind ? (
				<BucketStep
					kind={kind}
					buckets={ordered}
					here={here}
					onBack={() => setKind(null)}
					onPick={(bucketId) => createIn(kind, bucketId)}
					onNewBucket={(title) =>
						finish(async () => {
							const bucketId = await addBucket(title);
							await (kind === "project" ? createProject : createArea)(bucketId);
						})
					}
				/>
			) : (
				<>
					<PopoverOption
						icon={
							<ProgressRing
								progress={{ completed: 0, total: 0 }}
								decorative
								className="size-4"
							/>
						}
						onSelect={() => choose("project")}
					>
						<span>
							New Project
							<span className="block text-xs text-[var(--fg-muted)]">
								Work toward an outcome, from start to finish. Can have a
								deadline.
							</span>
						</span>
					</PopoverOption>
					<PopoverOption
						icon={<AreaIcon className="size-4" />}
						onSelect={() => choose("area")}
					>
						<span>
							New Area
							<span className="block text-xs text-[var(--fg-muted)]">
								Tasks for work that keeps going, like Health or Home. No
								deadline.
							</span>
						</span>
					</PopoverOption>
					<PopoverOption
						icon={<BucketIcon className="size-4" />}
						onSelect={() => finish(createBucket)}
					>
						<span>
							New Life Bucket
							<span className="block text-xs text-[var(--fg-muted)]">
								A big part of life, like Work or Family, holding its areas and
								projects
							</span>
						</span>
					</PopoverOption>
				</>
			)}
		</Popover>
	);
}

/** Which Life Bucket a new project or area goes in. */
function BucketStep({
	kind,
	buckets,
	here,
	onBack,
	onPick,
	onNewBucket,
}: {
	kind: Kind;
	buckets: { id: string; title: string }[];
	here: string | null;
	onBack: () => void;
	onPick: (bucketId: string) => void;
	onNewBucket: (title: string) => void;
}) {
	const list = useRef<HTMLDivElement>(null);
	const [name, setName] = useState("");
	// The first option (the bucket you're in, if any) has focus: Enter picks it.
	useEffect(() => {
		list.current?.querySelector("button")?.focus();
	}, []);
	return (
		<div>
			<p className="flex items-center gap-1.5 px-2 pt-1 pb-1.5 text-xs font-semibold text-[var(--fg-muted)]">
				<button
					type="button"
					onClick={onBack}
					aria-label="Back"
					className="rounded px-1 hover:bg-[var(--hover)] hover:text-[var(--fg)]"
				>
					‹
				</button>
				New {kind === "project" ? "Project" : "Area"} in which Life Bucket?
			</p>
			<div ref={list}>
				{buckets.map((b) => (
					<PopoverOption
						key={b.id}
						icon={<BucketIcon className="size-4" />}
						pressed={b.id === here}
						onSelect={() => onPick(b.id)}
					>
						{b.title || "New Life Bucket"}
					</PopoverOption>
				))}
			</div>
			<form
				className="mt-1 border-t border-[var(--border)] pt-1.5"
				onSubmit={(e) => {
					e.preventDefault();
					if (name.trim()) onNewBucket(name.trim());
				}}
			>
				<label className="flex items-center gap-2.5 px-2 py-1">
					<PlusIcon className="size-4 shrink-0 text-[var(--fg-muted)]" />
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="New Life Bucket…"
						aria-label="New Life Bucket name"
						className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--fg-muted)]"
					/>
				</label>
			</form>
		</div>
	);
}
