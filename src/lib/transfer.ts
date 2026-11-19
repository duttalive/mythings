// Export and import from the Settings page (SPEC §10.9).

import { ulid } from "ulid";
import type { EntityName } from "../../shared/schema";
import {
	type ExportFile,
	exportFileSchema,
	IMPORT_ORDER,
	planImport,
} from "../../shared/transfer";
import { ApiError } from "../api";
import { decryptRows, getCryptoState } from "../crypto/session";
import type { LocalDb } from "../db/local";
import type { Mutation, SyncEngine } from "../sync/engine";

/**
 * Downloads the export and saves it as a file. Returns the file name. For an
 * encrypted account the server's copy is decrypted here first, so the file
 * is readable (and importable anywhere).
 */
export async function downloadExport(encrypted = false): Promise<string> {
	const res = await fetch("/api/export").catch(() => null);
	if (!res?.ok) throw new Error("Couldn't export. Check your connection.");
	const name =
		res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
		"mythings.json";
	let blob = await res.blob();
	if (encrypted || getCryptoState().key) {
		const file = JSON.parse(await blob.text()) as ExportFile;
		for (const entity of IMPORT_ORDER)
			(file.data as Record<EntityName, unknown[]>)[entity] = await decryptRows(
				entity,
				file.data[entity] as object[],
			);
		blob = new Blob([JSON.stringify(file)], { type: "application/json" });
	}
	const url = URL.createObjectURL(blob);
	const link = Object.assign(document.createElement("a"), {
		href: url,
		download: name,
	});
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
	return name;
}

type ImportResult = { imported: number; skipped: number; errors: unknown[] };

/** Ops per local transaction when importing on the device. */
const IMPORT_BATCH = 200;

/**
 * For an encrypted account: the import is planned here (matching tags by
 * their decrypted names) and saved through the sync engine, which encrypts
 * it before anything leaves the device.
 */
async function importLocally(
	name: string,
	body: unknown,
	{ db, engine }: { db: LocalDb; engine: SyncEngine },
): Promise<string> {
	const parsed = exportFileSchema.safeParse(body);
	if (!parsed.success) throw new Error(`${name} isn't a mythings export.`);
	const tags = await decryptRows(
		"tag",
		(await db.tags.toArray()).filter(
			(t) => t.deletedAt === null && t.parentId === null,
		),
	);
	const existing = new Map(
		tags.map((tag) => [tag.title.trim().toLowerCase(), tag.id]),
	);
	const { ops, skipped } = planImport(parsed.data, existing, ulid, Date.now());
	let imported = 0;
	const errors: unknown[] = [];
	for (let i = 0; i < ops.length; i += IMPORT_BATCH) {
		const mutations: Mutation[] = ops.slice(i, i + IMPORT_BATCH).map((op) => ({
			type: "upsert",
			entity: op.entity,
			id: op.entityId,
			patch: (op as { patch: Record<string, unknown> }).patch,
		}));
		try {
			await engine.apply(mutations, { undoable: false });
			imported += mutations.length;
		} catch {
			// One bad row sinks a local batch: retry its rows one by one.
			for (const mutation of mutations) {
				try {
					await engine.apply([mutation], { undoable: false });
					imported++;
				} catch (err) {
					errors.push(err);
				}
			}
		}
	}
	return importSummary({ imported, skipped, errors });
}

/** Uploads an export file. Returns a summary for the user. */
export async function importFile(
	file: File,
	local?: { db: LocalDb; engine: SyncEngine },
): Promise<string> {
	let body: unknown;
	try {
		body = JSON.parse(await file.text());
	} catch {
		throw new Error(`${file.name} isn't a JSON file.`);
	}
	if (local) return importLocally(file.name, body, local);
	const res = await fetch("/api/import", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	}).catch(() => null);
	if (!res) throw new Error("Couldn't import. Check your connection.");
	const data = await res.json().catch(() => ({ error: "bad_response" }));
	if (!res.ok) {
		const error = new ApiError(res.status, data);
		throw new Error(
			error.code === "invalid_input"
				? `${file.name} isn't a mythings export.`
				: "Couldn't import that file.",
		);
	}
	return importSummary(data as ImportResult);
}

export function importSummary({ imported, skipped, errors }: ImportResult) {
	const items = (n: number) => `${n} item${n === 1 ? "" : "s"}`;
	const parts = [`Imported ${items(imported)}.`];
	if (skipped > 0)
		parts.push(`${items(skipped)} in the Trash or incomplete were left out.`);
	if (errors.length > 0)
		parts.push(`${items(errors.length)} couldn't be imported.`);
	return parts.join(" ");
}
