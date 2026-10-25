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
