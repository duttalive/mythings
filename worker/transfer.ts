import { Hono } from "hono";
import { exportFileSchema } from "../shared/transfer";
import { requireUser } from "./auth";
import { readJson } from "./http";
import { userContext } from "./sync";
import type { AppEnv } from "./types";

// GET /api/export and POST /api/import (SPEC §8).
export const transfer = new Hono<AppEnv>();

// Mounted at the API root, so auth is per route (a `use` would cover every route).
transfer.get("/export", requireUser, async (c) => {
	const user = c.get("user");
	const file = await c.env.USER_STORE.getByName(user.id).exportData();
	const date = file.exportedAt.slice(0, 10);
	c.header(
		"content-disposition",
		`attachment; filename="mythings-${date}.json"`,
	);
	return c.json(file);
});

transfer.post("/import", requireUser, async (c) => {
	const file = await readJson(c, exportFileSchema);
	const user = c.get("user");
	return c.json(
		await c.env.USER_STORE.getByName(user.id).importData(
			file,
			userContext(user),
		),
	);
});
