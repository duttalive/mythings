import { expect, test } from "@playwright/test";
import {
	checkbox,
	expectSynced,
	open,
	quickEntry,
	row,
	signUp,
} from "./helpers";

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

test("nested tags show in the sidebar, can be hidden, and open again when one is visited", async ({
	page,
}) => {
	await signUp(page);
	const sidebar = page.getByRole("navigation", { name: "Lists" });
	await sidebar.getByRole("button", { name: "New tag" }).click();
	const field = sidebar.getByLabel("New tag name");
	for (const name of ["errands", "shop", "hardware"]) {
		await field.fill(name);
		await field.press("Enter");
	}
	await field.press("Escape");
	// shop goes inside errands, hardware inside shop.
	for (const [child, parent] of [
		["shop", "errands"],
		["hardware", "shop"],
	] as const) {
		await sidebar.getByRole("link", { name: child, exact: true }).click();
		await page.getByRole("button", { name: "Tag actions" }).click();
		await page.getByLabel("Inside").selectOption({ label: parent });
		await page.keyboard.press("Escape");
	}
	await expect(
		sidebar.getByRole("button", { name: "Hide tags in errands" }),
	).toHaveAttribute("aria-expanded", "true");
	await expect(
		sidebar.getByRole("link", { name: "hardware", exact: true }),
	).toBeVisible();

	await open(page, "/today");
	await sidebar.getByRole("button", { name: "Hide tags in errands" }).click();
	await expect(
		sidebar.getByRole("link", { name: "shop", exact: true }),
	).toBeHidden();
	await expect(
		sidebar.getByRole("link", { name: "errands (2 hidden tags)" }),
	).toBeVisible();
	await expect(page).toHaveURL(/\/today$/);
	await expectSynced(page);

	await page.reload();
	await expect(
		sidebar.getByRole("button", { name: "Show tags in errands" }),
	).toHaveAttribute("aria-expanded", "false");

	// Visiting a nested tag opens what hides it.
	await sidebar.getByRole("link", { name: /^errands/ }).click();
	await page.locator("main").getByRole("link", { name: "shop" }).click();
	await page.locator("main").getByRole("link", { name: "hardware" }).click();
	await expect(
		sidebar.getByRole("link", { name: "hardware", exact: true }),
	).toBeVisible();
	await expect(
		sidebar.getByRole("button", { name: "Hide tags in errands" }),
	).toHaveAttribute("aria-expanded", "true");
});

test("a tag's page shows its nested tags' items and its logged items", async ({
	page,
}) => {
	await signUp(page);
	await open(page, "/inbox");
	await quickEntry(page, "Buy nails #hardware");
	await quickEntry(page, "Return book #errands");
	const sidebar = page.getByRole("navigation", { name: "Lists" });
	await sidebar.getByRole("link", { name: "hardware", exact: true }).click();
	await page.getByRole("button", { name: "Tag actions" }).click();
	await page.getByLabel("Inside").selectOption({ label: "errands" });
	await page.keyboard.press("Escape");

	await sidebar.getByRole("link", { name: "errands", exact: true }).click();
	await expect(row(page, "Buy nails")).toBeVisible();
	await checkbox(page, "Return book").check();
	await expect(row(page, "Return book")).toBeHidden();
	await page.getByRole("button", { name: "Show 1 logged item" }).click();
	await expect(
		page.getByRole("list", { name: "Logged items" }).getByText("Return book"),
	).toBeVisible();
});

test("tags can be nested, reordered and deleted from the sidebar", async ({
	page,
}) => {
	await signUp(page);
	await open(page, "/inbox");
	const sidebar = page.getByRole("navigation", { name: "Lists" });
	await sidebar.getByRole("button", { name: "New tag" }).click();
	const field = sidebar.getByLabel("New tag name");
	for (const name of ["work", "home", "calls"]) {
		await field.fill(name);
		await field.press("Enter");
		await expect(sidebar.getByRole("link", { name })).toBeVisible();
	}
	await field.press("Escape");
	const link = (name: string) => sidebar.getByRole("link", { name });
	const tagNames = () => sidebar.locator('a[href^="/tag/"]').allTextContents();

	/** Drags one sidebar tag to a spot on another: its top edge, middle or bottom edge. */
	async function dragTag(from: string, to: string, at: "top" | "middle") {
		const source = await link(from).boundingBox();
		const target = await link(to).boundingBox();
		if (!source || !target) throw new Error("not visible");
		await page.mouse.move(source.x + 30, source.y + source.height / 2);
		await page.mouse.down();
		await page.mouse.move(source.x + 30, source.y + source.height / 2 - 10, {
			steps: 5,
		});
		const y = at === "top" ? target.y + 2 : target.y + target.height / 2;
		await page.mouse.move(target.x + 30, y, { steps: 15 });
		await page.mouse.up();
	}

	// Onto the middle of "work": "calls" is nested inside it.
	await dragTag("calls", "work", "middle");
	await expect(
		sidebar.getByRole("button", { name: "Hide tags in work" }),
	).toBeVisible();
	await expect.poll(tagNames).toEqual(["work", "calls", "home"]);

	// Onto the top edge of "work": "home" moves above it.
	await dragTag("home", "work", "top");
	await expect.poll(tagNames).toEqual(["home", "work", "calls"]);

	// Order and nesting are saved.
	await expectSynced(page);
	await page.reload();
	await expect.poll(tagNames).toEqual(["home", "work", "calls"]);

	// Right-click → Delete Tag… removes "work" and the tag inside it.
	await link("work").click({ button: "right" });
	await page.getByRole("button", { name: "Delete Tag…" }).click();
	const dialog = page.getByRole("alertdialog");
	await expect(dialog).toContainText("1 tag inside it goes too.");
	await dialog.getByRole("button", { name: "Delete Tag" }).click();
	await expect.poll(tagNames).toEqual(["home"]);
});
