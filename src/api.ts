import type { ApiErrorBody } from "../shared/schema";

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly body: ApiErrorBody,
	) {
		super(body.error);
	}

	get code() {
		return this.body.error;
	}
}

type Options = { method?: string; body?: unknown };

export async function api<T>(
	path: string,
	{ method = "GET", body }: Options = {},
): Promise<T> {
	const res = await fetch(`/api${path}`, {
		method,
		headers:
			body === undefined ? undefined : { "content-type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const data = await res.json().catch(() => ({ error: "bad_response" }));
	if (!res.ok) throw new ApiError(res.status, data as ApiErrorBody);
	return data as T;
}
