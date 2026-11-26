import { expect, type Page, test } from "@playwright/test";
import {
	expectReady,
	expectSynced,
	open,
	PASSWORD,
	quickEntry,
	row,
	signUp,
} from "./helpers";

/** Opens the open to-do's Task Notes page (the card has no notes box). */
async function openTaskNotes(page: Page) {
	await expect(page.getByRole("textbox", { name: "Notes" })).toHaveCount(0);
	await page.getByRole("link", { name: "Open in Task Notes" }).click();
	await expect(page.getByRole("textbox", { name: "Task Notes" })).toBeVisible();
}

/** Writes a plan into a to-do's Task Notes page with Markdown shortcuts and the / menu. */
async function writePlan(page: Page) {
	const notes = page.getByRole("textbox", { name: "Task Notes" });
	await notes.click();
	await page.keyboard.type("# Plan");
	await page.keyboard.press("Enter");
	await page.keyboard.type("[ ] tape");
	await page.keyboard.press("Enter");
	await page.keyboard.type("boxes");
	await page.keyboard.press("Enter");
	await page.keyboard.press("Enter");
	await page.keyboard.type("/togg");
	const menu = page.getByRole("listbox", { name: "Insert a block" });
	await expect(menu.getByRole("option", { name: /^Toggle/ })).toBeVisible();
	await page.keyboard.press("Enter");
	await page.keyboard.type("Movers");
	await page.keyboard.press("Enter");
	await page.keyboard.type("Van at nine");
	await expect(notes.locator("h1")).toHaveText("Plan");
	await expect(notes.locator('ul[data-type="taskList"] li')).toHaveCount(2);
	await expect(notes.locator("[data-toggle]")).toContainText("Van at nine");
}

test("a to-do's notes are Task Notes: blocks, a full page, and search", async ({
	page,
}) => {
	await signUp(page);
	await open(page, "/inbox");
	await quickEntry(page, "Move flat");
	await row(page, "Move flat").click();
	await openTaskNotes(page);
	await writePlan(page);
	// Escape with the / menu open only closes the menu.
	await page.keyboard.press("Enter");
	await page.keyboard.type("/");
	await page.keyboard.press("Escape");
	await expect(
		page.getByRole("listbox", { name: "Insert a block" }),
	).toBeHidden();
	await page.keyboard.press("Backspace");
	// Notes save a moment after typing stops.
	await page.waitForTimeout(600);
	await expectSynced(page);
	await open(page, "/inbox");
	await expect(row(page, "Move flat").getByLabel("Has notes")).toBeVisible();

	// The Task Notes button opens it, and closes it again back to the Inbox.
	const notesButton = page.getByRole("button", { name: "Task Notes" });
	await notesButton.click();
	await expect(page.getByRole("heading", { name: "Task Notes" })).toBeVisible();
	await expect(notesButton).toHaveAttribute("aria-pressed", "true");
	await notesButton.click();
	await expect(page).toHaveURL(/\/inbox$/);
	await notesButton.click();
	await expect(page.getByRole("heading", { name: "Task Notes" })).toBeVisible();
	// It lists the to-do and searches the notes.
	const search = page.getByRole("searchbox", { name: "Search notes" });
	await search.fill("van nine");
	await expect(page.getByRole("link", { name: /Move flat/ })).toBeVisible();
	await search.fill("piano");
	await expect(page.getByText("No notes match.")).toBeVisible();
	await search.fill("tape");
	await page.getByRole("link", { name: /Move flat/ }).click();

	// Its full page keeps every block after a reload, and edits save.
	const pad = page.getByRole("textbox", { name: "Task Notes" });
	await expect(pad.locator("h1")).toHaveText("Plan");
	await pad.locator("p", { hasText: "Van at nine" }).click();
	await page.keyboard.press("End");
	await page.keyboard.type(" sharp");
	// Notes save a moment after typing stops.
	await page.waitForTimeout(600);
	await expectSynced(page);
	await page.reload();
	await expectReady(page);
	await expect(pad.locator("[data-toggle]")).toContainText("Van at nine sharp");
	await expect(pad.locator('ul[data-type="taskList"] li')).toHaveCount(2);

	// Quick Find finds words in notes, too, and opens Task Notes.
	await open(page, "/today");
	await page.keyboard.type("sharp");
	const find = page.getByRole("dialog");
	await expect(find.getByText("Move flat")).toBeVisible();
	await expect(find.getByText(/Van at nine sharp/)).toBeVisible();
	await page.keyboard.press("Escape");
	await page.keyboard.type("task notes");
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/notes$/);
});

test("Task Notes stay readable with encryption on", async ({ page }) => {
	await signUp(page);
	await page.goto("/settings");
	await page.getByRole("button", { name: "Turn on encryption…" }).click();
	await page.getByLabel("I've saved my recovery key somewhere safe.").check();
	await page.getByLabel("Your password").fill(PASSWORD);
	await page.getByRole("button", { name: "Turn on encryption" }).click();
	await expect(page.getByText("End-to-end encryption is on.")).toBeVisible();

	await open(page, "/inbox");
	await quickEntry(page, "Secret plan");
	await row(page, "Secret plan").click();
	await openTaskNotes(page);
	await writePlan(page);
	await page.waitForTimeout(600);
	await open(page, "/inbox");
	// Saved (encrypting first takes a moment) before leaving the page.
	await expect(row(page, "Secret plan").getByLabel("Has notes")).toBeVisible();
	await expectSynced(page);

	// The server only has envelopes.
	const res = await page.request.get("/api/sync/pull?since=0&limit=500");
	const body = await res.text();
	expect(body).not.toContain("Van at nine");
	expect(body).not.toContain("Plan");

	await page.goto("/notes");
	await expectReady(page);
	await page.getByRole("searchbox", { name: "Search notes" }).fill("nine");
	await page.getByRole("link", { name: /Secret plan/ }).click();
	await expect(
		page.getByRole("textbox", { name: "Task Notes" }).locator("h1"),
	).toHaveText("Plan");
});

/** The open checklist's item texts, in order. */
function checklistTitles(page: Page) {
	return page
		.getByRole("list", { name: "Checklist" })
		.getByRole("textbox", { name: "Checklist item" });
}

/** Checks the checklist on screen reads `titles`, in order. */
async function expectItems(page: Page, titles: string[]) {
	await expect
		.poll(() =>
			checklistTitles(page).evaluateAll((els) =>
				els.map((el) => (el as HTMLTextAreaElement).value),
			),
		)
		.toEqual(titles);
}

/** Drags a checklist item by its handle onto another item's place. */
async function dragItem(page: Page, from: string, onto: string) {
	const handle = page.getByRole("button", { name: `Move: ${from}` });
	const target = page
		.getByRole("list", { name: "Checklist" })
		.getByRole("listitem")
		.filter({ has: page.getByRole("button", { name: `Move: ${onto}` }) });
	await handle.hover();
	const a = await handle.boundingBox();
	const b = await target.boundingBox();
	if (!a || !b) throw new Error("not on screen");
	await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
	await page.mouse.down();
	const y = b.y + b.height / 2;
	for (let i = 1; i <= 8; i++)
		await page.mouse.move(a.x + a.width / 2, a.y + ((y - a.y) * i) / 8);
	await page.mouse.up();
	// dnd-kit ignores clicks for a moment after a drop; people never click that fast.
	await page.waitForTimeout(100);
}

test("checklist items reorder, and Task Notes shows them above the notes", async ({
	page,
}) => {
	await signUp(page);
	await open(page, "/inbox");
	await quickEntry(page, "Pack");
	await row(page, "Pack").click();
	await page.getByRole("button", { name: "Add checklist" }).click();
	for (const [i, item] of ["Books", "Plates", "Lamps"].entries()) {
		if (i > 0) await page.keyboard.press("Enter");
		await expect(checklistTitles(page).nth(i)).toBeFocused();
		await page.keyboard.type(item);
	}
	const items = checklistTitles(page);
	await expectItems(page, ["Books", "Plates", "Lamps"]);

	// Dragging by the handle.
	await dragItem(page, "Lamps", "Books");
	await expectItems(page, ["Lamps", "Books", "Plates"]);
	// ⌘↓ / Ctrl+↓ while typing in an item.
	await items.nth(0).click();
	await page.keyboard.press("ControlOrMeta+ArrowDown");
	await expectItems(page, ["Books", "Lamps", "Plates"]);
	await expect(items.nth(1)).toBeFocused();
	await page.keyboard.press("Escape");
	await expectSynced(page);

	// The order is kept after a reload.
	await page.reload();
	await expectReady(page);
	await row(page, "Pack").click();
	await expectItems(page, ["Books", "Lamps", "Plates"]);
	await items.nth(0).click();
	await page.getByRole("link", { name: "Open in Task Notes" }).click();

	// Task Notes: the checklist sits above the notes, apart from them.
	const section = page.getByRole("region", { name: /Checklist/ });
	await expect(section).toContainText("0 of 3");
	await expectItems(page, ["Books", "Lamps", "Plates"]);
	const pad = page.getByRole("textbox", { name: "Task Notes" });
	const listBox = await section.boundingBox();
	const padBox = await pad.boundingBox();
	expect(listBox && padBox && listBox.y < padBox.y).toBe(true);
	await expect(pad).not.toContainText("Books");

	const books = page.getByRole("checkbox", { name: "Done: Books" });
	await books.click();
	await expect(books).toBeChecked();
	await expect(section).toContainText("1 of 3");
	await dragItem(page, "Plates", "Books");
	await expectItems(page, ["Plates", "Books", "Lamps"]);
	await page.getByRole("button", { name: "+ Add item" }).click();
	await expect(items.nth(3)).toBeFocused();
	await page.keyboard.type("Rugs");
	await page.keyboard.press("Tab");
	await expectItems(page, ["Plates", "Books", "Lamps", "Rugs"]);
	await expectSynced(page);

	// Back in the list, the card has the same checklist.
	await open(page, "/inbox");
	await row(page, "Pack").click();
	await expectItems(page, ["Plates", "Books", "Lamps", "Rugs"]);
});
