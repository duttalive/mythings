import { expect, test } from "@playwright/test";
import { checkbox, open, quickEntry, row, signIn, signUp } from "./helpers";

test("a change on one device shows up on another within 2s", async ({
	browser,
}) => {
	const a = await (await browser.newContext()).newPage();
	const b = await (await browser.newContext()).newPage();
	const email = await signUp(a);
	await signIn(b, email);
	await open(b, "/inbox");
	await expect(b.getByTestId("sync-status")).toHaveAttribute(
		"data-live",
		"true",
	);

	await open(a, "/inbox");
	await quickEntry(a, "From device A");
	await expect(row(b, "From device A")).toBeVisible({ timeout: 2_000 });

	// And back: completing it on B clears it from A's Inbox.
	await checkbox(b, "From device A").check();
	await expect(row(a, "From device A")).toBeHidden({ timeout: 4_000 });
});
