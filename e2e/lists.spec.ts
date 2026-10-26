import { expect, type Locator, type Page, test } from "@playwright/test";
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

/** Drags one element onto another with the mouse (past dnd-kit's 6px threshold). */
async function dragBox(page: Page, from: Locator, to: Locator) {
	const source = await from.boundingBox();
	const target = await to.boundingBox();
	if (!source || !target) throw new Error("not visible");
	await page.mouse.move(source.x + 40, source.y + source.height / 2);
	await page.mouse.down();
	await page.mouse.move(source.x + 40, source.y + source.height / 2 - 10, {
		steps: 5,
	});
	await page.mouse.move(target.x + 40, target.y + 4, { steps: 15 });
	await page.mouse.up();
}

/** Drags a row onto another. */
const drag = (page: Page, from: string, to: string) =>
	dragBox(page, row(page, from), row(page, to));

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

test("areas, projects outside areas, and projects within an area reorder in the sidebar and stay put", async ({
	page,
}) => {
	await signUp(page);
	const sidebar = page.getByRole("navigation", { name: "Lists" });
	const link = (name: string) => sidebar.getByRole("link", { name });
	/** Areas and projects in sidebar order. */
	const order = () =>
		sidebar
			.getByRole("link")
			.evaluateAll((links) =>
				links
					.map((a) => a.textContent?.trim() ?? "")
					.filter((t) => /^(Area|Loose|In) /.test(t)),
			);

	for (const title of ["Loose 1", "Loose 2"]) {
		await page.goto("/today");
		await newList(page, "New Project");
		await typeTitle(page, "New Project", title);
		await expect(link(title)).toBeVisible();
	}
	for (const area of ["Area A", "Area B"]) {
		await newList(page, "New Area");
		await typeTitle(page, "New Area", area);
		await expect(link(area)).toBeVisible();
	}
	// New projects from an area's page go into that area.
	for (const title of ["In B 1", "In B 2"]) {
		await link("Area B").click();
		await newList(page, "New Project");
		await typeTitle(page, "New Project", title);
		await expect(link(title)).toBeVisible();
	}
	await expect
		.poll(order)
		.toEqual(["Loose 1", "Loose 2", "Area A", "Area B", "In B 1", "In B 2"]);

	await dragBox(page, link("Loose 2"), link("Loose 1"));
	await expect
		.poll(order)
		.toEqual(["Loose 2", "Loose 1", "Area A", "Area B", "In B 1", "In B 2"]);
	// An area moves with its projects.
	await dragBox(page, link("Area B"), link("Area A"));
	await expect
		.poll(order)
		.toEqual(["Loose 2", "Loose 1", "Area B", "In B 1", "In B 2", "Area A"]);
	await dragBox(page, link("In B 2"), link("In B 1"));
	const moved = ["Loose 2", "Loose 1", "Area B", "In B 2", "In B 1", "Area A"];
	await expect.poll(order).toEqual(moved);
	await expectSynced(page);

	await page.reload();
	await expect(link("Area A")).toBeVisible();
	expect(await order()).toEqual(moved);
});

test("an area's projects can be hidden in the sidebar, stay hidden, and show again when one is opened", async ({
	page,
}) => {
	await signUp(page);
	const sidebar = page.getByRole("navigation", { name: "Lists" });
	await newList(page, "New Area");
	await typeTitle(page, "New Area", "Home");
	for (const title of ["Garden", "Move"]) {
		await sidebar.getByRole("link", { name: "Home" }).click();
		await newList(page, "New Project");
		await typeTitle(page, "New Project", title);
		await expect(sidebar.getByRole("link", { name: title })).toBeVisible();
	}

	await page.goto("/today");
	await sidebar.getByRole("button", { name: "Hide projects in Home" }).click();
	await expect(sidebar.getByRole("link", { name: "Garden" })).toBeHidden();
	await expect(
		sidebar.getByRole("link", { name: "Home (2 hidden projects)" }),
	).toBeVisible();
	// The arrow doesn't open the area.
	await expect(page).toHaveURL(/\/today$/);
	await expectSynced(page);

	await page.reload();
	const show = sidebar.getByRole("button", { name: "Show projects in Home" });
	await expect(show).toHaveAttribute("aria-expanded", "false");
	await expect(sidebar.getByRole("link", { name: "Garden" })).toBeHidden();

	// Opening one of its projects opens the area.
	await sidebar.getByRole("link", { name: /^Home/ }).click();
	await page.locator("main").getByRole("link", { name: "Garden" }).click();
	await expect(sidebar.getByRole("link", { name: "Garden" })).toBeVisible();
	await expect(
		sidebar.getByRole("button", { name: "Hide projects in Home" }),
	).toHaveAttribute("aria-expanded", "true");
});
