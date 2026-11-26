// The same flows at phone, tablet and desktop sizes: rows with long titles and
// many indicators stay readable, the open to-do has no notes box, and Focus
// Mode (Normal and Pomodoro) works and fits.

import { expect, type Page, test } from "@playwright/test";
import { expectSynced, open, quickEntry, row, signUp } from "./helpers";

const SIZES = [
	{
		name: "phone",
		viewport: { width: 375, height: 812 },
		hasTouch: true,
		isMobile: true,
	},
	{
		name: "tablet",
		viewport: { width: 768, height: 1024 },
		hasTouch: true,
		isMobile: true,
	},
	{
		name: "desktop",
		viewport: { width: 1280, height: 800 },
		hasTouch: false,
		isMobile: false,
	},
] as const;

const LONG_TITLE =
	"Check for the COC and policy schedule for clawz collective and send mail with all docs for confirmation";

/** Nothing on the page is wider than the screen. */
async function expectNoSideScroll(page: Page) {
	const overflow = await page.evaluate(() => {
		const el = document.scrollingElement as HTMLElement;
		const dialog = document.querySelector<HTMLElement>("[role=dialog]");
		return Math.max(
			el.scrollWidth - el.clientWidth,
			dialog ? dialog.scrollWidth - dialog.clientWidth : 0,
		);
	});
	expect(overflow).toBeLessThanOrEqual(1);
}

for (const size of SIZES) {
	test.describe(`${size.name} (${size.viewport.width}px)`, () => {
		test.use({
			viewport: size.viewport,
			hasTouch: size.hasTouch,
			isMobile: size.isMobile,
		});

		test("long rows stay readable, and Focus Mode works", async ({ page }) => {
			await page.clock.install();
			await signUp(page);
			await open(page, "/inbox");
			await quickEntry(page, `${LONG_TITLE} #uc-urgent-renewals !tomorrow`);

			// The card has the title and checklist, but no notes box.
			await row(page, LONG_TITLE).click();
			await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible();
			await expect(page.getByRole("textbox", { name: "Notes" })).toHaveCount(0);
			await page.getByRole("button", { name: "Add checklist" }).click();
			const item = page.getByRole("textbox", { name: "Checklist item" });
			await expect(item).toBeFocused();
			await page.keyboard.type("Get quotes");
			await page.keyboard.press("Escape");
			await expectSynced(page);

			// The title keeps most of the row; the tag, checklist and deadline fit around it.
			const title = row(page, LONG_TITLE).locator("[data-row-title]");
			const titleBox = await title.boundingBox();
			const rowBox = await row(page, LONG_TITLE).boundingBox();
			expect(titleBox && rowBox).toBeTruthy();
			if (titleBox && rowBox)
				expect(titleBox.width).toBeGreaterThan(rowBox.width * 0.5);
			await expect(row(page, LONG_TITLE)).toContainText("uc-urgent-renewals");
			await expect(row(page, LONG_TITLE)).toContainText("0/1");
			await expectNoSideScroll(page);

			// Focus Mode: set the length first (a preset or any minutes), then it counts down.
			await row(page, LONG_TITLE).click();
			await page.getByRole("button", { name: "Focus", exact: true }).click();
			const screen = page.getByRole("dialog", { name: /Check for the COC/ });
			await expect(screen).toBeVisible();
			const clock = screen.getByRole("timer");
			await expect(clock).toHaveText("25:00");
			await expect(screen.getByRole("button", { name: "Normal" })).toHaveCount(
				0,
			);
			await expect(
				screen.getByRole("button", { name: "Pomodoro" }),
			).toHaveCount(0);
			await screen.getByRole("button", { name: "45 min" }).click();
			await expect(clock).toHaveText("45:00");
			await screen.getByRole("spinbutton", { name: "Minutes" }).fill("10");
			await expect(clock).toHaveText("10:00");
			await expect(
				screen.getByRole("checkbox", { name: "Done: Get quotes" }),
			).toBeVisible();
			await expectNoSideScroll(page);
			await screen.getByRole("button", { name: "Start focus" }).click();
			await expect(screen.getByRole("button", { name: "45 min" })).toHaveCount(
				0,
			);
			await page.clock.fastForward("02:00");
			await expect(clock).toHaveText(/^[78]:\d\d$/);

			// Pausing stops it.
			await screen.getByRole("button", { name: "Pause" }).click();
			const paused = await clock.textContent();
			await page.clock.fastForward("01:00");
			await expect(clock).toHaveText(paused ?? "");
			await screen.getByRole("button", { name: "Resume" }).click();

			// Minimize to the pill, then back.
			await screen.getByRole("button", { name: "Minimize" }).click();
			await expect(screen).toBeHidden();
			const pill = page.getByRole("region", { name: "Focus" });
			await expect(pill).toBeVisible();
			await expectNoSideScroll(page);

			// At zero it stops and offers what's next.
			await page.clock.fastForward("10:00");
			await expect(pill).toContainText("Time's up");
			await expect(pill).toContainText("0:00");
			await pill.getByRole("button", { name: "Open focus" }).click();
			await expect(screen).toBeVisible();
			await expect(screen).toContainText("You focused for 10 min");
			for (const name of [
				"Complete to-do",
				"+5 min",
				"Start again",
				"End focus",
			])
				await expect(
					screen.getByRole("button", { name, exact: true }).first(),
				).toBeVisible();
			await screen.getByRole("button", { name: "+5 min" }).click();
			await expect(clock).toHaveText(/^(5:00|4:5\d)$/);
			await page.clock.fastForward("05:00");
			await expect(screen).toContainText("You focused for 15 min");
			await expectNoSideScroll(page);

			// Completing from Focus Mode ends it.
			await screen
				.getByRole("button", { name: "Complete to-do", exact: true })
				.click();
			await expect(screen).toBeHidden();
			await expect(
				page.getByText(/Completed after 15 min of focus/),
			).toBeVisible();
			await expect(pill).toBeHidden();

			// Tabs are a desktop thing.
			const strip = page.getByRole("tablist", { name: "Tabs" });
			if (size.name === "desktop") await expect(strip).toBeVisible();
			else await expect(strip).toHaveCount(0);
		});
	});
}

test.describe("desktop tabs", () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test("open pages in app tabs, switch, close, and keep them after a reload", async ({
		page,
	}) => {
		await signUp(page);
		await open(page, "/inbox");
		await quickEntry(page, "Plan the offsite");
		const strip = page.getByRole("tablist", { name: "Tabs" });
		const tabNames = () =>
			strip
				.getByRole("tab")
				.evaluateAll((els) =>
					els.map((el) => el.textContent?.trim() ?? "").filter((t) => t !== ""),
				);
		await expect.poll(tabNames).toEqual(["Inbox"]);

		// New tab (Ctrl+Alt+T / ⌥⌘T) opens Today next to it.
		await page.keyboard.press("ControlOrMeta+Alt+t");
		await expect(page).toHaveURL(/\/today$/);
		await expect.poll(tabNames).toEqual(["Inbox", "Today"]);

		// Switching tabs goes back to the Inbox.
		await strip.getByRole("tab", { name: "Inbox", exact: true }).click();
		await expect(page).toHaveURL(/\/inbox$/);

		// A middle-click on a row opens the to-do's page in a new tab.
		await row(page, "Plan the offsite").click({ button: "middle" });
		await expect(page).toHaveURL(/\/notes\//);
		await expect.poll(tabNames).toEqual(["Inbox", "Plan the offsite", "Today"]);
		// ⌘/Ctrl-click on a sidebar list opens it in a new tab too.
		await page
			.getByRole("navigation", { name: "Lists" })
			.getByRole("link", { name: /Upcoming/ })
			.click({ modifiers: ["ControlOrMeta"] });
		await expect(page).toHaveURL(/\/upcoming$/);
		await expect
			.poll(tabNames)
			.toEqual(["Inbox", "Plan the offsite", "Upcoming", "Today"]);

		// Navigating inside a tab changes that tab only.
		await page
			.getByRole("navigation", { name: "Lists" })
			.getByRole("link", { name: /Anytime/ })
			.click();
		await expect
			.poll(tabNames)
			.toEqual(["Inbox", "Plan the offsite", "Anytime", "Today"]);

		// Closing the active tab moves to its neighbour; ⌥⌘← / ⌥⌘→ switch.
		await page.keyboard.press("ControlOrMeta+Alt+w");
		await expect.poll(tabNames).toEqual(["Inbox", "Plan the offsite", "Today"]);
		await expect(page).toHaveURL(/\/today$/);
		await page.keyboard.press("ControlOrMeta+Alt+ArrowLeft");
		await expect(page).toHaveURL(/\/notes\//);
		await strip.getByRole("button", { name: "Close Today" }).click();
		await expect.poll(tabNames).toEqual(["Inbox", "Plan the offsite"]);

		// Tabs are remembered on this device.
		await expectSynced(page);
		await page.reload();
		await expect.poll(tabNames).toEqual(["Inbox", "Plan the offsite"]);
		await expect(page).toHaveURL(/\/notes\//);
	});
});
