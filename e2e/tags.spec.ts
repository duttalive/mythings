import { expect, test } from "@playwright/test";
import { expectSynced, open, quickEntry, row, signUp } from "./helpers";

test("rename a tag, give it a shortcut and a parent, use the shortcut, delete with undo", async ({
	page,
}) => {
	await signUp(page);
	await open(page, "/inbox");
	await quickEntry(page, "Buy milk #shop");
	await quickEntry(page, "Plan week #work");
	const sidebar = page.getByRole("navigation", { name: "Lists" });

	// Rename "shop" and give it the key "s".
	await sidebar.getByRole("link", { name: "shop" }).click();
	const name = page.getByLabel("Tag name");
	await name.fill("shopping");
	await name.press("Enter");
	await expect(sidebar.getByRole("link", { name: "shopping" })).toBeVisible();
	await page.getByRole("button", { name: "Tag actions" }).click();
	await page.getByLabel("Shortcut key").fill("s");
	await page.getByLabel("Inside").selectOption({ label: "work" });
	await page.keyboard.press("Escape");
	await expect(page.locator("main")).toContainText("Shortcut s");
	await expect(
		page.locator("main").getByRole("link", { name: "↑ work" }),
	).toBeVisible();

	// In a to-do's tag list, pressing "s" toggles the tag.
	await open(page, "/inbox");
	await row(page, "Plan week").click();
	await page.keyboard.press("ControlOrMeta+Shift+T");
	const picker = page.getByRole("dialog", { name: "Tags" });
	await expect(picker.getByLabel("Find or create a tag")).toBeFocused();
	await page.keyboard.press("s");
	await expect(
		picker.getByRole("menuitemcheckbox", { name: /shopping/ }),
	).toHaveAttribute("aria-checked", "true");
	await expect(picker.getByLabel("Find or create a tag")).toHaveValue("");
	await page.keyboard.press("Escape");
	await expect(picker).toBeHidden();
	await page.keyboard.press("Escape");
	await expect(row(page, "Plan week")).toContainText("shopping");

	// Deleting a tag can be undone.
	await page
		.getByRole("navigation", { name: "Lists" })
		.getByRole("link", { name: "work" })
		.click();
	await page.getByRole("button", { name: "Tag actions" }).click();
	await page.getByRole("button", { name: "Delete Tag" }).click();
	await expect(sidebar.getByRole("link", { name: "work" })).toBeHidden();
	await page.getByRole("button", { name: "Undo" }).click();
	await expect(sidebar.getByRole("link", { name: "work" })).toBeVisible();
	await expectSynced(page);
});
