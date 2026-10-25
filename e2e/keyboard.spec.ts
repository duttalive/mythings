import { expect, test } from "@playwright/test";
import { expectSynced, row, rowTitles, signUp } from "./helpers";

test("keyboard-only: create, edit, schedule, reorder, complete, undo, navigate", async ({
	page,
}) => {
	await signUp(page);
	await page.keyboard.press("g");
	await page.keyboard.press("i");
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Inbox");

	// Space makes a to-do and opens it; Enter closes it. Three of them.
	for (const title of ["First", "Second", "Third"]) {
		await page.keyboard.press("Space");
		await expect(
			page.locator("main").getByLabel("Title", { exact: true }),
		).toBeFocused();
		await page.keyboard.type(title);
		await page.keyboard.press("Enter");
		await expect(row(page, title)).toBeVisible();
	}
	expect(await rowTitles(page)).toEqual(["First", "Second", "Third"]);

	// The new to-do stays selected; ⌘↑ moves it up.
	await expect(row(page, "Third")).toHaveAttribute("aria-current", "true");
	await page.keyboard.press("ControlOrMeta+ArrowUp");
	await expect
		.poll(() => rowTitles(page))
		.toEqual(["First", "Third", "Second"]);

	// Enter opens the selected to-do; add notes; Escape closes.
	await page.keyboard.press("Enter");
	await page.keyboard.press("Tab");
	await page.keyboard.type("Some notes");
	await page.keyboard.press("Escape");
	await expect(
		row(page, "Third").getByRole("img", { name: "Has notes" }),
	).toBeVisible();

	// ⌥T schedules it for Today: it leaves the Inbox.
	await expect(row(page, "Third")).toBeFocused();
	await page.keyboard.press("Alt+T");
	await expect(row(page, "Third")).toBeHidden();

	// Arrow keys select; ⌘K completes; ⌘Z undoes.
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowUp");
	await expect(row(page, "First")).toHaveAttribute("aria-current", "true");
	await page.keyboard.press("ControlOrMeta+K");
	await expect(row(page, "First")).toBeHidden();
	await page.keyboard.press("ControlOrMeta+Z");
	await expect(row(page, "First")).toBeVisible();

	// Quick Find by typing, then Enter goes there.
	await page.keyboard.press("t");
	await page.keyboard.type("oday");
	await page.keyboard.press("Enter");
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Today");
	await expect(row(page, "Third")).toBeVisible();

	// Help and Settings are reachable too.
	await page.keyboard.press("?");
	await expect(page.getByRole("dialog", { name: /shortcuts/i })).toBeVisible();
	await page.keyboard.press("Escape");
	await page.keyboard.press("ControlOrMeta+Comma");
	await expect(page.getByRole("heading", { level: 1 })).toContainText(
		"Settings",
	);
	await expectSynced(page);
});
