import { Hono } from "hono";
import { updateMeSchema } from "../shared/schema";
import { requireUser } from "./auth";
import { readJson } from "./http";
import { userContext } from "./sync";
import type { AppEnv } from "./types";

export const me = new Hono<AppEnv>();

me.use(requireUser);

me.get("/", (c) => c.json(c.get("user")));

me.patch("/", async (c) => {
	const input = await readJson(c, updateMeSchema);
	const user = c.get("user");
	const updated = {
		...user,
		tz: input.tz ?? user.tz,
		settings: { ...user.settings, ...input.settings },
	};
	await c.env.DB.prepare("UPDATE users SET tz = ?, settings = ? WHERE id = ?")
		.bind(updated.tz, JSON.stringify(updated.settings), user.id)
		.run();
	// Midnight, repeats and reminders follow the new time zone and week start.
	await c.env.USER_STORE.getByName(user.id).updateUser(userContext(updated));
	return c.json(updated);
});
