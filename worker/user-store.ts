import { DurableObject } from "cloudflare:workers";
import { ulid } from "ulid";
import { z } from "zod";
import { nextLocalMidnight } from "../shared/dates";
import {
	type EntityRow,
	MAX_OPS_PER_PUSH,
	type OpError,
	opSchema,
	type PullResult,
	type PushResult,
	type ServerMessage,
	timeZoneSchema,
} from "../shared/schema";
import {
	EXPORT_FORMAT,
	EXPORT_VERSION,
	type ExportFile,
	IMPORT_ORDER,
	type ImportFile,
	planImport,
} from "../shared/transfer";
import { Applier, OpRejected, type UserContext } from "./apply";
import { sendPush } from "./push";
import { migrate, Store } from "./store";

/** How many recent op ids to remember for deduplicating retried pushes. */
const APPLIED_OPS_TO_KEEP = 10_000;

/** Trash items are purged after this long (SPEC §9). */
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Reminders missed by more than this aren't sent at all. */
const STALE_REMINDER_MS = 60 * 60 * 1000;

/** Ops per transaction (and per broadcast) when importing. */
const IMPORT_BATCH = 200;

/** Rows per `changes` message when catching a socket up after `hello`. */
export const CATCH_UP_PAGE_SIZE = 500;

// Ops are validated one by one in push(), so a bad op doesn't sink its batch.
const socketMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("hello"),
		lastRev: z.number().int().nonnegative(),
		tz: timeZoneSchema,
	}),
	z.object({
		type: z.literal("push"),
		ops: z.array(z.unknown()).min(1).max(MAX_OPS_PER_PUSH),
	}),
]);

/**
 * One instance per user, holding all of that user's task data in its SQLite
 * storage. It is the single writer and the source of truth for sync, and it
 * holds the user's WebSockets (hibernating while idle).
 */
export class UserStore extends DurableObject<Env> {
	private readonly store: Store;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.storage.transactionSync(() => migrate(ctx.storage.sql));
		this.store = new Store(ctx.storage.sql);
		// Answered by the runtime without waking the object.
		ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair("ping", "pong"),
		);
	}

	/** Applies a batch of ops in one transaction, then broadcasts the changes to every socket. */
	push(rawOps: unknown[], user: UserContext): PushResult {
		const fromRev = this.store.rev;
		const result = this.ctx.storage.transactionSync(() => {
			const applier = new Applier(this.store, user);
			const acked: string[] = [];
			const errors: OpError[] = [];

			for (const raw of rawOps) {
				const parsed = opSchema.safeParse(raw);
				if (!parsed.success) {
					const opId = (raw as { opId?: unknown } | null)?.opId;
					errors.push({
						opId: typeof opId === "string" ? opId : null,
						code: "invalid_op",
						message: parsed.error.issues[0]?.message ?? "Invalid op",
					});
					continue;
				}
				const op = parsed.data;
				if (this.store.hasAppliedOp(op.opId)) {
					acked.push(op.opId);
					continue;
				}
				try {
					applier.apply(op);
					this.store.recordAppliedOp(op.opId);
					acked.push(op.opId);
				} catch (err) {
					if (!(err instanceof OpRejected)) throw err;
					const current = this.store.get(op.entity, op.entityId);
					errors.push({
						opId: op.opId,
						code: err.code,
						message: err.message,
						issues: err.issues,
						current: current
							? ({ entity: op.entity, row: current } as EntityRow)
							: null,
					});
				}
			}

			applier.materializeDue();
			this.store.trimAppliedOps(APPLIED_OPS_TO_KEEP);
			return {
				rev: this.store.rev,
				acked,
				errors,
				rows: [...applier.changed.values()],
				purged: [...applier.purged.values()],
			};
		});

		if (result.rows.length > 0 || result.purged.length > 0) {
			this.broadcast({
				type: "changes",
				rows: result.rows,
				purged: result.purged,
				fromRev,
				rev: result.rev,
				more: false,
				opIds: result.acked,
			});
		}
		this.rememberUser(user);
		this.scheduleAlarm();
		return result;
	}

	/** Every row the user has (Trash included), for a JSON export. */
	exportData(): ExportFile {
		const data = Object.fromEntries(
			IMPORT_ORDER.map((entity) => [entity, this.store.where(entity, "1 = 1")]),
		) as ExportFile["data"];
		return {
			format: EXPORT_FORMAT,
			version: EXPORT_VERSION,
			exportedAt: new Date().toISOString(),
			data,
		};
	}

	/** Adds copies of an export's rows (see planImport). */
	importData(
		file: ImportFile,
		user: UserContext,
	): { imported: number; skipped: number; errors: OpError[] } {
		const existingTags = new Map(
			this.store
				.where("tag", "deleted_at IS NULL AND parent_id IS NULL")
				.map((tag) => [tag.title.trim().toLowerCase(), tag.id]),
		);
		const { ops, skipped } = planImport(file, existingTags, ulid, Date.now());
		let imported = 0;
		const errors: OpError[] = [];
		// In batches, so each broadcast stays well under the WebSocket message limit.
		for (let i = 0; i < ops.length; i += IMPORT_BATCH) {
			const result = this.push(ops.slice(i, i + IMPORT_BATCH), user);
			imported += result.acked.length;
			errors.push(...result.errors);
		}
		return { imported, skipped, errors };
	}

	/** The user's time zone or week start changed (PATCH /me). */
	updateUser(user: UserContext): void {
		for (const ws of this.ctx.getWebSockets()) {
			const current = ws.deserializeAttachment() as UserContext;
			ws.serializeAttachment({ ...current, ...user });
		}
		this.rememberUser(user);
		this.scheduleAlarm();
	}

	// -------------------------------------------------------------------------
	// Alarms (SPEC §9)

	/** The user's id, time zone and week start, for work done outside a request (alarms). */
	private rememberUser(user: UserContext) {
		if (!user.userId) return;
		this.store.setMeta("user", JSON.stringify(user));
	}

	private storedUser(): UserContext | null {
		const value = this.store.getMeta("user");
		return value ? (JSON.parse(value) as UserContext) : null;
	}

	/** Earliest reminder that hasn't been pushed yet (open, live, non-template to-dos). */
	private nextReminderAt(): number | null {
		const row = this.ctx.storage.sql
			.exec<{ at: number | null }>(
				`SELECT MIN(reminder_at) AS at FROM todos t
				 WHERE reminder_at IS NOT NULL AND deleted_at IS NULL AND status = 'open' AND repeat IS NULL
				   AND NOT EXISTS (SELECT 1 FROM reminders_sent s WHERE s.todo_id = t.id AND s.reminder_at = t.reminder_at)`,
			)
			.toArray()[0];
		return row?.at ?? null;
	}

	/** One alarm: the earlier of the next local midnight and the next unsent reminder. */
	private scheduleAlarm() {
		const user = this.storedUser();
		if (!user) return;
		const now = Date.now();
		const reminder = this.nextReminderAt();
		const at = Math.min(
			nextLocalMidnight(user.tz, now),
			reminder ?? Number.POSITIVE_INFINITY,
		);
		void this.ctx.storage.setAlarm(Math.max(at, now + 1000));
	}

	override async alarm(): Promise<void> {
		const user = this.storedUser();
		if (!user) return;
		const now = Date.now();

		// Daily housekeeping is idempotent, so it simply runs on every wake.
		const fromRev = this.store.rev;
		const changes = this.ctx.storage.transactionSync(() => {
			const applier = new Applier(this.store, user);
			applier.materializeDue();
			applier.purgeTrashOlderThan(now - TRASH_RETENTION_MS);
			this.store.trimAppliedOps(APPLIED_OPS_TO_KEEP);
			return {
				rows: [...applier.changed.values()],
				purged: [...applier.purged.values()],
			};
		});
		if (changes.rows.length > 0 || changes.purged.length > 0) {
			this.broadcast({
				type: "changes",
				...changes,
				fromRev,
				rev: this.store.rev,
				more: false,
			});
		}

		await this.sendDueReminders(user, now);
		this.scheduleAlarm();
	}

	private async sendDueReminders(user: UserContext, now: number) {
		const due = this.ctx.storage.sql
			.exec<{
				id: string;
				title: string;
				reminder_at: number;
				project_id: string | null;
				area_id: string | null;
			}>(
				`SELECT id, title, reminder_at, project_id, area_id FROM todos t
				 WHERE reminder_at IS NOT NULL AND reminder_at <= ? AND deleted_at IS NULL AND status = 'open' AND repeat IS NULL
				   AND NOT EXISTS (SELECT 1 FROM reminders_sent s WHERE s.todo_id = t.id AND s.reminder_at = t.reminder_at)`,
				now,
			)
			.toArray();
		if (due.length === 0) return;

		// Reminders missed by more than an hour (e.g. set in the past) are dropped rather than sent late.
		const fresh = due.filter((t) => t.reminder_at >= now - STALE_REMINDER_MS);
		const container = (t: (typeof due)[number]) => {
			const project = t.project_id
				? this.store.get("project", t.project_id)
				: null;
			const area = t.area_id ? this.store.get("area", t.area_id) : null;
			return project?.title || area?.title || "";
		};
		await sendPush(
			this.env,
			user.userId,
			fresh.map((t) => ({
				title: t.title || "New To-Do",
				body: container(t) || "Reminder",
				url: t.project_id ? `/project/${t.project_id}` : "/today",
				tag: t.id,
			})),
		);
		for (const t of due) {
			this.ctx.storage.sql.exec(
				"INSERT OR REPLACE INTO reminders_sent (todo_id, reminder_at) VALUES (?, ?)",
				t.id,
				t.reminder_at,
			);
		}
	}

	/** Changes after `since`, oldest first. `rev` is where the next pull should start. */
	pull(since: number, limit: number): PullResult {
		const { entries, more } = this.store.changesSince(since, limit);
		const result: PullResult = {
			rows: [],
			purged: [],
			rev: more ? (entries.at(-1)?.rev ?? since) : this.store.rev,
			more,
		};
		for (const { change } of entries) {
			if (change.kind === "row") result.rows.push(change.row);
			else result.purged.push({ entity: change.entity, id: change.id });
		}
		return result;
	}

	// -------------------------------------------------------------------------
	// WebSockets (SPEC §7.4)

	/** Accepts a WebSocket upgrade forwarded by the Worker, which has already authenticated it. */
	override async fetch(request: Request): Promise<Response> {
		const user = JSON.parse(
			request.headers.get("x-user-context") ?? "null",
		) as UserContext | null;
		if (!user) return new Response("Missing user context", { status: 400 });
		const { 0: client, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment(user);
		return new Response(null, { status: 101, webSocket: client });
	}

	override async webSocketMessage(
		ws: WebSocket,
		message: string | ArrayBuffer,
	): Promise<void> {
		let data: unknown;
		try {
			data = JSON.parse(
				typeof message === "string"
					? message
					: new TextDecoder().decode(message),
			);
		} catch {
			return send(ws, {
				type: "error",
				opId: null,
				code: "invalid_message",
				message: "Not JSON",
			});
		}
		const parsed = socketMessageSchema.safeParse(data);
		if (!parsed.success) {
			return send(ws, {
				type: "error",
				opId: null,
				code: "invalid_message",
				message: parsed.error.issues[0]?.message ?? "Invalid message",
			});
		}

		const user = ws.deserializeAttachment() as UserContext;
		if (parsed.data.type === "hello") {
			const updated = { ...user, tz: parsed.data.tz };
			ws.serializeAttachment(updated);
			// A new time zone moves "midnight".
			this.rememberUser(updated);
			this.scheduleAlarm();
			this.catchUp(ws, parsed.data.lastRev);
			return;
		}
		// The push broadcasts its changes (to this socket too); errors and the ack go to the sender only.
		const result = this.push(parsed.data.ops, user);
		for (const error of result.errors) send(ws, { type: "error", ...error });
		send(ws, { type: "ack", opIds: result.acked, rev: result.rev });
	}

	override async webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
	): Promise<void> {
		try {
			ws.close(code === 1005 ? 1000 : code, reason);
		} catch {
			// Already closed.
		}
	}

	/** Sends everything after `lastRev` in pages. A client ahead of the server (data reset) gets everything. */
	private catchUp(ws: WebSocket, lastRev: number) {
		let since = lastRev > this.store.rev ? 0 : lastRev;
		for (;;) {
			const page = this.pull(since, CATCH_UP_PAGE_SIZE);
			send(ws, { type: "changes", ...page, fromRev: since });
			if (!page.more) return;
			since = page.rev;
		}
	}

	private broadcast(message: ServerMessage) {
		const text = JSON.stringify(message);
		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(text);
			} catch {
				// The socket is closing; it will catch up on reconnect.
			}
		}
	}
}

function send(ws: WebSocket, message: ServerMessage) {
	try {
		ws.send(JSON.stringify(message));
	} catch {
		// The socket is closing; it will catch up on reconnect.
	}
}
