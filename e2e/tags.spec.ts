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
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Delete Tag" })
		.click();
	await expect(sidebar.getByRole("link", { name: "work" })).toBeHidden();
	await page.getByRole("button", { name: "Undo" }).click();
	await expect(sidebar.getByRole("link", { name: "work" })).toBeVisible();
	await expectSynced(page);
});

test("tags can be added from the sidebar, one after another, without duplicates", async ({
	page,
}) => {
	await signUp(page);
	const sidebar = page.getByRole("navigation", { name: "Lists" });
	// The + is there even before there are any tags.
	await sidebar.getByRole("button", { name: "New tag" }).click();
	const field = sidebar.getByLabel("New tag name");
	await field.fill("home");
	await field.press("Enter");
	await field.fill("garden");
	await field.press("Enter");
	await expect(sidebar.getByRole("link", { name: "home" })).toBeVisible();
	await expect(sidebar.getByRole("link", { name: "garden" })).toBeVisible();

	await field.fill("Home");
	await field.press("Enter");
	await expect(sidebar.getByRole("alert")).toHaveText(
		"“Home” is already a tag.",
	);
	await field.press("Escape");
	await expect(field).toBeHidden();
	await expect(sidebar.getByRole("link", { name: /home/i })).toHaveCount(1);
	await expectSynced(page);
});

test("the Delete key asks before moving selected to-dos to Trash", async ({
	page,
}) => {
	await signUp(page);
	await open(page, "/inbox");
	await quickEntry(page, "First");
	await quickEntry(page, "Second");
	await row(page, "First").click({ modifiers: ["ControlOrMeta"] });
	await row(page, "Second").click({ modifiers: ["ControlOrMeta"] });
	await page.keyboard.press("Delete");
	const dialog = page.getByRole("alertdialog");
	await expect(dialog).toContainText("Delete 2 to-dos?");
	await dialog.getByRole("button", { name: "Cancel" }).click();
	await expect(row(page, "First")).toBeVisible();

	await page.keyboard.press("Delete");
	await dialog.getByRole("button", { name: "Move to Trash" }).click();
	await expect(row(page, "First")).toBeHidden();
	await expect(row(page, "Second")).toBeHidden();
});
