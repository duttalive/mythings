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
		.getByRole("switch", { name: "Group tasks in Today by project" })
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
		.getByRole("switch", { name: "Group tasks in Today by project" })
		.uncheck();
	await open(page, "/today");
	await expect
		.poll(() => rowTitles(page))
		.toEqual(["Dentist", "Label", "Pack"]);
});

test("Today's filter bar offers every tag", async ({ page }) => {
	await signUp(page);
	await quickEntry(page, "Buy milk #shop @today");
	await quickEntry(page, "Plan week #work @someday");
	await quickEntry(page, "Call mum @today");
	await open(page, "/today");
	const bar = page.getByRole("toolbar", { name: "Filters" });
	await bar.getByRole("button", { name: "Filter by Tag" }).click();
	const menu = page.getByRole("dialog", { name: "Filter by Tag" });
	await expect(menu.getByRole("button", { name: "shop" })).toBeVisible();
	await expect(menu.getByRole("button", { name: "work" })).toBeVisible();

	await menu.getByRole("button", { name: "shop" }).click();
	await expect(page).toHaveURL(/tags=/);
	await expect.poll(() => rowTitles(page)).toEqual(["Buy milk"]);
	await page.keyboard.press("Escape");
	await bar.getByRole("button", { name: "Clear filters" }).click();
	await expect.poll(() => rowTitles(page)).toEqual(["Buy milk", "Call mum"]);
});

test("the sidebar shows the views chosen in Settings; search finds them all", async ({
	page,
}) => {
	await signUp(page);
	await open(page, "/settings");
	const lists = page.getByRole("navigation", { name: "Lists" });
	await expect(lists.getByRole("link", { name: "Deadlines" })).toHaveCount(0);
	await page.getByRole("switch", { name: "Show Deadlines" }).check();
	await page.getByRole("switch", { name: "Show Someday" }).uncheck();
	await expect(lists.getByRole("link", { name: "Deadlines" })).toBeVisible();
	await expect(lists.getByRole("link", { name: "Someday" })).toHaveCount(0);
	await expect(lists.getByRole("link", { name: "Inbox" })).toBeVisible();

	await page.reload();
	await expect(lists.getByRole("link", { name: "Deadlines" })).toBeVisible();

	await page.keyboard.press("d");
	const find = page.getByRole("combobox", { name: "Quick Find" });
	await find.fill("someday");
	await find.press("Enter");
	await expect(page).toHaveURL(/\/someday$/);
	await expect(
		page.getByText("Tasks and projects parked for later."),
	).toBeVisible();

	await open(page, "/settings");
	await page.getByRole("button", { name: "Reset sidebar to default" }).click();
	await expect(lists.getByRole("link", { name: "Someday" })).toBeVisible();
	await expect(lists.getByRole("link", { name: "Deadlines" })).toHaveCount(0);
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

test("Today holds only today; Overdue keeps what slipped, and it can't go back to Today", async ({
	page,
}) => {
	await signUp(page);
	// From Anytime, so Quick Entry doesn't also schedule them for today.
	await open(page, "/anytime");
	await quickEntry(page, "Pay rent !yesterday");
	await quickEntry(page, "Call the bank !today");
	await quickEntry(page, "Plan the week @today");
	// A day that has passed isn't accepted as a When.
	await page.keyboard.press("Alt+Space");
	const entry = page.getByRole("dialog", { name: "Quick Entry" });
	await entry
		.getByLabel("Title", { exact: true })
		.fill("Water plants @yesterday");
	await expect(entry.getByText(/has passed/)).toBeVisible();
	await page.keyboard.press("Escape");

	// Due today alone isn't enough for Today.
	await open(page, "/today");
	await expect.poll(() => rowTitles(page)).toEqual(["Plan the week"]);

	const overdueLink = page
		.getByRole("navigation", { name: "Lists" })
		.getByRole("link", { name: /Overdue/ });
	await expect(overdueLink).toContainText("1");
	await overdueLink.click();
	await expect(page).toHaveURL(/\/overdue$/);
	await expect(
		page.getByRole("heading", { name: "Overdue", exact: true }),
	).toBeVisible();
	await expect.poll(() => rowTitles(page)).toEqual(["Pay rent"]);
	await expect(page.getByRole("heading", { name: /Yesterday/ })).toContainText(
		"1 day overdue",
	);

	// Alt+T on an overdue to-do explains why it stays.
	await row(page, "Pay rent").click();
	await page.keyboard.press("Escape");
	await page.keyboard.press("Alt+t");
	await expect(page.getByText(/stay in Overdue/)).toBeVisible();
	await expect.poll(() => rowTitles(page)).toEqual(["Pay rent"]);
});
