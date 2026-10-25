import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import type { ApiErrorBody } from "../shared/schema";

/** Thrown from handlers; rendered as `{ error, issues? }` by the app's error handler. */
export class ApiError extends Error {
	constructor(
		readonly status: ContentfulStatusCode,
		readonly code: string,
		readonly issues?: ApiErrorBody["issues"],
	) {
		super(code);
	}
}

export async function readJson<S extends z.ZodType>(
	c: Context,
	schema: S,
): Promise<z.infer<S>> {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw new ApiError(400, "invalid_json");
	}
	const result = schema.safeParse(body);
	if (!result.success) {
		throw new ApiError(
			400,
			"invalid_input",
			result.error.issues.map((i) => ({
				path: i.path.filter((p): p is string | number => typeof p !== "symbol"),
				message: i.message,
			})),
		);
	}
	return result.data;
}
