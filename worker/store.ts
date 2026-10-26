// Row storage inside a UserStore Durable Object. Entities are stored one table
// each with snake_case columns; booleans become 0/1 and arrays/objects JSON.

import type { EntityName, EntityRow, EntityRowMap } from "../shared/schema";
import { DO_MIGRATIONS } from "./do-migrations";

export const TABLES: Record<EntityName, string> = {
	area: "areas",
	project: "projects",
	heading: "headings",
	todo: "todos",
	checklist: "checklist_items",
	tag: "tags",
};

export const ENTITY_NAMES = Object.keys(TABLES) as EntityName[];

const BOOLEAN_FIELDS = new Set(["evening", "archived", "done", "collapsed"]);
const JSON_FIELDS = new Set(["tagIds", "repeat"]);

const toColumn = (field: string) =>
	field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toField = (column: string) =>
	column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function encode(row: object): Record<string, SqlStorageValue> {
	const out: Record<string, SqlStorageValue> = {};
	for (const [field, value] of Object.entries(row)) {
		out[toColumn(field)] = BOOLEAN_FIELDS.has(field)
			? value
				? 1
				: 0
			: JSON_FIELDS.has(field)
				? value === null
					? null
					: JSON.stringify(value)
				: (value as SqlStorageValue);
	}
	return out;
}

function decode<E extends EntityName>(
	record: Record<string, SqlStorageValue>,
): EntityRowMap[E] {
	const row: Record<string, unknown> = {};
	for (const [column, value] of Object.entries(record)) {
		const field = toField(column);
		row[field] = BOOLEAN_FIELDS.has(field)
			? value === 1
			: JSON_FIELDS.has(field) && typeof value === "string"
				? JSON.parse(value)
				: value;
	}
	return row as EntityRowMap[E];
}

export function migrate(sql: SqlStorage): void {
	sql.exec(
		"CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
	);
	const row = sql
		.exec<{ value: string }>(
			"SELECT value FROM meta WHERE key = 'schema_version'",
		)
		.toArray()[0];
	const version = row ? Number(row.value) : 0;
	for (let i = version; i < DO_MIGRATIONS.length; i++) {
		sql.exec(DO_MIGRATIONS[i] as string);
		sql.exec(
			"INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			String(i + 1),
		);
	}
}

export class Store {
	#rev: number;

	constructor(private readonly sql: SqlStorage) {
		const row = sql
			.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'rev'")
			.toArray()[0];
		this.#rev = row ? Number(row.value) : 0;
	}

	get rev(): number {
		return this.#rev;
	}

	/** Allocates the next server sequence number. */
	nextRev(): number {
		this.#rev++;
		this.sql.exec(
			"INSERT INTO meta (key, value) VALUES ('rev', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			String(this.#rev),
		);
		return this.#rev;
	}

	getMeta(key: string): string | null {
		return (
			this.sql
				.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key)
				.toArray()[0]?.value ?? null
		);
	}

	setMeta(key: string, value: string): void {
		this.sql.exec(
			"INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
			key,
			value,
		);
	}

	get<E extends EntityName>(entity: E, id: string): EntityRowMap[E] | null {
		const record = this.sql
			.exec(`SELECT * FROM ${TABLES[entity]} WHERE id = ?`, id)
			.toArray()[0];
		return record ? decode<E>(record) : null;
	}

	/** Rows matching a SQL condition, e.g. `where("todo", "project_id = ?", id)`. */
	where<E extends EntityName>(
		entity: E,
		condition: string,
		...bindings: SqlStorageValue[]
	): EntityRowMap[E][] {
		return this.sql
			.exec(`SELECT * FROM ${TABLES[entity]} WHERE ${condition}`, ...bindings)
			.toArray()
			.map((record) => decode<E>(record));
	}

	put<E extends EntityName>(entity: E, row: EntityRowMap[E]): void {
		const record = encode(row);
		const columns = Object.keys(record);
		this.sql.exec(
			`INSERT OR REPLACE INTO ${TABLES[entity]} (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
			...Object.values(record),
		);
	}

	/** Deletes a row for good and records a tombstone so clients drop it too. */
	purge(entity: EntityName, id: string): void {
		this.sql.exec(`DELETE FROM ${TABLES[entity]} WHERE id = ?`, id);
		if (entity === "todo")
			this.sql.exec("DELETE FROM reminders_sent WHERE todo_id = ?", id);
		this.sql.exec(
			"INSERT OR REPLACE INTO purged (entity, id, rev) VALUES (?, ?, ?)",
			entity,
			id,
			this.nextRev(),
		);
	}

	hasAppliedOp(opId: string): boolean {
		return (
			this.sql.exec("SELECT 1 FROM applied_ops WHERE op_id = ?", opId).toArray()
				.length > 0
		);
	}

	recordAppliedOp(opId: string): void {
		this.sql.exec(
			"INSERT OR IGNORE INTO applied_ops (op_id, rev) VALUES (?, ?)",
			opId,
			this.#rev,
		);
	}

	/** Keeps roughly the most recent `keep` op ids for deduplication. */
	trimAppliedOps(keep: number): void {
		this.sql.exec(
			`DELETE FROM applied_ops WHERE rev < (SELECT rev FROM applied_ops ORDER BY rev DESC LIMIT 1 OFFSET ?)`,
			keep,
		);
	}

	/** Everything that changed after `since`, oldest first, at most `limit` entries. */
	changesSince(
		since: number,
		limit: number,
	): { entries: ChangeEntry[]; more: boolean } {
		const entries: ChangeEntry[] = [];
		for (const entity of ENTITY_NAMES) {
			const records = this.sql
				.exec(
					`SELECT * FROM ${TABLES[entity]} WHERE rev > ? ORDER BY rev LIMIT ?`,
					since,
					limit + 1,
				)
				.toArray();
			for (const record of records) {
				const row = decode(record);
				entries.push({
					rev: row.rev,
					change: { kind: "row", row: { entity, row } as EntityRow },
				});
			}
		}
		const purged = this.sql
			.exec<{ entity: EntityName; id: string; rev: number }>(
				"SELECT entity, id, rev FROM purged WHERE rev > ? ORDER BY rev LIMIT ?",
				since,
				limit + 1,
			)
			.toArray();
		for (const { entity, id, rev } of purged) {
			entries.push({ rev, change: { kind: "purged", entity, id } });
		}
		entries.sort((a, b) => a.rev - b.rev);
		return { entries: entries.slice(0, limit), more: entries.length > limit };
	}
}

export type ChangeEntry = {
	rev: number;
	change:
		| { kind: "row"; row: EntityRow }
		| { kind: "purged"; entity: EntityName; id: string };
};
