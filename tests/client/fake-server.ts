import { buildRow, type Fields } from "../../shared/rows";
import {
	type EntityName,
	type EntityRow,
	type EntityRowMap,
	entities,
	type Op,
	type PullResult,
	type PushResult,
} from "../../shared/schema";
import {
	NetworkError,
	type Transport,
	UnauthorizedError,
} from "../../src/sync/transport";

type Entry = {
	rev: number;
	change: EntityRow | { purged: { entity: EntityName; id: string } };
};

/**
 * An in-memory stand-in for the sync API. It merges and normalizes like the
 * real server (via the shared buildRow) but doesn't cascade or check references.
 */
export class FakeServer implements Transport {
	readonly rows = new Map<string, EntityRow>();
	readonly tombstones = new Map<
		string,
		{ entity: EntityName; id: string; rev: number }
	>();
	rev = 0;
	offline = false;
	unauthorized = false;
	pushCalls = 0;
	/** Return an error code to reject an op. */
	reject: (op: Op) => string | null = () => null;

	async push(ops: Op[]): Promise<PushResult> {
		this.pushCalls++;
		this.check();
		const result: PushResult = {
			acked: [],
			errors: [],
			rows: [],
			purged: [],
			rev: 0,
		};
		for (const op of ops) {
			const key = `${op.entity}:${op.entityId}`;
			const code = this.reject(op);
			if (code) {
				result.errors.push({
					opId: op.opId,
					code,
					message: code,
					current: this.rows.get(key) ?? null,
				});
				continue;
			}
			if (op.kind === "purge") {
				this.rows.delete(key);
				const tombstone = {
					entity: op.entity,
					id: op.entityId,
					rev: ++this.rev,
				};
				this.tombstones.set(key, tombstone);
				result.purged.push({ entity: op.entity, id: op.entityId });
			} else {
				const patch =
					op.kind === "upsert" ? op.patch : { deletedAt: op.clientTs };
				result.rows.push(
					this.write(op.entity, op.entityId, patch, op.clientTs),
				);
			}
			result.acked.push(op.opId);
		}
		result.rev = this.rev;
		return result;
	}

	async pull(since: number, limit: number): Promise<PullResult> {
		this.check();
		const entries: Entry[] = [
			...[...this.rows.values()].map((change) => ({
				rev: change.row.rev,
				change,
			})),
			...[...this.tombstones.values()].map(({ rev, entity, id }) => ({
				rev,
				change: { purged: { entity, id } },
			})),
		]
			.filter((e) => e.rev > since)
			.sort((a, b) => a.rev - b.rev);
		const page = entries.slice(0, limit);
		const more = entries.length > limit;
		return {
			rows: page.flatMap((e) => ("purged" in e.change ? [] : [e.change])),
			purged: page.flatMap((e) =>
				"purged" in e.change ? [e.change.purged] : [],
			),
			rev: more ? (page.at(-1)?.rev ?? since) : this.rev,
			more,
		};
	}

	/** A change made on another device. */
	write<E extends EntityName>(
		entity: E,
		id: string,
		patch: Record<string, unknown>,
		clientTs = Date.now(),
	): EntityRow {
		const existing = (this.rows.get(`${entity}:${id}`)?.row ??
			null) as Fields | null;
		const merged = buildRow(
			entity,
			id,
			existing,
			patch,
			clientTs,
			Date.now(),
			() => undefined,
		);
		const row = {
			...(entities[entity].row.parse(merged) as EntityRowMap[E]),
			rev: ++this.rev,
		};
		const change = { entity, row } as EntityRow;
		this.rows.set(`${entity}:${id}`, change);
		return change;
	}

	get<E extends EntityName>(
		entity: E,
		id: string,
	): EntityRowMap[E] | undefined {
		return this.rows.get(`${entity}:${id}`)?.row as EntityRowMap[E] | undefined;
	}

	private check() {
		if (this.unauthorized) throw new UnauthorizedError("unauthorized");
		if (this.offline) throw new NetworkError("offline");
	}
}
