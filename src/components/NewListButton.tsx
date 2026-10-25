import { useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { locationFromPath } from "../editing/defaults";
import { useCreateList } from "../editing/useCreateList";
import { AreaIcon, PlusIcon } from "./icons";
import { Popover, PopoverOption, useFocusHandoff } from "./Popover";
import { ProgressRing } from "./rows";

/** Sidebar "+ New List": a project (inside the open area, if any) or an area. */
export function NewListButton() {
	const [open, setOpen] = useState(false);
	const focus = useFocusHandoff();
	const { pathname } = useLocation();
	const { createProject, createArea } = useCreateList();
	const location = locationFromPath(pathname);
	const areaId = location.list === "area" ? location.areaId : null;

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
				onSelect={() => {
					focus.handOff();
					setOpen(false);
					void createProject(areaId).catch(console.error);
				}}
			>
				<span>
					New Project
					<span className="block text-xs text-[var(--fg-muted)]">
						A goal with an end, made of to-dos
					</span>
				</span>
			</PopoverOption>
			<PopoverOption
				icon={<AreaIcon className="size-4" />}
				onSelect={() => {
					focus.handOff();
					setOpen(false);
					void createArea().catch(console.error);
				}}
			>
				<span>
					New Area
					<span className="block text-xs text-[var(--fg-muted)]">
						An ongoing part of life, like Work or Home
					</span>
				</span>
			</PopoverOption>
		</Popover>
	);
}
