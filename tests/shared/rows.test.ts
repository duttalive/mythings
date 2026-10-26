import { describe, expect, it } from "vitest";
import { buildRow, type Fields } from "../../shared/rows";
import { entities } from "../../shared/schema";
import { area } from "./fixtures";

describe("buildRow", () => {
	it("fills in fields added after a row was stored", () => {
		// An area saved on a device before areas could be collapsed.
		const { collapsed: _, ...old } = area({ title: "Home" });
		const row = buildRow(
			"area",
			old.id,
			old as Fields,
			{ title: "House" },
			1,
			2,
			() => undefined,
		);
		expect(row).toMatchObject({ title: "House", collapsed: false });
		expect(entities.area.row.safeParse(row).success).toBe(true);
	});
});
