import { expect, test } from "@playwright/test";
import {
	checkbox,
	expectSynced,
	open,
	quickEntry,
	row,
	rowTitles,
	signIn,
	signUp,
} from "./helpers";

const EDITS = 50;

test(`${EDITS} offline edits sync without loss or duplicates`, async ({
	browser,
}) => {
	test.setTimeout(90_000);
	const context = await browser.newContext();
	const page = await context.newPage();
	const email = await signUp(page);
	await open(page, "/inbox");
	await quickEntry(page, "Rename me");
	await expectSynced(page);

	await context.setOffline(true);
	await expect(page.getByTestId("offline-indicator")).toBeVisible();

	for (let i = 1; i <= EDITS - 2; i++) await quickEntry(page, `Offline ${i}`);
	// An edit and a completion of rows the server already has.
	await row(page, "Rename me").click();
	await page
		.locator("main")
		.getByLabel("Title", { exact: true })
		.fill("Renamed offline");
	await page
		.locator("main")
		.getByLabel("Title", { exact: true })
		.press("Enter");
	await checkbox(page, "Offline 1").check();
	// A completion lingers for a moment before it is saved.
	await expect(row(page, "Offline 1")).toBeHidden();
	await expect(page.getByTestId("sync-status")).toContainText("will sync");

	await context.setOffline(false);
	await expectSynced(page);
	await expect(page.getByTestId("offline-indicator")).toBeHidden();

	// A fresh device sees exactly what was made offline.
	const other = await (await browser.newContext()).newPage();
	await signIn(other, email);
	await open(other, "/inbox");
	const titles = await rowTitles(other);
	const openTitles = Array.from(
		{ length: EDITS - 3 },
		(_, i) => `Offline ${i + 2}`,
	);
	for (const title of [...openTitles, "Renamed offline"])
		expect(titles.filter((t) => t === title).length, title).toBe(1);
	// 48 created (one then completed), plus the renamed one.
	expect(titles).toHaveLength(EDITS - 2);
	expect(titles).not.toContain("Rename me");
	await open(other, "/logbook");
	await expect(row(other, "Offline 1")).toBeVisible();
});
