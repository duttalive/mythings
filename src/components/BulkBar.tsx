// The bar for acting on several selected to-dos at once (SPEC §10.7). Its
// panels also serve keyboard shortcuts (⌘S, ⌘⇧D, ⌘⇧T, ⌘⇧M) for any selection.

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { useAuth } from "../auth/AuthGate";
import { useListData } from "../data";
import { useEditing } from "../editing/EditingProvider";
import { useSelection } from "../editing/SelectionProvider";
import { useBulkActions } from "../editing/useBulkActions";
import { useCreateTag } from "../editing/useCreateTag";
import {
	CalendarIcon,
	CheckIcon,
	CrossIcon,
	FlagIcon,
	LayersIcon,
	TagIcon,
	TrashIcon,
} from "./icons";
import { Popover } from "./Popover";
import { DeadlinePicker, ListPicker, TagPicker, WhenPicker } from "./pickers";

export type BulkPanel = "when" | "deadline" | "tags" | "move";

const BulkContext = createContext<{
	openPanel: (panel: BulkPanel) => void;
} | null>(null);

export function useBulkBar() {
	const value = useContext(BulkContext);
	if (!value) throw new Error("Must be used inside <BulkBarProvider>");
	return value;
}

export function BulkBarProvider({ children }: { children: ReactNode }) {
	const [panel, setPanel] = useState<BulkPanel | null>(null);
	const openPanel = useCallback((p: BulkPanel) => setPanel(p), []);
	const value = useMemo(() => ({ openPanel }), [openPanel]);
	return (
		<BulkContext value={value}>
			{children}
			<BulkBar panel={panel} setPanel={setPanel} />
		</BulkContext>
	);
}

function BulkBar({
	panel,
	setPanel,
}: {
	panel: BulkPanel | null;
	setPanel: (p: BulkPanel | null) => void;
}) {
	const { selectedIds, clear } = useSelection();
	const { expandedId } = useEditing();
	const { data, ctx, projects, areas } = useListData();
	const { user } = useAuth();
	const actions = useBulkActions();
	const createTag = useCreateTag();
	const ids = selectedIds();
	const count = ids.length;

	// Shown for 2+ to-dos, or for one when a shortcut opened a panel. Not while a card is open.
	if (count === 0 || expandedId || (count < 2 && panel === null)) return null;

	const done = () => setPanel(null);
	const todos = ids
		.map((id) => data.todos.find((t) => t.id === id))
		.filter((t) => !!t);
	const commonTags = data.tags
		.filter((tag) => todos.every((t) => t?.tagIds.includes(tag.id)))
		.map((t) => t.id);
	const panelProps = (name: BulkPanel) => ({
		open: panel === name,
		onOpenChange: (o: boolean) => setPanel(o ? name : null),
	});
	const button = (label: string, icon: ReactNode, onClick?: () => void) => (
		<button
			type="button"
			onClick={onClick}
			title={label}
			aria-label={label}
			className="rounded-lg p-2 text-[var(--fg-muted)] hover:bg-[var(--hover)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-accent"
		>
			{icon}
		</button>
	);

	return (
		<div
			data-bulk-bar
			role="toolbar"
			aria-label={`${count} selected`}
			// On phones it sits above the + button.
			className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex max-w-[calc(100vw-1rem)] overflow-x-auto md:bottom-5 animate-fade-in -translate-x-1/2 items-center gap-0.5 rounded-xl bg-[var(--card)] p-1 pl-3 text-sm shadow-[var(--card-shadow)] ring-1 ring-[var(--border)]"
		>
			<span className="mr-2 font-medium tabular-nums" aria-live="polite">
				{count} selected
			</span>
			<Popover
				label="When"
				{...panelProps("when")}
				trigger={button("When", <CalendarIcon className="size-4" />)}
			>
				<WhenPicker
					value={{ when: "anytime", startDate: null, evening: false }}
					today={ctx.today}
					weekStart={user.settings.weekStart ?? 1}
					onChange={(fields) => {
						actions.schedule(ids, fields);
						done();
					}}
				/>
			</Popover>
			<Popover
				label="Move"
				{...panelProps("move")}
				trigger={button("Move", <LayersIcon className="size-4" />)}
			>
				<ListPicker
					projects={[...projects.values()]}
					areas={[...areas.values()]}
					onSelect={(choice) => {
						actions.moveTo(ids, choice);
						done();
					}}
				/>
			</Popover>
			<Popover
				label="Tags"
				{...panelProps("tags")}
				trigger={button("Tags", <TagIcon className="size-4" />)}
			>
				<TagPicker
					tags={data.tags}
					selected={commonTags}
					onToggle={(tagId) => actions.toggleTag(ids, tagId)}
					onCreate={async (title) =>
						actions.toggleTag(ids, await createTag(title))
					}
				/>
			</Popover>
			<Popover
				label="Deadline"
				{...panelProps("deadline")}
				trigger={button("Deadline", <FlagIcon className="size-4" />)}
			>
				<DeadlinePicker
					value={null}
					today={ctx.today}
					weekStart={user.settings.weekStart ?? 1}
					onChange={(deadline) => {
						actions.setDeadline(ids, deadline);
						done();
					}}
				/>
			</Popover>
			{button("Complete", <CheckIcon className="size-4" />, () =>
				actions.toggleComplete(ids),
			)}
			{button("Delete", <TrashIcon className="size-4 text-overdue" />, () => {
				void actions.remove(ids).then((removed) => {
					if (removed) clear();
				});
			})}
			<span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />
			{button("Clear selection", <CrossIcon className="size-3.5" />, clear)}
		</div>
	);
}
