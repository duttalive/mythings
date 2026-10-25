import { expect, test } from "@playwright/test";
import { open, quickEntry, row, signIn, signUp } from "./helpers";

test("changes left offline are sent by the service worker after the app is closed", async ({
	browser,
}) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	const email = await signUp(page);
	await open(page, "/inbox");
	await expect
		.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
		.toBe(true);

	await context.setOffline(true);
	await expect(page.getByTestId("offline-indicator")).toBeVisible();
	await quickEntry(page, "Sent in the background");
	await expect(page.getByTestId("sync-status")).toContainText("will sync");

	// Close the app (leave its origin), then come back online: Chrome fires the
	// Background Sync registration and the service worker sends the change.
	await page.goto("about:blank");
	await context.setOffline(false);

	// Another device sees it, though the app never reopened.
	const other = await (await browser.newContext()).newPage();
	await signIn(other, email);
	await open(other, "/inbox");
	await expect(row(other, "Sent in the background")).toBeVisible({
		timeout: 10_000,
	});
});
