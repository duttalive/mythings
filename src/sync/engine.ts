// Local-first sync (SPEC §7.2). Mutations apply to IndexedDB immediately and
// queue an op in the outbox; sync pushes the outbox, then pulls everything
// the server has that we haven't seen. Server rows are rebased under any
// still-pending local ops, so local edits are never clobbered.
//
// With a realtime channel open, ops are pushed over the WebSocket and the
// server streams every change as it happens, so there is no polling or pull.

import { ulid } from "ulid";
import { buildRow, type Fields } from "../../shared/rows";
import {
	type ApiErrorBody,
	type EntityName,
	type EntityRowMap,
	entities,
	type Op,
	type OpError,
	type PushResult,
	type ServerMessage,
} from "../../shared/schema";
import type { LocalDb } from "../db/local";
import type { Channel } from "./channel";
import { applyServerChanges, flushOutbox, syncLockName } from "./outbox";
import { NetworkError, type Transport, UnauthorizedError } from "./transport";

export type Mutation =
	| {
			type: "upsert";
			entity: EntityName;
			id: string;
			patch: Record<string, unknown>;
	  }
	| { type: "delete" | "purge"; entity: EntityName; id: string };

export type SyncStatus = {
	state: "idle" | "syncing" | "offline" | "error";
	/** Ops waiting to reach the server. */
	pending: number;
	lastSyncedAt: number | null;
	error: string | null;
	/** The realtime channel is open: changes arrive as they happen. */
	live: boolean;
	/** This device has caught up with the server at least once, so its lists are complete. */
	hasSnapshot: boolean;
};

/** A mutation that would produce an invalid row; nothing was written. */
export class InvalidMutation extends Error {
	constructor(
		message: string,
		readonly issues?: ApiErrorBody["issues"],
	) {
		super(message);
	}
}

type Options = {
	onUnauthorized?: () => void;
	/** Ops the server rejected (already rolled back locally). */
	onRejected?: (errors: OpError[]) => void;
	now?: () => number;
	pullLimit?: number;
	pollIntervalMs?: number;
	/** Name of the Web Lock that serializes syncs across tabs. */
	lockName?: string;
	/** Realtime connection; without one the engine polls over HTTP. */
	channel?: Channel;
	/** The user's time zone, sent to the server in `hello`. */
	tz?: string;
	/** How long to wait for a push ack over the channel before giving up. */
	socketTimeoutMs?: number;
};

type AckWaiter = {
	errors: OpError[];
	resolve: (result: PushResult) => void;
	reject: (err: Error) => void;
};

type AnyRow = EntityRowMap[EntityName];
/** How many changes undo remembers (SPEC §10.6). */
const UNDO_LIMIT = 50;
const MAX_BACKOFF_MS = 60_000;

export class SyncEngine {
	#status: SyncStatus = {
		state: "idle",
		pending: 0,
		lastSyncedAt: null,
		error: null,
		live: false,
		hasSnapshot: false,
	};
	readonly #listeners = new Set<() => void>();
	#running: Promise<void> | null = null;
	#again = false;
	#stopped = true;
	#backoffMs = 0;
	#retryTimer: ReturnType<typeof setTimeout> | undefined;
	#pollTimer: ReturnType<typeof setInterval> | undefined;
	#ackWaiter: AckWaiter | null = null;
	/** Incoming `changes` are applied strictly in arrival order. */
	#incoming: Promise<void> = Promise.resolve();
	#undo: Mutation[][] = [];
	#redo: Mutation[][] = [];
	readonly #now: () => number;
	#tz: string;

	constructor(
		private readonly db: LocalDb,
		private readonly transport: Transport,
		private readonly options: Options = {},
	) {
		this.#now = options.now ?? Date.now;
		this.#tz = options.tz ?? "UTC";
	}

	// -------------------------------------------------------------------------
	// Status (shaped for useSyncExternalStore)

	subscribe = (listener: () => void): (() => void) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};

	getStatus = (): SyncStatus => this.#status;

	private setStatus(patch: Partial<SyncStatus>) {
		this.#status = { ...this.#status, ...patch };
		for (const listener of this.#listeners) listener();
	}

	private async refreshPending() {
		this.setStatus({ pending: await this.db.outbox.count() });
	}

	// -------------------------------------------------------------------------
	// Lifecycle

	start(): void {
		this.#stopped = false;
		if (typeof window !== "undefined") {
			window.addEventListener("online", this.onOnline);
			window.addEventListener("offline", this.onOffline);
			document.addEventListener("visibilitychange", this.onVisibilityChange);
		}
		this.#pollTimer = setInterval(() => {
			if (this.#status.live) return;
			if (
				typeof document === "undefined" ||
				document.visibilityState === "visible"
			)
				this.requestSync();
		}, this.options.pollIntervalMs ?? 30_000);
		this.options.channel?.start({
			onOpen: this.onChannelOpen,
			onMessage: this.onChannelMessage,
			onClose: this.onChannelClose,
		});
		void this.refreshPending();
		void this.db.meta.get("lastRev").then((row) => {
			if (row && !this.#status.hasSnapshot)
				this.setStatus({ hasSnapshot: true });
		});
		this.requestSync();
	}

	stop(): void {
		this.#stopped = true;
		clearTimeout(this.#retryTimer);
		clearInterval(this.#pollTimer);
		this.options.channel?.stop();
		this.#ackWaiter?.reject(new NetworkError("Stopped"));
		this.#ackWaiter = null;
		this.setStatus({ live: false });
		if (typeof window !== "undefined") {
			window.removeEventListener("online", this.onOnline);
			window.removeEventListener("offline", this.onOffline);
			document.removeEventListener("visibilitychange", this.onVisibilityChange);
		}
	}

	private onOnline = () => {
		this.options.channel?.reconnectNow();
		this.requestSync();
	};

	// The browser knows before a request fails; say so straight away.
	private onOffline = () => {
		this.setStatus({ state: "offline", live: false });
	};

	private onVisibilityChange = () => {
		if (document.visibilityState === "visible") this.requestSync();
	};

	/** The user picked another time zone: tell the server (it's sent on every `hello`). */
	setTimeZone(tz: string): void {
		if (tz === this.#tz) return;
		this.#tz = tz;
		void this.sendHello();
	}

	/** Starts a sync soon, unless the engine is stopped. */
	requestSync = (): void => {
		if (this.#stopped) return;
		clearTimeout(this.#retryTimer);
		void this.sync();
	};

	// -------------------------------------------------------------------------
	// Mutations

	/** Applies mutations locally in one transaction and queues them for the server. */
	async apply(
		mutations: Mutation[],
		options: { undoable?: boolean } = {},
	): Promise<void> {
		const inverse = await this.applyRecording(mutations);
		if (options.undoable !== false && inverse.length > 0) {
			this.pushHistory(this.#undo, inverse);
			this.#redo = [];
		}
	}

	/** Reverts the last undoable change. Returns false if there was nothing to undo. */
	async undo(): Promise<boolean> {
		const entry = await this.popRunnable(this.#undo);
		if (!entry) return false;
		const inverse = await this.applyRecording(entry);
		if (inverse.length > 0) this.pushHistory(this.#redo, inverse);
		return true;
	}

	/** Re-applies the last undone change. Returns false if there was nothing to redo. */
	async redo(): Promise<boolean> {
		const entry = await this.popRunnable(this.#redo);
		if (!entry) return false;
		const inverse = await this.applyRecording(entry);
		if (inverse.length > 0) this.pushHistory(this.#undo, inverse);
		return true;
	}

	/**
	 * The most recent entry that still applies. Rows can disappear in the
	 * meantime (a blank new to-do is purged when closed, another device purges
	 * something); their mutations are dropped, and entries left empty skipped.
	 */
	private async popRunnable(stack: Mutation[][]): Promise<Mutation[] | null> {
		for (let entry = stack.pop(); entry; entry = stack.pop()) {
			const exists = await Promise.all(
				entry.map((m) => this.db.rows(m.entity).get(m.id)),
			);
			const runnable = entry.filter((_, i) => exists[i] !== undefined);
			if (runnable.length > 0) return runnable;
		}
		return null;
	}

	private pushHistory(stack: Mutation[][], entry: Mutation[]) {
		stack.push(entry);
		if (stack.length > UNDO_LIMIT) stack.shift();
	}

	/**
	 * Applies mutations locally, queues them for the server, and returns the
	 * mutations that would undo them (SPEC §10.6): for each row, the previous
	 * values of whatever changed. A created row is undone by moving it to Trash;
	 * purges can't be undone and aren't recorded.
	 */
	private async applyRecording(mutations: Mutation[]): Promise<Mutation[]> {
		const now = this.#now();
		const inverse: Mutation[] = [];
		await this.db.transaction("rw", this.db.allTables, async () => {
			for (const mutation of mutations) {
				const table = this.db.rows(mutation.entity);
				const before = (await table.get(mutation.id)) as Fields | undefined;
				await this.applyLocal(mutation, now);
				await this.db.outbox.add({
					entity: mutation.entity,
					entityId: mutation.id,
					op: toOp(mutation, now),
				});
				if (mutation.type === "purge") continue;
				const after = (await table.get(mutation.id)) as Fields | undefined;
				if (!before) {
					if (after)
						inverse.unshift({
							type: "delete",
							entity: mutation.entity,
							id: mutation.id,
						});
					continue;
				}
				if (!after) continue;
				const patch: Record<string, unknown> = {};
				for (const field of Object.keys(after)) {
					if (field === "rev" || field === "updatedAt") continue;
					if (JSON.stringify(before[field]) !== JSON.stringify(after[field]))
						patch[field] = before[field];
				}
				if (Object.keys(patch).length > 0) {
					inverse.unshift({
						type: "upsert",
						entity: mutation.entity,
						id: mutation.id,
						patch,
					});
				}
			}
		});
		await this.refreshPending();
		this.requestSync();
		return inverse;
	}

	/** Creates a row and returns its id. Unset fields take the shared defaults (shared/rows.ts). */
	async create<E extends EntityName>(
		entity: E,
		fields: Partial<EntityRowMap[E]>,
	): Promise<string> {
		const id = ulid();
		// Only the fields the caller set: both sides fill in the same shared defaults,
		// and normalization treats fields present in a patch as deliberate.
		const patch = { createdAt: this.#now(), ...fields };
		await this.apply([{ type: "upsert", entity, id, patch }]);
		return id;
	}

	update<E extends EntityName>(
		entity: E,
		id: string,
		patch: Partial<EntityRowMap[E]>,
	): Promise<void> {
		return this.apply([{ type: "upsert", entity, id, patch }]);
	}

	/** Moves to Trash, along with everything inside it. */
	remove(entity: EntityName, id: string): Promise<void> {
		return this.apply([{ type: "delete", entity, id }]);
	}

	/** Brings back from Trash, along with what was deleted with it. */
	restore(entity: EntityName, id: string): Promise<void> {
		return this.apply([
			{ type: "upsert", entity, id, patch: { deletedAt: null } },
		]);
	}

	/** Deletes permanently. */
	purge(entity: EntityName, id: string): Promise<void> {
		return this.apply([{ type: "purge", entity, id }]);
	}

	private async applyLocal(mutation: Mutation, now: number) {
		const { entity, id } = mutation;
		const table = this.db.rows(entity);
		const existing = (await table.get(id)) ?? null;

		if (mutation.type !== "upsert") {
			if (!existing) throw new InvalidMutation(`${entity} ${id} not found`);
			if (mutation.type === "purge") await this.purgeTree(entity, existing);
			else if (existing.deletedAt === null)
				await this.softDelete(entity, existing, now);
			return;
		}

		const headings = await this.headingLookup([
			mutation.patch.headingId,
			(existing as Fields | null)?.headingId,
		]);
		const merged = buildRow(
			entity,
			id,
			existing as Fields | null,
			mutation.patch,
			now,
			now,
			headings,
		);
		const result = entities[entity].row.safeParse(merged);
		if (!result.success) {
			throw new InvalidMutation(
				result.error.issues[0]?.message ?? "Invalid change",
				result.error.issues.map((i) => ({
					path: i.path.filter(
						(p): p is string | number => typeof p !== "symbol",
					),
					message: i.message,
				})),
			);
		}
		const row = result.data as AnyRow;
		await table.put(row);

		if (!existing) return;
		if (existing.deletedAt !== null && row.deletedAt === null) {
			await this.restoreChildren(entity, id, existing.deletedAt);
		} else if (existing.deletedAt === null && row.deletedAt !== null) {
			await this.cascadeDelete(entity, id, row.deletedAt);
		}
		if (
			entity === "heading" &&
			(existing as Fields).projectId !== (row as Fields).projectId
		) {
			const todos = await this.db.todos.where("headingId").equals(id).toArray();
			await this.db.todos.bulkPut(
				todos.map((t) => ({
					...t,
					projectId: (row as Fields).projectId as string,
				})),
			);
		}
	}

	private async headingLookup(
		ids: unknown[],
	): Promise<(id: string) => string | undefined> {
		const wanted = ids.filter((id): id is string => typeof id === "string");
		const headings = await this.db.headings.bulkGet(wanted);
		const map = new Map(
			headings.filter((h) => h !== undefined).map((h) => [h.id, h.projectId]),
		);
		return (id) => map.get(id);
	}

	// Local mirrors of the server's cascades (worker/apply.ts), so Trash and the
	// lists are right while offline. The server's result replaces them on sync.

	private async children(
		entity: EntityName,
		id: string,
		forPurge = false,
	): Promise<[EntityName, AnyRow][]> {
		const tagged = <E extends EntityName>(child: E, rows: EntityRowMap[E][]) =>
			rows.map((row) => [child, row] as [EntityName, AnyRow]);
		switch (entity) {
			case "area":
				return [
					...tagged(
						"project",
						await this.db.projects.where("areaId").equals(id).toArray(),
					),
					...tagged(
						"todo",
						await this.db.todos.where("areaId").equals(id).toArray(),
					),
				];
			case "project":
				return [
					...tagged(
						"heading",
						await this.db.headings.where("projectId").equals(id).toArray(),
					),
					...tagged(
						"todo",
						await this.db.todos.where("projectId").equals(id).toArray(),
					),
				];
			case "heading":
				return tagged(
					"todo",
					await this.db.todos.where("headingId").equals(id).toArray(),
				);
			case "tag":
				return tagged(
					"tag",
					await this.db.tags.where("parentId").equals(id).toArray(),
				);
			case "todo":
				return forPurge
					? tagged(
							"checklist",
							await this.db.checklist.where("todoId").equals(id).toArray(),
						)
					: [];
			case "checklist":
				return [];
		}
	}

	private async softDelete(entity: EntityName, row: AnyRow, at: number) {
		await this.db.rows(entity).put({ ...row, deletedAt: at });
		await this.cascadeDelete(entity, row.id, at);
	}

	private async cascadeDelete(entity: EntityName, id: string, at: number) {
		for (const [childEntity, child] of await this.children(entity, id)) {
			const current = await this.db.rows(childEntity).get(child.id);
			if (current && current.deletedAt === null)
				await this.softDelete(childEntity, current, at);
		}
	}

	private async restoreChildren(
		entity: EntityName,
		id: string,
		deletedAt: number,
	) {
		for (const [childEntity, child] of await this.children(entity, id)) {
			const current = await this.db.rows(childEntity).get(child.id);
			if (current && current.deletedAt === deletedAt) {
				await this.db.rows(childEntity).put({ ...current, deletedAt: null });
				await this.restoreChildren(childEntity, child.id, deletedAt);
			}
		}
	}

	private async purgeTree(entity: EntityName, row: AnyRow) {
		for (const [childEntity, child] of await this.children(
			entity,
			row.id,
			true,
		)) {
			await this.purgeTree(childEntity, child);
		}
		await this.db.rows(entity).delete(row.id);
		if (entity === "tag") {
			for (const holder of ["area", "project", "todo"] as const) {
				const table = this.db.rows(holder);
				const tagged = await table
					.filter((item) => item.tagIds.includes(row.id))
					.toArray();
				await table.bulkPut(
					tagged.map(
						(item) =>
							({
								...item,
								tagIds: item.tagIds.filter((t) => t !== row.id),
							}) as never,
					),
				);
			}
		}
	}

	// -------------------------------------------------------------------------
	// Sync

	/** Pushes the outbox, then pulls. Concurrent calls share one run (and trigger one more after it). */
	sync(): Promise<void> {
		if (this.#running) {
			this.#again = true;
			return this.#running;
		}
		this.setStatus({ state: "syncing" });
		this.#running = (async () => {
			try {
				do {
					this.#again = false;
					await this.withLock(async () => {
						await this.flush();
						// While live, the server streams changes; no need to pull.
						if (!this.#status.live) await this.pull();
					});
				} while (this.#again);
				this.#backoffMs = 0;
				this.setStatus({
					state: "idle",
					lastSyncedAt: this.#now(),
					error: null,
				});
			} catch (err) {
				if (err instanceof UnauthorizedError) {
					this.setStatus({ state: "error", error: "unauthorized" });
					this.options.onUnauthorized?.();
					return;
				}
				this.setStatus({
					state: err instanceof NetworkError ? "offline" : "error",
					error: err instanceof Error ? err.message : String(err),
				});
				this.scheduleRetry();
			} finally {
				this.#running = null;
				await this.refreshPending();
			}
		})();
		return this.#running;
	}

	private scheduleRetry() {
		if (this.#stopped) return;
		this.#backoffMs = Math.min(
			Math.max(1000, this.#backoffMs * 2),
			MAX_BACKOFF_MS,
		);
		this.#retryTimer = setTimeout(this.requestSync, this.#backoffMs);
	}

	private async withLock(fn: () => Promise<void>): Promise<void> {
		const locks =
			typeof navigator !== "undefined" ? navigator.locks : undefined;
		if (!locks) return fn();
		await locks.request(this.options.lockName ?? syncLockName(this.db), fn);
	}

	/** Sends queued ops to the server in batches until the outbox is empty. */
	async flush(): Promise<void> {
		const errors = await flushOutbox(this.db, (ops) =>
			this.#status.live ? this.pushOverChannel(ops) : this.transport.push(ops),
		);
		if (errors.length > 0) this.options.onRejected?.(errors);
	}

	/** Fetches everything after the last rev we've seen. */
	async pull(): Promise<void> {
		let since = await this.readLastRev();
		for (;;) {
			const result = await this.transport.pull(
				since,
				this.options.pullLimit ?? 500,
			);
			await this.db.transaction("rw", this.db.allTables, async () => {
				await applyServerChanges(this.db, result.rows, result.purged);
				const lastRev = await this.readLastRev();
				await this.db.meta.put({
					key: "lastRev",
					value: Math.max(lastRev, result.rev),
				});
			});
			since = result.rev;
			if (!result.more) {
				if (!this.#status.hasSnapshot) this.setStatus({ hasSnapshot: true });
				return;
			}
		}
	}

	private async readLastRev(): Promise<number> {
		return (
			((await this.db.meta.get("lastRev"))?.value as number | undefined) ?? 0
		);
	}

	// -------------------------------------------------------------------------
	// Realtime channel

	private onChannelOpen = () => {
		this.setStatus({ live: true });
		void this.sendHello();
		this.requestSync();
	};

	private onChannelClose = () => {
		this.setStatus({ live: false });
		this.#ackWaiter?.reject(new NetworkError("Connection closed"));
		this.#ackWaiter = null;
		// Catch up over HTTP until the channel is back. If a sync is failing because
		// of the drop, go again as soon as it ends rather than after its backoff.
		void (this.#running ?? Promise.resolve()).finally(() => this.requestSync());
	};

	private onChannelMessage = (message: ServerMessage) => {
		if (message.type === "changes") {
			this.#incoming = this.#incoming
				.then(() => this.applyStreamedChanges(message))
				.catch((err) => console.error("Failed to apply changes", err));
		} else if (message.type === "error") {
			if (this.#ackWaiter) this.#ackWaiter.errors.push(message);
			else console.warn("Server error", message);
		} else {
			// Pushes are one at a time, so the next ack belongs to the push in flight.
			const waiter = this.#ackWaiter;
			this.#ackWaiter = null;
			waiter?.resolve({
				acked: message.opIds,
				errors: waiter.errors,
				rows: [],
				purged: [],
				rev: message.rev,
			});
		}
	};

	private async sendHello() {
		const lastRev = await this.readLastRev();
		const channel = this.options.channel;
		if (channel?.open) channel.send({ type: "hello", lastRev, tz: this.#tz });
	}

	/** Applies streamed rows; advances lastRev only if there's no gap since what we've seen. */
	private async applyStreamedChanges(
		message: Extract<ServerMessage, { type: "changes" }>,
	) {
		let gap = false;
		await this.db.transaction("rw", this.db.allTables, async () => {
			// These ops are in the rows already; replaying them could undo the server's changes.
			if (message.opIds?.length) {
				const applied = new Set(message.opIds);
				const done = await this.db.outbox
					.filter((entry) => applied.has(entry.op.opId))
					.primaryKeys();
				await this.db.outbox.bulkDelete(done);
			}
			await applyServerChanges(this.db, message.rows, message.purged);
			const lastRev = await this.readLastRev();
			if (message.fromRev > lastRev) gap = true;
			// fromRev 0 is a full resend (e.g. the server's data was reset), so take its rev as-is.
			else if (message.rev > lastRev || message.fromRev === 0) {
				await this.db.meta.put({ key: "lastRev", value: message.rev });
			}
		});
		if (gap) await this.sendHello();
		await this.refreshPending();
		this.setStatus({
			lastSyncedAt: this.#now(),
			hasSnapshot: this.#status.hasSnapshot || (!gap && !message.more),
		});
	}

	/** Sends a batch over the channel and resolves with the ack (rows arrive as `changes`). */
	private pushOverChannel(ops: Op[]): Promise<PushResult> {
		const channel = this.options.channel;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#ackWaiter = null;
				reject(new NetworkError("No ack from server"));
			}, this.options.socketTimeoutMs ?? 15_000);
			this.#ackWaiter = {
				errors: [],
				resolve: (result) => {
					clearTimeout(timer);
					resolve(result);
				},
				reject: (err) => {
					clearTimeout(timer);
					reject(err);
				},
			};
			try {
				if (!channel) throw new Error("No channel");
				channel.send({ type: "push", ops });
			} catch {
				this.#ackWaiter?.reject(new NetworkError("Connection closed"));
				this.#ackWaiter = null;
			}
		});
	}

	/**
	 * Writes server rows locally, replaying any still-pending local ops on top
	 * so unsent edits survive. Rows older than the local copy are ignored.
	 */
}

function toOp(mutation: Mutation, now: number): Op {
	const base = {
		opId: ulid(),
		entity: mutation.entity,
		entityId: mutation.id,
		clientTs: now,
	};
	return (
		mutation.type === "upsert"
			? { ...base, kind: "upsert", patch: mutation.patch }
			: { ...base, kind: mutation.type }
	) as Op;
}
