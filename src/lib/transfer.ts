// Export and import from the Settings page (SPEC §10.9).

import { ApiError } from "../api";

/** Downloads the export and saves it as a file. Returns the file name. */
export async function downloadExport(): Promise<string> {
	const res = await fetch("/api/export").catch(() => null);
	if (!res?.ok) throw new Error("Couldn't export. Check your connection.");
	const name =
		res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
		"mythings.json";
	const url = URL.createObjectURL(await res.blob());
	const link = Object.assign(document.createElement("a"), {
		href: url,
		download: name,
	});
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
	return name;
}

type ImportResult = { imported: number; skipped: number; errors: unknown[] };

/** Uploads an export file. Returns a summary for the user. */
export async function importFile(file: File): Promise<string> {
	let body: unknown;
	try {
		body = JSON.parse(await file.text());
	} catch {
		throw new Error(`${file.name} isn't a JSON file.`);
	}
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
