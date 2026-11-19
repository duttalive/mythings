// Which fields hold the user's words, and helpers that encrypt a patch or
// decrypt a row. Everything else (dates, repeat rules, status, ids, sort keys)
// stays readable so the server can run repeats, reminders and Trash.

import type { EntityName } from "../schema";
import { decryptText, encryptText, isEnvelope } from "./envelope";

export const ENCRYPTED_FIELDS = {
	area: ["title"],
	project: ["title", "notes"],
	heading: ["title"],
	todo: ["title", "notes"],
	checklist: ["title"],
	tag: ["title"],
} as const satisfies Record<EntityName, readonly string[]>;

/** Plain-text limits, checked before encrypting (the server can't see them afterwards). */
export const PLAIN_LIMITS: Record<string, number> = {
	title: 1000,
	notes: 100_000,
};
export const TAG_TITLE_MAX = 100;

export const aadFor = (entity: EntityName, field: string) =>
	`${entity}.${field}`;

export class PlainTextTooLong extends Error {
	override name = "PlainTextTooLong";
	constructor(readonly field: string) {
		super(field === "notes" ? "Notes are too long" : "Title is too long");
	}
}

/** Fields of `entity` in `record` that are plain text where encryption is expected. */
export function plainFields(
	entity: EntityName,
	record: Record<string, unknown>,
): string[] {
	return ENCRYPTED_FIELDS[entity].filter((field) => {
		const value = record[field];
		return typeof value === "string" && value !== "" && !isEnvelope(value);
	});
}

/**
 * Encrypts the text fields of a patch. Values that are already encrypted are
 * kept; empty strings stay empty (nothing to hide, and "no notes" stays cheap).
 * Tag titles are trimmed first, as the schema would.
 */
export async function encryptPatch(
	entity: EntityName,
	patch: Record<string, unknown>,
	key: CryptoKey,
): Promise<Record<string, unknown>> {
	let out: Record<string, unknown> | null = null;
	for (const field of ENCRYPTED_FIELDS[entity]) {
		const raw = patch[field];
		if (typeof raw !== "string" || raw === "" || isEnvelope(raw)) continue;
		let value = raw;
		if (entity === "tag") {
			value = raw.trim();
			if (value === "") continue;
			if (value.length > TAG_TITLE_MAX) throw new PlainTextTooLong(field);
		} else if (value.length > (PLAIN_LIMITS[field] ?? Infinity)) {
			throw new PlainTextTooLong(field);
		}
		out ??= { ...patch };
		out[field] = await encryptText(key, value, aadFor(entity, field));
	}
	return out ?? patch;
}

/** Shown in place of text this device can't decrypt. */
export const UNREADABLE = "🔒";

/**
 * Decrypts the text fields of a row. `cache` maps an envelope to its plain
 * text, so unchanged rows aren't decrypted again on every render.
 */
export async function decryptRow<T extends object>(
	entity: EntityName,
	row: T,
	key: CryptoKey | null,
	cache?: Map<string, string>,
): Promise<T> {
	const record = row as Record<string, unknown>;
	let out: Record<string, unknown> | null = null;
	for (const field of ENCRYPTED_FIELDS[entity]) {
		const value = record[field];
		if (typeof value !== "string" || !isEnvelope(value)) continue;
		let plain = cache?.get(value);
		if (plain === undefined) {
			if (!key) plain = UNREADABLE;
			else {
				try {
					plain = await decryptText(key, value, aadFor(entity, field));
					cache?.set(value, plain);
				} catch {
					plain = UNREADABLE;
				}
			}
		}
		out ??= { ...record };
		out[field] = plain;
	}
	return (out ?? row) as T;
}
