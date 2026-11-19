import type { Me } from "../shared/schema";

export type AppEnv = {
	Bindings: Env;
	Variables: { user: Me };
};

export type UserRow = {
	id: string;
	email: string;
	name: string | null;
	password_hash: string;
	tz: string;
	settings: string;
	created_at: number;
	/** 1 once end-to-end encryption is on. */
	encrypted?: number;
};

export function toMe(row: UserRow): Me {
	return {
		id: row.id,
		email: row.email,
		name: row.name ?? null,
		tz: row.tz,
		settings: JSON.parse(row.settings),
		encrypted: row.encrypted === 1,
	};
}
