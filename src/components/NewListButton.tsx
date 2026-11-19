import { useState } from "react";
import { useCreateList } from "../editing/useCreateList";
import { AreaIcon, BucketIcon, PlusIcon } from "./icons";
import { Popover, PopoverOption, useFocusHandoff } from "./Popover";
import { ProgressRing } from "./rows";

/**
 * Sidebar "+ New List": a project or area (in the Life Bucket that's open,
 * else the first one), or a new Life Bucket.
 */
export function NewListButton() {
	const [open, setOpen] = useState(false);
	const focus = useFocusHandoff();
	const { createProject, createArea, createBucket } = useCreateList();
	const pick = (create: () => Promise<void>) => () => {
		focus.handOff();
		setOpen(false);
		void create().catch(console.error);
	};

	return (
		<Popover
			label="New list"
			returnFocus={focus.returnFocus}
			open={open}
			onOpenChange={setOpen}
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
			<PopoverOption
				icon={
					<ProgressRing
						progress={{ completed: 0, total: 0 }}
						decorative
						className="size-4"
					/>
				}
				onSelect={pick(() => createProject())}
			>
				<span>
					New Project
					<span className="block text-xs text-[var(--fg-muted)]">
						Work toward an outcome, from start to finish. Can have a deadline.
					</span>
				</span>
			</PopoverOption>
			<PopoverOption
				icon={<AreaIcon className="size-4" />}
				onSelect={pick(() => createArea())}
			>
				<span>
					New Area
					<span className="block text-xs text-[var(--fg-muted)]">
						To-dos for work that keeps going, like Health or Home. No deadline.
					</span>
				</span>
			</PopoverOption>
			<PopoverOption
				icon={<BucketIcon className="size-4" />}
				onSelect={pick(createBucket)}
			>
				<span>
					New Life Bucket
					<span className="block text-xs text-[var(--fg-muted)]">
						A big part of life, like Work or Family, holding its areas and
						projects
					</span>
				</span>
			</PopoverOption>
		</Popover>
	);
}
