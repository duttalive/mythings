import { expect, type Locator, type Page, test } from "@playwright/test";
import { checkbox, expectSynced, row, rowTitles, signUp } from "./helpers";

async function newList(
	page: Page,
	kind: "New Project" | "New Area" | "New Life Bucket",
) {
	await page.getByRole("button", { name: "New List" }).click();
	await page
		.locator("[data-popover-content]")
		.getByRole("button", { name: new RegExp(`^${kind}`) })
		.click();
	// With more than one Life Bucket it asks which; Enter takes the first
	// (the one on screen, if any).
	if (kind !== "New Life Bucket") {
		const step = page.getByText(/in which Life Bucket\?$/);
		if (await step.isVisible().catch(() => false))
			await page.keyboard.press("Enter");
	}
}

/** Types into the field that just took focus (a new list's or heading's title). */
async function typeTitle(page: Page, placeholder: string, title: string) {
	const field = page.locator(`[placeholder="${placeholder}"]:focus`);
	await expect(field).toBeVisible();
	await field.fill(title);
	await field.press("Enter");
}

async function addTodo(page: Page, title: string) {
	await page.getByRole("button", { name: "New Task" }).click();
	const input = page.locator("main").getByLabel("Title", { exact: true });
	await expect(input).toBeFocused();
	await input.fill(title);
	await input.press("Enter");
	await expect(row(page, title)).toBeVisible();
}

/** Drags one element onto another with the mouse (past dnd-kit's 6px threshold). */
async function dragBox(
	page: Page,
	from: Locator,
	to: Locator,
	at: "top" | "middle" = "top",
) {
	const source = await from.boundingBox();
	const target = await to.boundingBox();
	if (!source || !target) throw new Error("not visible");
	await page.mouse.move(source.x + 40, source.y + source.height / 2);
	await page.mouse.down();
	await page.mouse.move(source.x + 40, source.y + source.height / 2 - 10, {
		steps: 5,
	});
	const y = at === "top" ? target.y + 4 : target.y + target.height / 2;
	await page.mouse.move(target.x + 40, y, { steps: 15 });
	await page.mouse.up();
}

/** Drags a row onto another. */
const drag = (page: Page, from: string, to: string) =>
	dragBox(page, row(page, from), row(page, to));

test("area and project → heading → to-dos; reorder by dragging survives a reload", async ({
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

	// The area and project sit in a Life Bucket in the sidebar.
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

test("Life Buckets, their areas and their projects reorder in the sidebar and stay put", async ({
	page,
}) => {
	await signUp(page);
	const sidebar = page.getByRole("navigation", { name: "Lists" });
	const link = (name: string) => sidebar.getByRole("link", { name });
	const names = ["Personal", "Solo", "Work", "Admin", "W1", "W2"];
	/** Buckets, areas and projects in sidebar order. */
	const order = () =>
		sidebar
			.getByRole("link")
			.evaluateAll(
				(links, wanted) =>
					links
						.map((a) => a.textContent?.trim() ?? "")
						.filter((t) => wanted.includes(t)),
				names,
			);

	// The first project of a new account goes into a "Personal" Life Bucket.
	await newList(page, "New Project");
	await typeTitle(page, "New Project", "Solo");
	await expect(link("Personal")).toBeVisible();

	await newList(page, "New Life Bucket");
	await typeTitle(page, "New Life Bucket", "Work");
	// New lists made on a Life Bucket's page go into it.
	for (const title of ["W1", "W2"]) {
		await link("Work").click();
		await newList(page, "New Project");
		await typeTitle(page, "New Project", title);
		await expect(link(title)).toBeVisible();
	}
	await link("Work").click();
	await newList(page, "New Area");
	await typeTitle(page, "New Area", "Admin");
	await expect
		.poll(order)
		.toEqual(["Personal", "Solo", "Work", "Admin", "W1", "W2"]);

	// Let the new area finish sliding in before dragging past it.
	await page.waitForTimeout(400);
	await dragBox(page, link("W2"), link("W1"));
	await expect
		.poll(order)
		.toEqual(["Personal", "Solo", "Work", "Admin", "W2", "W1"]);
	// A Life Bucket moves with everything in it.
	await page.waitForTimeout(400);
	await dragBox(page, link("Work"), link("Personal"));
	await expect
		.poll(order)
		.toEqual(["Work", "Admin", "W2", "W1", "Personal", "Solo"]);
	// A project dropped on another Life Bucket moves into it, last. (Let the
	// sidebar finish sliding into place first, so the drop lands where aimed.)
	await page.waitForTimeout(400);
	await dragBox(page, link("Solo"), link("Work"), "middle");
	const moved = ["Work", "Admin", "W2", "W1", "Solo", "Personal"];
	await expect.poll(order).toEqual(moved);
	await expectSynced(page);

	await page.reload();
	await expect(link("Admin")).toBeVisible();
	expect(await order()).toEqual(moved);
});

test("a Life Bucket's lists can be hidden in the sidebar, stay hidden, and show again when one is opened", async ({
	page,
}) => {
	await signUp(page);
	const sidebar = page.getByRole("navigation", { name: "Lists" });
	await newList(page, "New Life Bucket");
	await typeTitle(page, "New Life Bucket", "Home");
	for (const title of ["Garden", "Move"]) {
		await sidebar.getByRole("link", { name: "Home" }).click();
		await newList(page, "New Project");
		await typeTitle(page, "New Project", title);
		await expect(sidebar.getByRole("link", { name: title })).toBeVisible();
	}

	await page.goto("/today");
	await sidebar
		.getByRole("button", { name: "Hide areas and projects in Home" })
		.click();
	await expect(sidebar.getByRole("link", { name: "Garden" })).toBeHidden();
	await expect(
		sidebar.getByRole("link", { name: "Home (2 hidden lists)" }),
	).toBeVisible();
	// The arrow doesn't open the bucket.
	await expect(page).toHaveURL(/\/today$/);
	await expectSynced(page);

	await page.reload();
	const show = sidebar.getByRole("button", {
		name: "Show areas and projects in Home",
	});
	await expect(show).toHaveAttribute("aria-expanded", "false");
	await expect(sidebar.getByRole("link", { name: "Garden" })).toBeHidden();

	// Opening one of its projects opens the bucket.
	await sidebar.getByRole("link", { name: /^Home/ }).click();
	await page.locator("main").getByRole("link", { name: "Garden" }).click();
	await expect(sidebar.getByRole("link", { name: "Garden" })).toBeVisible();
	await expect(
		sidebar.getByRole("button", { name: "Hide areas and projects in Home" }),
	).toHaveAttribute("aria-expanded", "true");
});

test("headings reorder by dragging and from their menu, and stay put", async ({
	page,
}) => {
	await signUp(page);
	await newList(page, "New Project");
	await typeTitle(page, "New Project", "Trip");
	const main = page.locator("main");
	for (const title of ["Before", "During", "After"]) {
		await page.keyboard.press("Alt+Shift+N");
		await typeTitle(page, "New Heading", title);
		await expect(main.getByRole("region", { name: title })).toBeVisible();
	}
	const order = () =>
		main
			.getByRole("region")
			.evaluateAll((sections) =>
				sections
					.map((s) => s.getAttribute("aria-labelledby"))
					.map((id) => (id && document.getElementById(id)?.textContent) || ""),
			);
	await expect.poll(order).toEqual(["Before", "During", "After"]);

	// Drag "After" by its title bar above "Before".
	const bar = (title: string) =>
		main.getByRole("region", { name: title }).locator("> div").first();
	await dragBox(page, bar("After"), bar("Before"));
	await expect.poll(order).toEqual(["After", "Before", "During"]);

	// Move Down from the menu.
	await main.getByRole("button", { name: "Actions for After" }).click();
	await page.getByRole("button", { name: "Move Down" }).click();
	await expect.poll(order).toEqual(["Before", "After", "During"]);
	// The first heading can't move up, the last can't move down.
	await main.getByRole("button", { name: "Actions for During" }).click();
	await expect(page.getByRole("button", { name: "Move Up" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Move Down" })).toHaveCount(0);
	await page.keyboard.press("Escape");
	await expectSynced(page);

	await page.reload();
	await expect(main.getByRole("region", { name: "During" })).toBeVisible();
	expect(await order()).toEqual(["Before", "After", "During"]);
});

test("deleting asks first: Cancel keeps it, permanent deletes need a tick", async ({
	page,
}) => {
	await signUp(page);
	await newList(page, "New Project");
	await typeTitle(page, "New Project", "Keep me");
	await addTodo(page, "Inside");
	const dialog = page.getByRole("alertdialog");

	await page.getByRole("button", { name: "Project actions" }).click();
	await page.getByRole("button", { name: "Delete Project" }).click();
	await expect(dialog).toContainText("Delete project “Keep me”?");
	await expect(dialog).toContainText("with its 1 task");
	// The safe choice has focus: Enter cancels.
	await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(dialog).toBeHidden();
	await expect(row(page, "Inside")).toBeVisible();

	await page.getByRole("button", { name: "Project actions" }).click();
	await page.getByRole("button", { name: "Delete Project" }).click();
	await dialog.getByRole("button", { name: "Move to Trash" }).click();
	await expect(page).not.toHaveURL(/\/project\//);

	// Emptying Trash is permanent, so it needs the box ticked.
	await page
		.getByRole("navigation", { name: "Lists" })
		.getByRole("link", { name: "Trash" })
		.click();
	await page.getByRole("button", { name: "Empty Trash" }).click();
	const empty = dialog.getByRole("button", { name: "Empty Trash" });
	await expect(empty).toBeDisabled();
	await dialog.getByLabel("I understand this can't be undone").check();
	await empty.click();
	await expect(page.getByText("Trash is empty.")).toBeVisible();
});

test("a project shows its logged to-dos on request, and they can be reopened there", async ({
	page,
}) => {
	await signUp(page);
	await newList(page, "New Project");
	await typeTitle(page, "New Project", "Decorate");
	await addTodo(page, "Set the budget");
	await addTodo(page, "Pick paint");
	await checkbox(page, "Pick paint").check();
	await expect(row(page, "Pick paint")).toBeHidden();

	const toggle = page.getByRole("button", { name: "Show 1 logged item" });
	await expect(toggle).toBeVisible();
	await toggle.click();
	const logged = page.getByRole("list", { name: "Logged items" });
	await expect(logged.getByText("Pick paint")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Hide logged item" }),
	).toHaveAttribute("aria-expanded", "true");

	// Unticking it brings it back into the project.
	// (The row moves out of the logged list, so click rather than uncheck.)
	await checkbox(page, "Pick paint").click();
	await expect(toggle).toBeHidden();
	await expect(checkbox(page, "Pick paint")).not.toBeChecked();
	await expect
		.poll(() => rowTitles(page))
		.toEqual(["Set the budget", "Pick paint"]);
});

test("a Life Bucket's page adds areas and projects, and an open to-do moves to any list", async ({
	page,
}) => {
	await signUp(page);
	const sidebar = page.getByRole("navigation", { name: "Lists" });
	const main = page.locator("main");
	await newList(page, "New Life Bucket");
	await typeTitle(page, "New Life Bucket", "Work");
	await main.getByRole("button", { name: /^New Area/ }).click();
	await typeTitle(page, "New Area", "Admin");
	await sidebar.getByRole("link", { name: "Work" }).click();
	await main.getByRole("button", { name: /^New Project/ }).click();
	await typeTitle(page, "New Project", "Launch");
	await expect(main.getByRole("heading", { name: "Launch" })).toBeVisible();
	await expect(sidebar.getByRole("link", { name: "Admin" })).toBeVisible();
	await expect(sidebar.getByRole("link", { name: "Launch" })).toBeVisible();
	await addTodo(page, "Write copy");

	// Open it and move it to the area, picked under its Life Bucket.
	await row(page, "Write copy").click();
	await page.getByRole("button", { name: "Launch", exact: true }).click();
	const picker = page.locator("[data-popover-content]");
	await expect(picker.getByText("Work", { exact: true })).toBeVisible();
	await picker.getByRole("button", { name: "Admin" }).click();
	await expect(page.getByText("Moved to Admin")).toBeVisible();
	await expect(row(page, "Write copy")).toBeHidden();
	await expectSynced(page);
	await sidebar.getByRole("link", { name: "Admin" }).click();
	await expect(row(page, "Write copy")).toBeVisible();
});

test("New List asks which Life Bucket, picks the one you're in, and can start a new one", async ({
	page,
}) => {
	await signUp(page);
	const sidebar = page.getByRole("navigation", { name: "Lists" });
	const popover = page.locator("[data-popover-content]");
	await newList(page, "New Life Bucket");
	await typeTitle(page, "New Life Bucket", "Work");
	await newList(page, "New Life Bucket");
	await typeTitle(page, "New Life Bucket", "Home");

	await expect(sidebar.getByRole("link", { name: "Home" })).toBeVisible();
	await expectSynced(page);

	// From the Inbox it asks, with nothing picked.
	await sidebar.getByRole("link", { name: /^Inbox/ }).click();
	await page.getByRole("button", { name: "New List" }).click();
	await popover.getByRole("button", { name: /^New Project/ }).click();
	await expect(
		popover.getByText("New Project in which Life Bucket?"),
	).toBeVisible();
	await popover.getByRole("button", { name: "Home", exact: true }).click();
	await typeTitle(page, "New Project", "Paint the hall");
	await expect(page.getByRole("link", { name: "Home" }).first()).toBeVisible();

	// Inside Work, Work comes first and is picked.
	await sidebar.getByRole("link", { name: "Work" }).click();
	await page.getByRole("button", { name: "New List" }).click();
	await popover.getByRole("button", { name: /^New Area/ }).click();
	const options = popover.getByRole("button", { name: /^(Work|Home)$/ });
	await expect(options.first()).toHaveText("Work");
	await expect(options.first()).toHaveAttribute("aria-pressed", "true");
	await page.keyboard.press("Escape");

	// A new Life Bucket, named right there, with the area inside it.
	await page.getByRole("button", { name: "New List" }).click();
	await popover.getByRole("button", { name: /^New Area/ }).click();
	await popover.getByLabel("New Life Bucket name").fill("Family");
	await popover.getByLabel("New Life Bucket name").press("Enter");
	await typeTitle(page, "New Area", "Birthdays");
	await expect(sidebar.getByRole("link", { name: "Family" })).toBeVisible();
	await expect(sidebar.getByRole("link", { name: "Birthdays" })).toBeVisible();
});

test("the filter bar unlocks Areas and Projects for the Life Buckets picked", async ({
	page,
}) => {
	await signUp(page);
	const sidebar = page.getByRole("navigation", { name: "Lists" });
	const link = (name: string) =>
		sidebar.getByRole("link", { name, exact: true });
	await newList(page, "New Project");
	await typeTitle(page, "New Project", "Solo");
	await addTodo(page, "Solo task");
	await newList(page, "New Life Bucket");
	await typeTitle(page, "New Life Bucket", "Work");
	await link("Work").click();
	await newList(page, "New Area");
	await typeTitle(page, "New Area", "Admin");
	await addTodo(page, "Admin task");
	await link("Work").click();
	await newList(page, "New Project");
	await typeTitle(page, "New Project", "Launch");
	await addTodo(page, "Launch task");
	await expectSynced(page);

	await page.goto("/anytime");
	const bar = page.getByRole("toolbar", { name: "Filters" });
	// Areas wait for a Life Bucket.
	await bar.getByRole("button", { name: /^Filter by Area/ }).click();
	await expect(
		page.getByText("Pick a Life Bucket first to see its areas."),
	).toBeVisible();
	await page.keyboard.press("Escape");

	await bar.getByRole("button", { name: "Filter by Life Bucket" }).click();
	await page
		.getByRole("dialog", { name: "Filter by Life Bucket" })
		.getByRole("button", { name: "Work" })
		.click();
	await page.keyboard.press("Escape");
	await expect
		.poll(() => rowTitles(page))
		.toEqual(["Admin task", "Launch task"]);

	await bar.getByRole("button", { name: "Filter by Project" }).click();
	const projects = page.getByRole("dialog", { name: "Filter by Project" });
	await expect(projects.getByRole("button", { name: "Solo" })).toHaveCount(0);
	await projects.getByRole("button", { name: "Launch" }).click();
	await page.keyboard.press("Escape");
	await expect.poll(() => rowTitles(page)).toEqual(["Launch task"]);

	// Another Life Bucket comes in whole; Work stays narrowed to Launch.
	await bar.getByRole("button", { name: /Life Bucket/ }).click();
	await page
		.getByRole("dialog", { name: "Filter by Life Bucket" })
		.getByRole("button", { name: "Personal" })
		.click();
	await expect
		.poll(async () => (await rowTitles(page)).sort())
		.toEqual(["Launch task", "Solo task"]);

	// Unticking Work clears Launch too.
	await page
		.getByRole("dialog", { name: "Filter by Life Bucket" })
		.getByRole("button", { name: "Work" })
		.click();
	await expect(page).not.toHaveURL(/project=/);
	await expect.poll(() => rowTitles(page)).toEqual(["Solo task"]);
});
