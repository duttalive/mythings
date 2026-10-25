import { expect, test } from "@playwright/test";
import { goTo, quickEntry, signUp } from "./helpers";

test("sign up, add with #tag @tomorrow, find it in Upcoming under Tomorrow", async ({
	page,
}) => {
	await signUp(page);
	await quickEntry(page, "Buy stamps #errands @tomorrow");

	await goTo(page, "Upcoming");
	const tomorrow = page.getByRole("region", { name: /Tomorrow/ });
	const item = tomorrow.locator("[data-row-id]", { hasText: "Buy stamps" });
	await expect(item).toBeVisible();
	await expect(item).toContainText("errands");
	// The tokens are gone from the title.
	await expect(item).not.toContainText("#errands");
	await expect(item).not.toContainText("@tomorrow");

	// It's in the sidebar's tag list too.
	await expect(
		page.getByRole("navigation", { name: "Lists" }).getByRole("link", {
			name: "errands",
		}),
	).toBeVisible();
});
