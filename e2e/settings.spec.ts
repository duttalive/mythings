import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { expectSynced, open, quickEntry, row, signIn, signUp } from "./helpers";

test("theme is saved and applied before the first paint", async ({ page }) => {
	await signUp(page);
	await open(page, "/settings");
	await page.getByRole("radio", { name: "Dark" }).check({ force: true });
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
	await page.reload();
	await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
	const bg = await page.evaluate(
		() => getComputedStyle(document.body).backgroundColor,
	);
	expect(bg).toBe("rgb(28, 28, 30)");
});

test("export from one account, import into another", async ({ browser }) => {
	const source = await (await browser.newContext()).newPage();
	await signUp(source);
	await open(source, "/inbox");
	await quickEntry(source, "Carried over #moving");
	await expectSynced(source);
	await open(source, "/settings");
	const downloadPromise = source.waitForEvent("download");
	await source.getByRole("button", { name: "Export…" }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(
		/^mythings-\d{4}-\d{2}-\d{2}\.json$/,
	);
	const file = JSON.parse(
		await readFile((await download.path()) as string, "utf8"),
	);
	expect(file.format).toBe("mythings-export");

	const target = await (await browser.newContext()).newPage();
	const email = await signUp(target);
	await open(target, "/settings");
	const chooser = target.waitForEvent("filechooser");
	await target.getByRole("button", { name: "Import…" }).click();
	await (await chooser).setFiles({
		name: "export.json",
		mimeType: "application/json",
		buffer: Buffer.from(JSON.stringify(file)),
	});
	await expect(target.getByText("Imported 2 items.")).toBeVisible();

	await open(target, "/inbox");
	await expect(row(target, "Carried over")).toContainText("moving");
	// And on another device of that account.
	const again = await (await browser.newContext()).newPage();
	await signIn(again, email);
	await open(again, "/inbox");
	await expect(row(again, "Carried over")).toBeVisible();
});

test("text size scales the app and is remembered on this device", async ({
	page,
}) => {
	await signUp(page);
	await open(page, "/settings");
	const rootSize = () =>
		page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
	expect(await rootSize()).toBe("16px");
	await page.getByRole("radio", { name: "Larger" }).check({ force: true });
	expect(await rootSize()).toBe("20px");
	await page.reload();
	await expect(page.getByRole("radio", { name: "Larger" })).toBeChecked();
	expect(await rootSize()).toBe("20px");
	await page.getByRole("radio", { name: "Default" }).check({ force: true });
	expect(await rootSize()).toBe("16px");
});

test("the sidebar can be resized from the keyboard and keeps its width", async ({
	page,
}) => {
	await signUp(page);
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	const handle = page.getByRole("separator", { name: "Resize sidebar" });
	const width = async () =>
		Math.round((await sidebar.boundingBox())?.width ?? 0);
	expect(await width()).toBe(240);
	await handle.focus();
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Shift+ArrowRight");
	expect(await width()).toBe(304);
	await expect(handle).toHaveAttribute("aria-valuenow", "304");
	await page.reload();
	await expect(page.getByRole("navigation", { name: "Lists" })).toBeVisible();
	expect(await width()).toBe(304);
	await handle.dblclick();
	expect(await width()).toBe(240);
});

test("long titles wrap by default; One line is saved with the account", async ({
	browser,
}) => {
	const long =
		"Book the car service and ask about the brakes, the tyres, the wipers and the noise from the back when turning left";
	const page = await (await browser.newContext()).newPage();
	await page.setViewportSize({ width: 900, height: 800 });
	const email = await signUp(page);
	await open(page, "/inbox");
	await quickEntry(page, long);
	await expectSynced(page);
	const titleHeight = async (p: typeof page) =>
		(await row(p, long).locator("[data-row-title]").boundingBox())?.height ?? 0;
	// Wraps onto more than one line.
	expect(await titleHeight(page)).toBeGreaterThan(30);

	// Checklist items in an open to-do wrap and grow too.
	await row(page, long).click();
	await page.getByRole("button", { name: "Add checklist" }).click();
	const item = page.getByRole("textbox", { name: "Checklist item" });
	await item.fill(long);
	const itemBox = await item.boundingBox();
	expect(itemBox?.height ?? 0).toBeGreaterThan(30);
	await item.press("Escape");

	await open(page, "/settings");
	await page.getByRole("radio", { name: "One line" }).check({ force: true });
	await expectSynced(page);
	await open(page, "/inbox");
	expect(await titleHeight(page)).toBeLessThan(30);

	// Another device of the account picks it up.
	const other = await (await browser.newContext()).newPage();
	await other.setViewportSize({ width: 900, height: 800 });
	await signIn(other, email);
	await open(other, "/inbox");
	await expect(other.locator("html")).toHaveAttribute(
		"data-titles",
		"one-line",
	);
	expect(await titleHeight(other)).toBeLessThan(30);
});
