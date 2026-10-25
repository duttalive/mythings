import { expect, type Page, test } from "@playwright/test";
import { open, quickEntry, row, signUp } from "./helpers";

test.use({
	viewport: { width: 375, height: 812 },
	hasTouch: true,
	isMobile: true,
});

/** A touch swipe across a row (dnd-kit waits 250ms for touch drags, so this is a swipe). */
async function swipe(page: Page, title: string, dx: number) {
	await row(page, title).evaluate(async (el, dx) => {
		const target = el.parentElement as HTMLElement;
		const r = target.getBoundingClientRect();
		const y = r.top + r.height / 2;
		const x0 = r.left + (dx < 0 ? r.width - 40 : 40);
		const fire = (type: string, x: number) =>
			target.dispatchEvent(
				new PointerEvent(type, {
					bubbles: true,
					cancelable: true,
					pointerId: 11,
					pointerType: "touch",
					isPrimary: true,
					clientX: x,
					clientY: y,
				}),
			);
		fire("pointerdown", x0);
		for (let i = 1; i <= 10; i++) {
			fire("pointermove", x0 + (dx * i) / 10);
			await new Promise((resolve) => setTimeout(resolve, 16));
		}
		fire("pointerup", x0 + dx);
	}, dx);
}

test("mobile: drawer, swipe left to delete with undo, swipe right for When", async ({
	page,
}) => {
	await signUp(page);
	await open(page, "/inbox");
	await quickEntry(page, "Swipe me");

	// The sidebar is a drawer.
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	await expect(
		sidebar.getByRole("link", { name: "Today" }),
	).not.toBeInViewport();
	await page.getByRole("button", { name: "Toggle sidebar" }).click();
	await expect(sidebar.getByRole("link", { name: "Today" })).toBeInViewport();
	await page.getByRole("button", { name: "Close sidebar" }).click();

	await swipe(page, "Swipe me", -110);
	await expect(row(page, "Swipe me")).toBeHidden();
	await page.getByRole("button", { name: "Undo" }).click();
	await expect(row(page, "Swipe me")).toBeVisible();

	// A short swipe does nothing.
	await swipe(page, "Swipe me", 40);
	await expect(page.getByRole("dialog", { name: "When" })).toBeHidden();

	await swipe(page, "Swipe me", 100);
	const when = page.getByRole("dialog", { name: "When" });
	await expect(when).toBeVisible();
	await when.getByRole("button", { name: "Someday" }).click();
	await expect(row(page, "Swipe me")).toBeHidden();
});

test("mobile: search button, bottom-sheet pickers, finger-sized targets", async ({
	page,
}) => {
	await signUp(page);
	await open(page, "/inbox");
	await quickEntry(page, "Tap me");

	// Quick Find without a keyboard.
	await page.getByRole("button", { name: "Search" }).click();
	await expect(page.getByRole("dialog", { name: "Quick Find" })).toBeVisible();
	await page.keyboard.press("Escape");

	// Rows and checkboxes are big enough to tap.
	const rowBox = await row(page, "Tap me").boundingBox();
	expect(rowBox?.height ?? 0).toBeGreaterThanOrEqual(44);
	const checkBox = await page
		.getByRole("checkbox", { name: "Complete Tap me" })
		.boundingBox();
	expect(checkBox?.width ?? 0).toBeGreaterThanOrEqual(38);

	// Fields are 16px+ so iOS doesn't zoom; the When picker is a bottom sheet.
	await row(page, "Tap me").click();
	const title = page.locator("main").getByLabel("Title", { exact: true });
	expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
		"16px",
	);
	await page.locator("main").getByRole("button", { name: "When" }).click();
	const sheet = page.getByRole("dialog", { name: "When" });
	await expect(sheet).toBeVisible();
	await expect
		.poll(async () => {
			const box = await sheet.boundingBox();
			return (
				box && [
					Math.round(box.x),
					Math.round(box.width),
					Math.round(box.y + box.height),
				]
			);
		})
		.toEqual([0, 375, 812]);
});
