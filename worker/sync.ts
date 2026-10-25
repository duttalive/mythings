import { Hono } from "hono";
import { z } from "zod";
import { MAX_OPS_PER_PUSH, type Me } from "../shared/schema";
import type { UserContext } from "./apply";
import { requireUser } from "./auth";
import { ApiError, readJson } from "./http";
import type { AppEnv } from "./types";

const pushBodySchema = z.object({
	// Each op is validated by the UserStore, so one bad op doesn't sink the batch.
	ops: z.array(z.unknown()).min(1).max(MAX_OPS_PER_PUSH),
});

const pullQuerySchema = z.object({
	since: z.coerce.number().int().nonnegative().default(0),
	limit: z.coerce.number().int().min(1).max(1000).default(500),
});

export function userContext(user: Me): UserContext {
	return {
		userId: user.id,
		tz: user.tz,
		weekStart: user.settings.weekStart ?? 1,
	};
}

export const sync = new Hono<AppEnv>();

sync.use(requireUser);

sync.post("/push", async (c) => {
	const { ops } = await readJson(c, pushBodySchema);
	const user = c.get("user");
	return c.json(
		await c.env.USER_STORE.getByName(user.id).push(ops, userContext(user)),
	);
});

// Realtime channel: authenticated here, then handed to the user's UserStore.
sync.get("/ws", async (c) => {
	if (c.req.header("upgrade")?.toLowerCase() !== "websocket") {
		throw new ApiError(426, "upgrade_required");
	}
	// Browsers send Origin on WebSocket handshakes; reject cross-site ones (CSWSH).
	const origin = c.req.header("origin");
	if (
		!origin ||
		![c.env.APP_ORIGIN, new URL(c.req.url).origin].includes(origin)
	) {
		throw new ApiError(403, "bad_origin");
	}
	const user = c.get("user");
	const headers = new Headers(c.req.raw.headers);
	headers.set("x-user-context", JSON.stringify(userContext(user)));
	return c.env.USER_STORE.getByName(user.id).fetch(
		new Request(c.req.raw, { headers }),
	);
});

sync.get("/pull", async (c) => {
	const query = pullQuerySchema.safeParse(c.req.query());
	if (!query.success) throw new ApiError(400, "invalid_input");
	const { since, limit } = query.data;
	return c.json(
		await c.env.USER_STORE.getByName(c.get("user").id).pull(since, limit),
	);
});
