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

			// Focus Mode, Normal: counts up.
			await row(page, LONG_TITLE).click();
			await page.getByRole("button", { name: "Focus", exact: true }).click();
			const screen = page.getByRole("dialog", { name: /Check for the COC/ });
			await expect(screen).toBeVisible();
			const clock = screen.getByRole("timer");
			await expect(
				screen.getByRole("button", { name: "Normal" }),
			).toHaveAttribute("aria-pressed", "true");
			await page.clock.fastForward("02:05");
			await expect(clock).toHaveText(/^2:0\d$/);
			await expect(
				screen.getByRole("checkbox", { name: "Done: Get quotes" }),
			).toBeVisible();
			await expectNoSideScroll(page);

			// Pomodoro: counts down 25 minutes; pausing stops it.
			await screen.getByRole("button", { name: "Pomodoro" }).click();
			await expect(clock).toHaveText(/^(25:00|24:5\d)$/);
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

			// The round ends: a break is ready and waits to be started.
			await page.clock.fastForward("25:00");
			await expect(pill).toContainText("Time for a break");
			await pill.getByRole("button", { name: "Open focus" }).click();
			await expect(screen).toBeVisible();
			await expect(screen).toContainText("Focus round done");
			await expect(clock).toHaveText("5:00");
			await expect(
				screen.getByRole("button", { name: "Start short break" }),
			).toBeVisible();

			// Completing from Focus Mode ends it.
			await screen
				.getByRole("button", { name: "Complete to-do and end focus" })
				.click();
			await expect(screen).toBeHidden();
			await expect(
				page.getByText(/Completed after 2\d min of focus/),
			).toBeVisible();
			await expect(pill).toBeHidden();
		});
	});
}
