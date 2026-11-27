// Screenshots for Core_User_Guide.md. Run with `corepack pnpm guide:screenshots`
// after a release that changes what the app looks like; it signs up a made-up
// account on a throwaway local build, imports seed.ts and walks every screen.

import { expect, type Locator, type Page, test } from "@playwright/test";
import { seedFile } from "./seed";

const DIR = "docs/guide";
const EMAIL = "sam@example.com";
const PASSWORD = "guide-password-123";

test.describe.configure({ mode: "serial" });

/** Saves the whole window, or the part of it around some elements. */
async function shot(page: Page, name: string, ...around: Locator[]) {
	await page.waitForTimeout(350);
	const path = `${DIR}/${name}.jpg`;
	const options = {
		path,
		type: "jpeg" as const,
		quality: 88,
		animations: "disabled" as const,
		timeout: 10_000,
	};
	if (around.length === 0) {
		await page.screenshot(options);
		return;
	}
	const boxes = [];
	for (const el of around) {
		const box = await el.boundingBox();
		if (box) boxes.push(box);
	}
	const pad = 16;
	const view = page.viewportSize() ?? { width: 1280, height: 800 };
	const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
	const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
	const right = Math.min(
		view.width,
		Math.max(...boxes.map((b) => b.x + b.width)) + pad,
	);
	const bottom = Math.min(
		view.height,
		Math.max(...boxes.map((b) => b.y + b.height)) + pad,
	);
	await page.screenshot({
		...options,
		clip: { x, y, width: right - x, height: bottom - y },
	});
}

async function ready(page: Page) {
	await expect(page.getByRole("navigation", { name: "Lists" })).toBeVisible();
	await expect(page.getByTestId("sync-status")).toHaveText("Synced", {
		timeout: 15_000,
	});
}

async function open(page: Page, path: string) {
	await page.goto(path);
	await ready(page);
}

async function mailLink(page: Page, pattern: RegExp): Promise<string> {
	let link: string | undefined;
	await expect
		.poll(
			async () => {
				const res = await page.request.get(
					`/api/dev/mail?to=${encodeURIComponent(EMAIL)}`,
				);
				const mails = (await res.json()) as { text: string }[];
				link = mails
					.reverse()
					.map((m) => m.text.match(pattern)?.[0])
					.find(Boolean);
				return link;
			},
			{ timeout: 20_000 },
		)
		.toBeTruthy();
	return link as string;
}

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Lists" });
const main = (page: Page) => page.locator("main");
/** Runs one part of the tour; a failure is reported but the rest still runs. */
const failures: string[] = [];
const only = process.env.GUIDE_ONLY?.split(",");
async function step(page: Page, name: string, fn: () => Promise<void>) {
	if (only && !only.includes(name)) return;
	try {
		await fn();
	} catch (error) {
		failures.push(`${name}: ${String(error).split("\n")[0]}`);
		console.log(`✘ ${name}`, String(error).split("\n").slice(0, 3).join(" "));
	}
	for (let i = 0; i < 3; i++) await page.keyboard.press("Escape");
}

/** One section of the Settings page, in a window tall enough to show all of it. */
async function section(page: Page, name: string, title: string) {
	await page.setViewportSize({ width: 1280, height: 2600 });
	const region = page.getByRole("region", { name: title, exact: true });
	await expect(region).toBeVisible();
	await shot(page, name, region);
	await page.setViewportSize({ width: 1280, height: 800 });
}

const row = (page: Page, title: string) =>
	page.locator("main [data-row-id]").filter({ hasText: title }).first();

test("guide screenshots", async ({ page, browser }) => {
	// --- Signed out -----------------------------------------------------------
	await page.goto("/");
	await expect(
		page.getByRole("link", { name: /Get started/ }).first(),
	).toBeVisible();
	await shot(page, "home");
	await page.screenshot({
		path: `${DIR}/home-full.jpg`,
		type: "jpeg",
		quality: 80,
		fullPage: true,
	});

	await page.goto("/login");
	await expect(
		page.getByRole("heading", { name: "Sign in to mythings" }),
	).toBeVisible();
	await shot(page, "login");
	await page.getByRole("button", { name: "Forgot password?" }).click();
	await shot(page, "forgot-password");

	await page.goto("/signup");
	await page.getByLabel("Name").fill("Sam Rivera");
	await page.getByLabel("Email").fill(EMAIL);
	await shot(page, "signup");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(
		page.getByRole("heading", { name: "Check your email" }),
	).toBeVisible();
	await shot(page, "signup-check-email");

	await page.goto(await mailLink(page, /\/verify-email\?token=[\w-]+/));
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await shot(page, "signup-choose-password");
	await page.getByRole("button", { name: "Create account" }).click();
	await ready(page);
	await shot(page, "first-today");

	// --- Seed ------------------------------------------------------------------
	const result = await page.evaluate(async (file) => {
		const res = await fetch("/api/import", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(file),
		});
		return { status: res.status, body: await res.json() };
	}, seedFile());
	expect(result.status, JSON.stringify(result.body)).toBe(200);
	expect(result.body.errors).toEqual([]);
	await page.reload();
	await ready(page);

	// A second "device", signed in before encryption is turned on.
	const laptop = await browser.newContext({
		baseURL: "http://localhost:4175",
		timezoneId: "Europe/Berlin",
		viewport: { width: 1280, height: 800 },
		deviceScaleFactor: 2,
	});
	const other = await laptop.newPage();
	await other.goto("/login");
	await other.getByLabel("Email").fill(EMAIL);
	await other.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await other.getByRole("button", { name: "Sign in" }).click();
	await ready(other);

	// --- The lists ---------------------------------------------------------------
	await open(page, "/today");
	await expect(row(page, "Buy groceries")).toBeVisible();
	await shot(page, "today");
	await page.setViewportSize({ width: 1280, height: 1000 });
	await shot(
		page,
		"sidebar",
		page.getByRole("complementary", { name: "Sidebar" }),
	);
	await page.setViewportSize({ width: 1280, height: 800 });
	for (const list of [
		"inbox",
		"upcoming",
		"anytime",
		"someday",
		"overdue",
		"logbook",
		"deadlines",
	]) {
		await open(page, `/${list}`);
		await shot(page, list);
	}

	await step(page, "filter bar", async () => {
		await open(page, "/anytime");
		const bar = page.getByRole("toolbar", { name: "Filters" });
		await bar.getByRole("button", { name: "Filter by Tag" }).click();
		await page
			.getByRole("dialog", { name: "Filter by Tag" })
			.getByRole("button", { name: "home" })
			.click();
		await shot(page, "filter-menu");
		await page.keyboard.press("Escape");
		await shot(page, "tag-filter");
		await bar.getByRole("button", { name: "Clear filters" }).click();
	});

	await step(page, "today grouped", async () => {
		await open(page, "/settings");
		await page
			.getByRole("switch", { name: "Group tasks in Today by project" })
			.click();
		await open(page, "/today");
		await shot(page, "today-grouped");
		await open(page, "/settings");
		await page
			.getByRole("switch", { name: "Group tasks in Today by project" })
			.click();
	});

	// --- To-dos ------------------------------------------------------------------
	await step(page, "todo card", async () => {
		await open(page, "/today");
		await row(page, "Buy groceries").click();
		const card = main(page).getByRole("textbox", { name: "Title" });
		await expect(card).toBeVisible();
		// Hovering an item shows its drag handle.
		await main(page)
			.getByRole("textbox", { name: "Checklist item" })
			.nth(2)
			.hover();
		await shot(page, "todo-card");
		await page.getByRole("button", { name: "More actions" }).click();
		await shot(page, "todo-more-actions");
	});

	await step(page, "move picker", async () => {
		await open(page, "/today");
		await row(page, "Book a van for moving day").click();
		await main(page)
			.getByRole("button", { name: "Move apartments › Moving day" })
			.click();
		const picker = page.getByRole("dialog", { name: "Move" });
		await expect(picker.getByText("Home", { exact: true })).toBeVisible();
		await shot(
			page,
			"move-picker",
			picker,
			main(page).getByRole("textbox", { name: "Title" }),
		);
		await page.keyboard.press("Escape");
	});

	await step(page, "task notes", async () => {
		await open(page, "/today");
		await row(page, "Book a van for moving day").click();
		await page.getByRole("link", { name: "Open in Task Notes" }).click();
		const pad = page.getByRole("textbox", { name: "Task Notes" });
		await expect(pad.locator("table")).toBeVisible();
		await page.getByRole("textbox", { name: "Task title" }).blur();
		await shot(page, "task-notes-page");
		// The / menu, on a new line at the end (undone afterwards).
		await pad.locator("p", { hasText: "parking permit" }).click();
		await page.keyboard.press("End");
		await page.keyboard.press("Enter");
		await page.keyboard.type("/");
		const menu = page.getByRole("listbox", { name: "Insert a block" });
		await expect(menu).toBeVisible();
		await shot(page, "task-notes-slash", menu, pad.locator("[data-callout]"));
		await page.keyboard.press("Escape");
		await page.keyboard.press("ControlOrMeta+z");
		await page.keyboard.press("ControlOrMeta+z");
		await page
			.getByRole("link", { name: "Task Notes", exact: true })
			.first()
			.click();
		await expect(
			page.getByRole("heading", { name: "Task Notes" }),
		).toBeVisible();
		await shot(page, "task-notes-pad");
	});

	await step(page, "focus mode", async () => {
		await open(page, "/today");
		await row(page, "Book a van for moving day").click();
		await main(page)
			.getByRole("button", { name: "Focus", exact: true })
			.click();
		const screen = page.getByRole("dialog", { name: /Book a van/ });
		await expect(screen.getByRole("button", { name: "25 min" })).toBeVisible();
		await shot(page, "focus-mode");
		await screen.getByRole("button", { name: "Start focus" }).click();
		await page.waitForTimeout(1200);
		await screen.getByRole("button", { name: "Minimize" }).click();
		await expect(page.getByRole("region", { name: "Focus" })).toBeVisible();
		await shot(page, "focus-pill");
		await page.getByRole("button", { name: "Open focus" }).click();
		await screen
			.getByRole("button", { name: "End focus", exact: true })
			.click();
		await expect(screen).toBeHidden();
	});

	await step(page, "tabs", async () => {
		await open(page, "/inbox");
		const strip = page.getByRole("tablist", { name: "Tabs" });
		await page.keyboard.press("ControlOrMeta+Alt+t");
		await expect(page).toHaveURL(/\/today$/);
		await row(page, "Book a van for moving day").click({ button: "middle" });
		await expect(
			page.getByRole("textbox", { name: "Task Notes" }),
		).toBeVisible();
		await page.getByRole("textbox", { name: "Task title" }).blur();
		await shot(page, "tabs");
		// Back to one tab for the other screenshots.
		await page.keyboard.press("ControlOrMeta+Alt+w");
		await page.keyboard.press("ControlOrMeta+Alt+w");
		await expect(strip.getByRole("button", { name: /^Close/ })).toHaveCount(0);
	});

	await step(page, "when popover", async () => {
		await page.setViewportSize({ width: 1280, height: 1000 });
		await open(page, "/inbox");
		await row(page, "Read the article").click();
		await main(page).getByRole("button", { name: "When" }).click();
		const when = page.getByRole("dialog", { name: "When" });
		await expect(when).toBeVisible();
		await shot(page, "when-popover", when);
		await when.getByLabel("When (type a date)").fill("next fri");
		await shot(page, "when-typed", when);
		await page.setViewportSize({ width: 1280, height: 800 });
	});

	await step(page, "reminder", async () => {
		await open(page, "/anytime");
		await row(page, "Clean out the garage").click();
		await main(page).getByRole("button", { name: "When" }).click();
		const when = page.getByRole("dialog", { name: "When" });
		await when.getByRole("button", { name: "Add Reminder" }).click();
		await shot(page, "reminder", page.getByRole("dialog").last());
	});

	await step(page, "repeat editor", async () => {
		await open(page, "/upcoming");
		await row(page, "Weekly review").click();
		await main(page)
			.getByRole("button", { name: /^Repeats/ })
			.click();
		await shot(page, "repeat-editor", page.getByRole("dialog").last());
	});

	await step(page, "deadline", async () => {
		await open(page, "/inbox");
		await row(page, "Call the dentist").click();
		await main(page).getByRole("button", { name: "Deadline" }).click();
		await shot(page, "deadline-popover", page.getByRole("dialog").last());
	});

	await step(page, "tags picker", async () => {
		await open(page, "/inbox");
		await row(page, "Ideas for Alex").click();
		await main(page).getByRole("button", { name: "Tags" }).click();
		const picker = page.getByRole("dialog", { name: "Tags" });
		await expect(picker).toBeVisible();
		await shot(page, "tags-picker", picker);
	});

	await step(page, "quick entry", async () => {
		await open(page, "/today");
		await page.keyboard.press("Alt+Space");
		const dialog = page.getByRole("dialog", { name: "Quick Entry" });
		await dialog
			.getByLabel("Title", { exact: true })
			.fill("Pick up the parcel #errands @tomorrow !friday");
		await shot(page, "quick-entry");
	});

	await step(page, "quick find", async () => {
		await open(page, "/today");
		await page.keyboard.type("mov");
		await expect(
			page.getByRole("combobox", { name: "Quick Find" }),
		).toBeVisible();
		await shot(page, "quick-find");
	});

	await step(page, "shortcuts", async () => {
		await open(page, "/today");
		await page.keyboard.press("?");
		await shot(page, "shortcuts");
	});

	await step(page, "multi select", async () => {
		await open(page, "/anytime");
		await row(page, "Clean out the garage").click();
		await page.keyboard.press("Escape");
		await row(page, "Organise holiday photos").click({ modifiers: ["Shift"] });
		await expect(page.getByRole("toolbar", { name: /selected/ })).toBeVisible();
		await shot(page, "bulk-bar");
	});

	await step(page, "delete confirm", async () => {
		await open(page, "/inbox");
		await row(page, "Find a new running playlist").click();
		await page.keyboard.press("Escape");
		await page.keyboard.press("Delete");
		const dialog = page.getByRole("alertdialog");
		await expect(dialog).toBeVisible();
		await shot(page, "delete-confirm");
		await dialog.getByRole("button", { name: "Move to Trash" }).click();
	});

	// --- Projects, areas, tags -----------------------------------------------------
	await step(page, "project page", async () => {
		await open(page, "/today");
		await sidebar(page).getByRole("link", { name: "Move apartments" }).click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			"Move apartments",
		);
		await page.setViewportSize({ width: 1280, height: 1300 });
		await shot(page, "project");
		await main(page)
			.getByRole("button", { name: /Show \d+ logged/ })
			.click();
		await shot(page, "project-logged");
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.getByRole("button", { name: "Project actions" }).click();
		await shot(page, "project-menu");
		await page.keyboard.press("Escape");
		await main(page)
			.getByRole("button", { name: /^Actions for/ })
			.first()
			.click();
		await shot(page, "heading-menu");
		await page.keyboard.press("Escape");
		await page.getByRole("button", { name: "Complete project" }).click();
		await shot(page, "complete-project");
	});

	await step(page, "new list", async () => {
		await open(page, "/today");
		await page.getByRole("button", { name: "New List" }).click();
		await shot(page, "new-list");
		await page.keyboard.press("Escape");
		// From inside Work, it asks which Life Bucket, with Work picked.
		await sidebar(page).getByRole("link", { name: /^Work/ }).first().click();
		await page.getByRole("button", { name: "New List" }).click();
		const popover = page.locator("[data-popover-content]");
		await popover.getByRole("button", { name: /^New Project/ }).click();
		await expect(popover.getByText(/in which Life Bucket/)).toBeVisible();
		await shot(page, "new-list-bucket", popover);
		await page.keyboard.press("Escape");
	});

	await step(page, "life bucket page", async () => {
		await open(page, "/today");
		await sidebar(page).getByRole("link", { name: /^Home/ }).first().click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText("Home");
		await shot(page, "bucket");
		await page.getByRole("button", { name: "Life Bucket actions" }).click();
		await shot(page, "bucket-menu");
		await page.keyboard.press("Escape");
	});

	await step(page, "area page", async () => {
		await open(page, "/today");
		await sidebar(page)
			.getByRole("link", { name: /^Household/ })
			.first()
			.click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			"Household",
		);
		await shot(page, "area");
		await page.getByRole("button", { name: "Area actions" }).click();
		await shot(page, "area-menu");
		await page.keyboard.press("Escape");
	});

	await step(page, "tag page", async () => {
		await open(page, "/today");
		await sidebar(page)
			.getByRole("link", { name: "errands", exact: true })
			.click();
		await expect(page.getByRole("heading", { level: 1 })).toContainText(
			"errands",
		);
		await shot(page, "tag");
		await page.getByRole("button", { name: "Tag actions" }).click();
		await shot(page, "tag-menu");
	});

	await step(page, "tag context menu", async () => {
		await open(page, "/today");
		await page.setViewportSize({ width: 1280, height: 1100 });
		await sidebar(page)
			.getByRole("link", { name: "shop", exact: true })
			.click({ button: "right" });
		await shot(page, "tag-context-menu");
		await page.keyboard.press("Escape");
		await sidebar(page).getByRole("button", { name: "New tag" }).click();
		await sidebar(page).getByLabel("New tag name").fill("reading");
		await shot(
			page,
			"new-tag",
			page.getByRole("complementary", { name: "Sidebar" }),
		);
		await page.setViewportSize({ width: 1280, height: 800 });
	});

	await step(page, "trash", async () => {
		await open(page, "/today");
		await sidebar(page)
			.getByRole("link", { name: "Run a half marathon" })
			.click();
		await page.getByRole("button", { name: "Project actions" }).click();
		await page.getByRole("button", { name: "Delete Project" }).click();
		await page
			.getByRole("alertdialog")
			.getByRole("button", { name: "Move to Trash" })
			.click();
		await open(page, "/trash");
		await shot(page, "trash");
		await page.getByRole("button", { name: "Empty Trash" }).click();
		await shot(page, "empty-trash");
	});

	// --- Phone ---------------------------------------------------------------------
	await step(page, "phone", async () => {
		const phone = await browser.newContext({
			baseURL: "http://localhost:4175",
			timezoneId: "Europe/Berlin",
			viewport: { width: 390, height: 844 },
			deviceScaleFactor: 3,
			isMobile: true,
			hasTouch: true,
		});
		const p = await phone.newPage();
		await p.goto("/login");
		await p.getByLabel("Email").fill(EMAIL);
		await p.getByLabel("Password", { exact: true }).fill(PASSWORD);
		await p.getByRole("button", { name: "Sign in" }).click();
		await expect(p.getByTestId("sync-status"))
			.toHaveText("Synced", { timeout: 15_000 })
			.catch(() => {});
		await p.goto("/today");
		await expect(row(p, "Buy groceries")).toBeVisible();
		await shot(p, "phone-today");
		await p.getByRole("button", { name: "Toggle sidebar" }).click();
		await shot(p, "phone-sidebar");
		await p.goto("/inbox");
		await row(p, "Read the article").click();
		await p.locator("main").getByRole("button", { name: "When" }).click();
		await shot(p, "phone-when-sheet");
		await phone.close();
	});

	// --- Settings ------------------------------------------------------------------
	await step(page, "settings", async () => {
		await open(page, "/settings");
		await shot(page, "settings");
		for (const [file, title] of [
			["settings-appearance", "Appearance"],
			["settings-date-time", "Date & time"],
			["settings-lists", "Lists"],
			["settings-sidebar", "Sidebar"],
			["settings-notifications", "Notifications"],
			["settings-data", "Data"],
			["settings-account", "Account"],
			["settings-about", "About"],
		] as const)
			await section(page, file, title);
	});

	await step(page, "dark", async () => {
		await open(page, "/settings");
		await page.getByRole("radio", { name: "Dark" }).check({ force: true });
		await open(page, "/today");
		await shot(page, "today-dark");
		await open(page, "/settings");
		await page.getByRole("radio", { name: "System" }).check({ force: true });
	});

	await step(page, "offline", async () => {
		await open(page, "/inbox");
		await page.context().setOffline(true);
		await row(page, "Ideas for Alex").click();
		await main(page)
			.getByRole("textbox", { name: "Title" })
			.fill("Ideas for Alex: a good book, or concert tickets?");
		await page.keyboard.press("Escape");
		await expect(page.getByTestId("sync-status")).toContainText("will sync");
		await shot(page, "offline");
		await page.context().setOffline(false);
		await ready(page);
	});

	// --- Encryption and passcode ---------------------------------------------------
	await step(page, "encryption", async () => {
		await page.context().setOffline(false);
		await open(page, "/settings");
		await section(page, "security-off", "Security");
		await page.getByRole("button", { name: "Turn on encryption…" }).click();
		await expect(page.getByTestId("recovery-key")).toBeVisible();
		await page.getByLabel("I've saved my recovery key somewhere safe.").check();
		await page.getByLabel("Your password").fill(PASSWORD);
		await section(page, "encryption-turn-on", "Security");
		await page
			.getByRole("button", { name: "Turn on encryption", exact: true })
			.click();
		await expect(page.getByText("End-to-end encryption is on.")).toBeVisible({
			timeout: 30_000,
		});
		await section(page, "security-on", "Security");
		await page.getByRole("button", { name: "Set passcode…" }).click();
		await page.getByLabel("New passcode").fill("135791");
		await page.getByLabel("Repeat passcode").fill("135791");
		await section(page, "passcode-set", "Security");
		await page.getByRole("button", { name: "Save passcode" }).click();
		await expect(page.getByRole("button", { name: "Lock now" })).toBeVisible();
		await section(page, "security-passcode", "Security");
		await page.getByRole("button", { name: "Lock now" }).click();
		await expect(
			page.getByRole("heading", { name: "mythings is locked" }),
		).toBeVisible();
		await shot(page, "lock-screen");
		await page.getByLabel("Passcode").fill("000000");
		await page.getByRole("button", { name: "Unlock" }).click();
		await expect(page.getByRole("alert")).toBeVisible();
		await shot(page, "lock-screen-wrong");
		await page.getByLabel("Passcode").fill("135791");
		await page.getByRole("button", { name: "Unlock" }).click();
		await ready(page);
	});

	await step(other, "unlock your data", async () => {
		await other.reload();
		await expect(
			other.getByRole("heading", { name: "Unlock your data" }),
		).toBeVisible({ timeout: 30_000 });
		await shot(other, "unlock-password");
		await other.getByRole("button", { name: "Use my recovery key" }).click();
		await shot(other, "unlock-recovery");
		await other.getByRole("button", { name: "I don't have it" }).click();
		await shot(other, "unlock-start-over");
	});
	await laptop.close();

	console.log(
		failures.length
			? `Failed steps:\n${failures.join("\n")}`
			: "All steps passed",
	);
});
