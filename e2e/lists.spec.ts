import { expect, type Page, test } from "@playwright/test";
import { expectSynced, row, rowTitles, signUp } from "./helpers";

async function newList(page: Page, kind: "New Project" | "New Area") {
	await page.getByRole("button", { name: "New List" }).click();
	await page.getByRole("button", { name: new RegExp(`^${kind}`) }).click();
}

/** Types into the field that just took focus (a new list's or heading's title). */
async function typeTitle(page: Page, placeholder: string, title: string) {
	const field = page.locator(`[placeholder="${placeholder}"]:focus`);
	await expect(field).toBeVisible();
	await field.fill(title);
	await field.press("Enter");
}

async function addTodo(page: Page, title: string) {
	await page.getByRole("button", { name: "New To-Do" }).click();
	const input = page.locator("main").getByLabel("Title", { exact: true });
	await expect(input).toBeFocused();
	await input.fill(title);
	await input.press("Enter");
	await expect(row(page, title)).toBeVisible();
}

/** Drags a row onto another with the mouse (past dnd-kit's 6px threshold). */
async function drag(page: Page, from: string, to: string) {
	const source = await row(page, from).boundingBox();
	const target = await row(page, to).boundingBox();
	if (!source || !target) throw new Error("rows not visible");
	await page.mouse.move(source.x + 40, source.y + source.height / 2);
	await page.mouse.down();
	await page.mouse.move(source.x + 40, source.y + source.height / 2 - 10, {
		steps: 5,
	});
	await page.mouse.move(target.x + 40, target.y + 4, { steps: 15 });
	await page.mouse.up();
}

test("area → project → heading → to-dos; reorder by dragging survives a reload", async ({
	page,
}) => {
	await signUp(page);

	await newList(page, "New Area");
	await typeTitle(page, "New Area", "Home");
	await expect(page.getByRole("heading", { level: 1 })).toContainText("Home");

	await newList(page, "New Project");
	await typeTitle(page, "New Project", "Move apartments");
	await expect(page.getByRole("heading", { level: 1 })).toContainText(
		"Move apartments",
	);

	for (const title of ["Book movers", "Pack books", "Cancel internet"])
		await addTodo(page, title);
	expect(await rowTitles(page)).toEqual([
		"Book movers",
		"Pack books",
		"Cancel internet",
	]);

	// A heading, from the keyboard.
	await page.locator("body").click({ position: { x: 5, y: 300 } });
	await page.keyboard.press("Alt+Shift+N");
	await typeTitle(page, "New Heading", "Packing");
	await expect(page.getByRole("region", { name: "Packing" })).toBeVisible();

	// The project sits under its area in the sidebar.
	const sidebar = page.getByRole("navigation", { name: "Lists" });
	await expect(sidebar.getByRole("link", { name: "Home" })).toBeVisible();
	await expect(
		sidebar.getByRole("link", { name: "Move apartments" }),
	).toBeVisible();

	await drag(page, "Cancel internet", "Book movers");
	await expect
		.poll(() => rowTitles(page))
		.toEqual(["Cancel internet", "Book movers", "Pack books"]);
	await expectSynced(page);

	await page.reload();
	await expect(page.getByRole("heading", { level: 1 })).toContainText(
		"Move apartments",
	);
	expect(await rowTitles(page)).toEqual([
		"Cancel internet",
		"Book movers",
		"Pack books",
	]);
	await expect(page.getByRole("region", { name: "Packing" })).toBeVisible();
});
