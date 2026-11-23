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

/** Writes a plan into the open to-do's notes with Markdown shortcuts and the / menu. */
async function writePlan(page: Page) {
	const notes = page.getByRole("textbox", { name: "Notes" });
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

test("a to-do's notes are a Scratch Pad: blocks, a full page, and search", async ({
	page,
}) => {
	await signUp(page);
	await open(page, "/inbox");
	await quickEntry(page, "Move flat");
	await row(page, "Move flat").click();
	await writePlan(page);
	// Escape with the / menu open only closes the menu.
	await page.keyboard.press("Enter");
	await page.keyboard.type("/");
	await page.keyboard.press("Escape");
	await expect(
		page.getByRole("listbox", { name: "Insert a block" }),
	).toBeHidden();
	await expect(page.getByRole("textbox", { name: "Notes" })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(page.getByRole("textbox", { name: "Notes" })).toBeHidden();
	await expectSynced(page);

	// The Scratch Pad tab lists it and searches the notes.
	await page.getByRole("link", { name: "Scratch Pad" }).click();
	await expect(
		page.getByRole("heading", { name: "Scratch Pad" }),
	).toBeVisible();
	const search = page.getByRole("searchbox", { name: "Search notes" });
	await search.fill("van nine");
	await expect(page.getByRole("link", { name: /Move flat/ })).toBeVisible();
	await search.fill("piano");
	await expect(page.getByText("No notes match.")).toBeVisible();
	await search.fill("tape");
	await page.getByRole("link", { name: /Move flat/ }).click();

	// Its full page keeps every block after a reload, and edits save.
	const pad = page.getByRole("textbox", { name: "Scratch Pad" });
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

	// Quick Find finds words in notes, too, and opens the Scratch Pad.
	await open(page, "/today");
	await page.keyboard.type("sharp");
	const find = page.getByRole("dialog");
	await expect(find.getByText("Move flat")).toBeVisible();
	await expect(find.getByText(/Van at nine sharp/)).toBeVisible();
	await page.keyboard.press("Escape");
	await page.keyboard.type("scratch");
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/\/scratch$/);
});

test("Scratch Pad notes stay readable with encryption on", async ({ page }) => {
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
	await writePlan(page);
	await page.keyboard.press("Escape");
	await page.keyboard.press("Escape");
	await expectSynced(page);

	// The server only has envelopes.
	const res = await page.request.get("/api/sync/pull?since=0&limit=500");
	const body = await res.text();
	expect(body).not.toContain("Van at nine");
	expect(body).not.toContain("Plan");

	await page.goto("/scratch");
	await expectReady(page);
	await page.getByRole("searchbox", { name: "Search notes" }).fill("nine");
	await page.getByRole("link", { name: /Secret plan/ }).click();
	await expect(
		page.getByRole("textbox", { name: "Scratch Pad" }).locator("h1"),
	).toHaveText("Plan");
});
