import { expect, type Page, test } from "@playwright/test";
import {
	expectSynced,
	open,
	quickEntry,
	row,
	rowTitles,
	signUp,
} from "./helpers";

async function newProject(page: Page, title: string) {
	await page.getByRole("button", { name: "New List" }).click();
	await page.getByRole("button", { name: /^New Project/ }).click();
	const field = page.locator('[placeholder="New Project"]:focus');
	await field.fill(title);
	await field.press("Enter");
	await expect(
		page
			.getByRole("navigation", { name: "Lists" })
			.getByRole("link", { name: title }),
	).toBeVisible();
	await expectSynced(page);
}

test("grouped by project, Today moves a to-do only within its project's group", async ({
	page,
}) => {
	await signUp(page);
	await newProject(page, "Move");
	// From Today, so Dentist isn't added to the open project.
	await open(page, "/today");
	await quickEntry(page, "Dentist @today");
	await quickEntry(page, "Pack /Move @today");
	await quickEntry(page, "Label /Move @today");
	await open(page, "/settings");
	await page
		.getByRole("switch", { name: "Group to-dos in Today by project" })
		.check();
	await expectSynced(page);

	await open(page, "/today");
	await expect
		.poll(() => rowTitles(page))
		.toEqual(["Dentist", "Pack", "Label"]);
	await expect(
		page.locator("main").getByRole("list", { name: "Move" }),
	).toContainText("Pack");
	await row(page, "Label").click({ modifiers: ["ControlOrMeta"] });
	await page.keyboard.press("ControlOrMeta+ArrowUp");
	await expect
		.poll(() => rowTitles(page))
		.toEqual(["Dentist", "Label", "Pack"]);
	// Already first in its group, so it stays put, rather than quietly
	// moving above Dentist where only the ungrouped list would show it.
	await page.keyboard.press("ControlOrMeta+ArrowUp");
	await expectSynced(page);

	await open(page, "/settings");
	await page
		.getByRole("switch", { name: "Group to-dos in Today by project" })
		.uncheck();
	await open(page, "/today");
	await expect
		.poll(() => rowTitles(page))
		.toEqual(["Dentist", "Label", "Pack"]);
});

test("Today's tag bar offers only the tags of what's in Today", async ({
	page,
}) => {
	await signUp(page);
	await quickEntry(page, "Buy milk #shop @today");
	await quickEntry(page, "Plan week #work @someday");
	await open(page, "/today");
	const bar = page.getByRole("toolbar", { name: "Filter by tag" });
	await expect(bar.getByRole("button", { name: "shop" })).toBeVisible();
	await expect(bar.getByRole("button", { name: "work" })).toHaveCount(0);
});

test("Today moves on to the new day when the app comes back after sleeping", async ({
	page,
}) => {
	await page.clock.install();
	await signUp(page);
	await quickEntry(page, "Water plants @tomorrow");
	await open(page, "/today");
	await expect(row(page, "Water plants")).toBeHidden();

	// A day passes with timers paused, as when a laptop sleeps.
	await page.clock.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	await expect(row(page, "Water plants")).toBeVisible();
});

test("Deadlines opens from Quick Find and can be searched", async ({
	page,
}) => {
	await signUp(page);
	await quickEntry(page, "Pay rent !tomorrow");
	await quickEntry(page, "File taxes #money !next friday");
	await quickEntry(page, "No rush");
	await open(page, "/today");

	await page.keyboard.press("d");
	const find = page.getByRole("combobox", { name: "Quick Find" });
	await find.fill("deadlines");
	await find.press("Enter");
	await expect(page).toHaveURL(/\/deadlines$/);
	await expect(page.getByRole("heading", { name: "Deadlines" })).toBeVisible();
	await expect.poll(() => rowTitles(page)).toEqual(["Pay rent", "File taxes"]);
	await expect(page.getByRole("heading", { name: "Tomorrow" })).toBeVisible();

	const search = page.getByRole("searchbox", { name: "Search deadlines" });
	await search.fill("money");
	await expect.poll(() => rowTitles(page)).toEqual(["File taxes"]);
	await search.fill("nothing like this");
	await expect(page.locator("main")).toContainText("No deadlines match");
	await search.press("Escape");
	await expect.poll(() => rowTitles(page)).toEqual(["Pay rent", "File taxes"]);
});
