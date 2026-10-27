import { describe, expect, it } from "vitest";
import {
	areaRequest,
	emptyTrashRequest,
	headingRequest,
	projectRequest,
	tagRequest,
	todosRequest,
} from "../../src/editing/deleteRequests";
import { area, data, heading, project, tag, todo } from "../shared/fixtures";

describe("delete confirmations", () => {
	it("names one to-do, counts several, and says they go to Trash", () => {
		expect(todosRequest([todo({ title: "Call Mum" })])).toMatchObject({
			title: "Delete “Call Mum”?",
			body: expect.stringContaining("restore it from Trash"),
		});
		expect(todosRequest([todo(), todo()]).title).toBe("Delete 2 to-dos?");
		expect(todosRequest([todo({ title: " " })]).title).toBe(
			"Delete this to-do?",
		);
	});

	it("says what goes with a project, area or heading, skipping deleted rows", () => {
		const p = project({ title: "Taxes" });
		const h = heading({ projectId: p.id, title: "Forms" });
		const a = area({ title: "Home" });
		const inArea = project({ areaId: a.id });
		const d = data({
			projects: [p, inArea],
			areas: [a],
			headings: [h],
			todos: [
				todo({ projectId: p.id, headingId: h.id }),
				todo({ projectId: p.id }),
				todo({ projectId: p.id, deletedAt: 1 }),
				todo({ projectId: inArea.id }),
				todo({ areaId: a.id }),
			],
		});
		expect(projectRequest(p, d)).toMatchObject({
			title: "Delete project “Taxes”?",
			body: expect.stringContaining("with its 2 to-dos and 1 heading"),
		});
		expect(headingRequest(h, d).body).toContain("with its 1 to-do.");
		expect(areaRequest(a, d).body).toContain("with its 1 project and 2 to-dos");
		expect(areaRequest(area(), data()).body).toBe(
			"It moves to Trash. You can restore it from Trash for 30 days.",
		);
	});

	it("warns that tags and an emptied Trash can't be restored", () => {
		const t = tag({ title: "work" });
		const d = data({ tags: [t], todos: [todo({ tagIds: [t.id] })] });
		expect(tagRequest(t, d).body).toContain("comes off 1 to-do or project");
		expect(tagRequest(t, d).permanent).toBeUndefined();
		expect(emptyTrashRequest(3)).toMatchObject({
			permanent: true,
			body: expect.stringContaining("3 items"),
		});
	});
});
