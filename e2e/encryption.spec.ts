import { expect, test } from "@playwright/test";
import {
	expectReady,
	expectSynced,
	PASSWORD,
	quickEntry,
	row,
	signUp,
} from "./helpers";

type Pulled = { rows: { entity: string; row: { title: string } }[] };

async function serverTitles(page: import("@playwright/test").Page) {
	const res = await page.request.get("/api/sync/pull?since=0&limit=500");
	return ((await res.json()) as Pulled).rows.map((r) => r.row.title);
}

test("end-to-end encryption hides text from the server and unlocks on another device", async ({
	page,
	browser,
}) => {
	const email = await signUp(page);
	await quickEntry(page, "Written before encryption");
	await expectSynced(page);

	await page.goto("/settings");
	await page.getByRole("button", { name: "Turn on encryption…" }).click();
	const recovery = await page.getByTestId("recovery-key").textContent();
	expect(recovery).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){7}$/);
	await page.getByLabel("I've saved my recovery key somewhere safe.").check();
	await page.getByLabel("Your password").fill(PASSWORD);
	await page.getByRole("button", { name: "Turn on encryption" }).click();
	await expect(page.getByText("End-to-end encryption is on.")).toBeVisible();

	await quickEntry(page, "Written after encryption");
	await expect
		.poll(async () => (await serverTitles(page)).join(" "), {
			timeout: 15_000,
		})
		.not.toContain("Written");
	expect((await serverTitles(page)).every((t) => t.startsWith("e1:"))).toBe(
		true,
	);

	// Another device: signing in with the password opens the key.
	const other = await browser.newPage();
	await other.goto("/today");
	await other.getByLabel("Email").fill(email);
	await other.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await other.getByRole("button", { name: "Sign in" }).click();
	await expectReady(other);
	await other.goto("/today");
	await expect(row(other, "Written before encryption")).toBeVisible();
	await other.goto("/inbox");
	await expect(row(other, "Written after encryption")).toBeVisible();

	// A passcode locks this device; the right one opens it again.
	await page.goto("/settings");
	await page.getByRole("button", { name: "Set passcode…" }).click();
	await page.getByLabel("New passcode").fill("135791");
	await page.getByLabel("Repeat passcode").fill("135791");
	await page.getByRole("button", { name: "Save passcode" }).click();
	await page.getByRole("button", { name: "Lock now" }).click();
	await expect(
		page.getByRole("heading", { name: "mythings is locked" }),
	).toBeVisible();
	await page.getByLabel("Passcode").fill("000000");
	await page.getByRole("button", { name: "Unlock" }).click();
	await expect(page.getByRole("alert")).toContainText("Wrong passcode");
	await page.getByLabel("Passcode").fill("135791");
	await page.getByRole("button", { name: "Unlock" }).click();
	await expectReady(page);
	await other.close();
});
