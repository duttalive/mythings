// Pushing the outbox and adopting server rows (SPEC §7.2), shared by the sync
// engine in the page and Background Sync in the service worker. Nothing here
// touches the DOM.

import { buildRow, type Fields } from "../../shared/rows";
import {
	type EntityName,
	type EntityRow,
	type EntityRowMap,
	entities,
	MAX_OPS_PER_PUSH,
	type Op,
	type OpError,
	type PushResult,
} from "../../shared/schema";
import type { LocalDb, OutboxEntry } from "../db/local";

/**
 * Encrypts a patch's text for an encrypted account (src/crypto/session.ts).
 * Throws `EncryptionLocked` when the account is encrypted but this device
 * can't encrypt right now; the outbox then waits.
 */
export type PatchEncrypter = (
	entity: EntityName,
	patch: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/** The server wants this account's text encrypted, and the device didn't know. */
export class EncryptionRequired extends Error {
	constructor() {
		super("encryption_required");
	}
}

/** Encrypts any plain text still queued (written before encryption was on here). */
async function encryptQueued(
	db: LocalDb,
	entries: OutboxEntry[],
	encrypt: PatchEncrypter,
): Promise<OutboxEntry[]> {
	const out: OutboxEntry[] = [];
	for (const entry of entries) {
		const { op } = entry;
		if (op.kind !== "upsert") {
			out.push(entry);
			continue;
		}
		const patch = await encrypt(op.entity, op.patch as Record<string, unknown>);
		if (patch === op.patch) {
			out.push(entry);
			continue;
		}
		const next = { ...entry, op: { ...op, patch } as Op };
		await db.outbox.put(next);
		out.push(next);
	}
	return out;
}

type AnyRow = EntityRowMap[EntityName];

/** Background Sync tag: the service worker flushes the outbox when the connection returns. */
export const OUTBOX_SYNC_TAG = "mythings-outbox";

/** The Web Lock that serializes syncs of one local database across tabs and the service worker. */
export const syncLockName = (db: LocalDb) => `mythings-sync-${db.name}`;

/**
 * Sends queued ops in batches until the outbox is empty, applying what the
 * server sends back. Returns the ops it rejected (already rolled back locally).
 */
export async function flushOutbox(
	db: LocalDb,
	push: (ops: Op[]) => Promise<PushResult>,
	encrypt?: PatchEncrypter,
): Promise<OpError[]> {
	const rejected: OpError[] = [];
	for (;;) {
		let entries = await db.outbox
			.orderBy("seq")
			.limit(MAX_OPS_PER_PUSH)
			.toArray();
		if (entries.length === 0) return rejected;
		if (encrypt) entries = await encryptQueued(db, entries, encrypt);
		const result = await push(entries.map((e) => e.op));
		// Kept queued (not rolled back): sent again once they're encrypted.
		const keep = new Set(
			result.errors
				.filter((e) => e.code === "encryption_required")
				.map((e) => e.opId),
		);

		await db.transaction("rw", db.allTables, async () => {
			// The server has processed the whole batch: acked, rejected, or malformed.
			await db.outbox.bulkDelete(
				entries.filter((e) => !keep.has(e.op.opId)).map((e) => e.seq as number),
			);
			await applyServerChanges(db, result.rows, result.purged);
			for (const error of result.errors) {
				if (error.current === undefined || keep.has(error.opId)) continue;
				const entry = entries.find((e) => e.op.opId === error.opId);
				if (error.current === null && entry)
					await db.rows(entry.entity).delete(entry.entityId);
				else if (error.current)
					await applyServerChanges(db, [error.current], []);
			}
		});
		if (keep.size > 0) throw new EncryptionRequired();
		rejected.push(...result.errors);
	}
}

/**
 * Stores server rows, rebased under any still-pending local ops so local
 * edits are never clobbered. Call inside a transaction over all tables.
 */
export async function applyServerChanges(
	db: LocalDb,
	rows: EntityRow[],
	purged: { entity: EntityName; id: string }[],
) {
	const pending = new Map<string, Op[]>();
	for (const { entity, entityId, op } of await db.outbox
		.orderBy("seq")
		.toArray()) {
		const key = `${entity}:${entityId}`;
		pending.set(key, [...(pending.get(key) ?? []), op]);
	}
	const headingProjects = new Map(
		(await db.headings.toArray()).map((h) => [h.id, h.projectId]),
	);
	for (const { entity, row } of rows)
		if (entity === "heading") headingProjects.set(row.id, row.projectId);
	const headingProject = (id: string) => headingProjects.get(id);

	for (const { entity, row } of rows) {
		const table = db.rows(entity);
		const local = await table.get(row.id);
		if (local && local.rev > row.rev) continue;

		let rebased = row as AnyRow;
		for (const op of pending.get(`${entity}:${row.id}`) ?? []) {
			if (op.kind === "purge") {
				rebased = local as AnyRow;
				break;
			}
			const patch =
				op.kind === "upsert"
					? op.patch
					: { deletedAt: local?.deletedAt ?? op.clientTs };
			const next = buildRow(
				entity,
				row.id,
				rebased as Fields,
				patch,
				op.clientTs,
				op.clientTs,
				headingProject,
			);
			const valid = entities[entity].row.safeParse(next);
			// If the server state makes a pending op invalid, the server will reject it too.
			if (valid.success) rebased = { ...(valid.data as AnyRow), rev: row.rev };
		}
		if (rebased) await table.put(rebased);
	}
	for (const { entity, id } of purged) await db.rows(entity).delete(id);
}
