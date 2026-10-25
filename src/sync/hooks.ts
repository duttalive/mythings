import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { nextLocalMidnight, todayIn } from "../../shared/dates";
import type { ChecklistItem } from "../../shared/schema";
import { bySortKey, type ViewContext, type ViewData } from "../../shared/views";
import { useAuth } from "../auth/AuthGate";
import type { SyncEngine, SyncStatus } from "./engine";
import { useSyncContext } from "./SyncProvider";

/** Mutation API: create, update, remove (to Trash), restore, purge, and batched apply. */
export function useOps(): Pick<
	SyncEngine,
	| "create"
	| "update"
	| "remove"
	| "restore"
	| "purge"
	| "apply"
	| "undo"
	| "redo"
> {
	const { engine } = useSyncContext();
	return useMemo(
		() => ({
			create: engine.create.bind(engine),
			update: engine.update.bind(engine),
			remove: engine.remove.bind(engine),
			restore: engine.restore.bind(engine),
			purge: engine.purge.bind(engine),
			apply: engine.apply.bind(engine),
			undo: engine.undo.bind(engine),
			redo: engine.redo.bind(engine),
		}),
		[engine],
	);
}

export function useSyncStatus(): SyncStatus {
	const { engine } = useSyncContext();
	return useSyncExternalStore(engine.subscribe, engine.getStatus);
}

/** All entities the list views need, live from IndexedDB. Undefined while loading. */
export function useViewData(): ViewData | undefined {
	const { db } = useSyncContext();
	return useLiveQuery(async () => {
		const [areas, projects, headings, todos, tags] = await Promise.all([
			db.areas.toArray(),
			db.projects.toArray(),
			db.headings.toArray(),
			db.todos.toArray(),
			db.tags.toArray(),
		]);
		return { areas, projects, headings, todos, tags };
	}, [db]);
}

/** The user's local date, updated at midnight. */
export function useToday(tz: string): string {
	const [today, setToday] = useState(() => todayIn(tz));
	useEffect(() => {
		setToday(todayIn(tz));
		let timer: ReturnType<typeof setTimeout>;
		const schedule = () => {
			timer = setTimeout(
				() => {
					setToday(todayIn(tz));
					schedule();
				},
				nextLocalMidnight(tz) - Date.now() + 50,
			);
		};
		schedule();
		return () => clearTimeout(timer);
	}, [tz]);
	return today;
}

export function useViewContext(): ViewContext {
	const { user } = useAuth();
	const today = useToday(user.tz);
	const logbookTiming = user.settings.logbookTiming ?? "immediately";
	return useMemo(
		() => ({ today, tz: user.tz, logbookTiming }),
		[today, user.tz, logbookTiming],
	);
}

export type ChecklistProgress = Map<string, { done: number; total: number }>;

/** Checklist done/total per to-do, live from IndexedDB. Undefined while loading. */
export function useChecklistProgress(): ChecklistProgress | undefined {
	const { db } = useSyncContext();
	return useLiveQuery(async () => {
		const progress: ChecklistProgress = new Map();
		await db.checklist.each((item) => {
			if (item.deletedAt !== null) return;
			const entry = progress.get(item.todoId) ?? { done: 0, total: 0 };
			entry.total++;
			if (item.done) entry.done++;
			progress.set(item.todoId, entry);
		});
		return progress;
	}, [db]);
}

/** A to-do's live checklist items, in order. Undefined while loading. */
export function useChecklist(todoId: string): ChecklistItem[] | undefined {
	const { db } = useSyncContext();
	return useLiveQuery(
		async () =>
			(await db.checklist.where("todoId").equals(todoId).toArray())
				.filter((item) => item.deletedAt === null)
				.sort(bySortKey),
		[db, todoId],
	);
}
