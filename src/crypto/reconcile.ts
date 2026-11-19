// Brings the local copy in line with the account's encryption setting
// (SPEC §8.5): once encryption is on, any text still in plain text is
// encrypted and sent; once it's off, encrypted text is written back as plain
// text. Runs on every device after a full sync, so turning encryption on or
// off finishes even if the device that did it goes offline.

import { decryptText, isEnvelope } from "../../shared/crypto/envelope";
import { aadFor, ENCRYPTED_FIELDS } from "../../shared/crypto/fields";
import type { EntityName } from "../../shared/schema";
import type { LocalDb } from "../db/local";
import type { Mutation, SyncEngine } from "../sync/engine";
import { getCryptoState } from "./session";

const ENTITIES = Object.keys(ENCRYPTED_FIELDS) as EntityName[];
const BATCH = 100;

let running: Promise<number> | null = null;

/** Returns how many rows it changed. */
export function reconcileEncryption(
	db: LocalDb,
	engine: SyncEngine,
): Promise<number> {
	running ??= run(db, engine).finally(() => {
		running = null;
	});
	return running;
}

async function run(db: LocalDb, engine: SyncEngine): Promise<number> {
	const { encrypted, key } = getCryptoState();
	if (!key) return 0;
	// Not while local edits are waiting: they may be newer than the rows here.
	if ((await db.outbox.count()) > 0) return 0;
	const mutations: Mutation[] = [];
	for (const entity of ENTITIES) {
		const fields = ENCRYPTED_FIELDS[entity];
		const rows = (await db.rows(entity).toArray()) as unknown as Record<
			string,
			unknown
		>[];
		for (const row of rows) {
			const patch: Record<string, unknown> = {};
			for (const field of fields) {
				const value = row[field];
				if (typeof value !== "string" || value === "") continue;
				if (encrypted && !isEnvelope(value)) patch[field] = value;
				else if (!encrypted && isEnvelope(value)) {
					try {
						patch[field] = await decryptText(key, value, aadFor(entity, field));
					} catch {
						// Not this key's (e.g. from before starting over): leave it.
					}
				}
			}
			if (Object.keys(patch).length > 0)
				mutations.push({
					type: "upsert",
					entity,
					id: row.id as string,
					patch,
				});
		}
	}
	for (let i = 0; i < mutations.length; i += BATCH)
		await engine.apply(mutations.slice(i, i + BATCH), { undoable: false });
	return mutations.length;
}
