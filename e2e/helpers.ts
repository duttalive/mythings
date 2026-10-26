import { expect, type Page } from "@playwright/test";

export const PASSWORD = "e2e-password-123";

let counter = 0;
export function uniqueEmail(): string {
	return `e2e-${Date.now()}-${process.pid}-${counter++}@mythings.test`;
}

/** Creates an account from the login page and waits for the app. */
export async function signUp(
	page: Page,
	email = uniqueEmail(),
): Promise<string> {
	await page.goto("/today");
	await page.getByRole("button", { name: "Create an account" }).click();
	await page.getByLabel("Name").fill("E2E Tester");
	await page.getByLabel("Email").fill(email);
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(
		page.getByRole("heading", { name: "Check your email" }),
	).toBeVisible();
	await page.goto(await signupLink(page, email));
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await page.getByRole("button", { name: "Create account" }).click();
	await expectReady(page);
	return email;
}

/** The newest sign-up link emailed to an address (the local dev mailbox), as a path. */
export async function signupLink(page: Page, email: string): Promise<string> {
	let link: string | undefined;
	await expect
		.poll(async () => {
			const res = await page.request.get(
				`/api/dev/mail?to=${encodeURIComponent(email)}`,
			);
			const mails = (await res.json()) as { text: string }[];
			link = mails
				.map((m) => m.text.match(/\/verify-email\?token=[\w-]+/)?.[0])
				.find(Boolean);
			return link;
		})
		.toBeTruthy();
	return link as string;
}

export async function signIn(page: Page, email: string): Promise<void> {
	await page.goto("/today");
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
	await page.getByRole("button", { name: "Sign in" }).click();
	await expectReady(page);
}

/** The shell is up and the first sync finished. */
export async function expectReady(page: Page): Promise<void> {
	await expect(page.getByRole("navigation", { name: "Lists" })).toBeVisible();
	await expect(page.getByTestId("sync-status")).toHaveText("Synced");
}

/** Waits until every local change has reached the server. */
export async function expectSynced(page: Page): Promise<void> {
	await expect(page.getByTestId("sync-status")).toHaveText("Synced", {
		timeout: 10_000,
	});
}

/** Titles of the to-do rows in the main list, in order. */
export function rowTitles(page: Page) {
	return page
		.locator("main [data-row-id]")
		.evaluateAll((rows) =>
			rows.map(
				(row) => row.querySelector("span.truncate")?.textContent?.trim() ?? "",
			),
		);
}

/** A to-do's checkbox, by the to-do's title. */
export function checkbox(page: Page, title: string) {
	return page
		.locator("main")
		.getByRole("checkbox", { name: `Complete ${title}`, exact: true });
}

/** A to-do row by its exact title. */
export function row(page: Page, title: string) {
	const exact = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
	return page
		.locator("main [data-row-id]")
		.filter({ has: page.locator("span.truncate", { hasText: exact }) });
}

/** Opens the app's Quick Entry (⌥Space) and saves a to-do. */
export async function quickEntry(page: Page, text: string): Promise<void> {
	await page.keyboard.press("Alt+Space");
	const dialog = page.getByRole("dialog", { name: "Quick Entry" });
	await dialog.getByLabel("Title", { exact: true }).fill(text);
	await dialog.getByLabel("Title", { exact: true }).press("Enter");
	await expect(dialog).toBeHidden();
}

/** Loads a page and waits until the app is up and synced. */
export async function open(page: Page, path: string): Promise<void> {
	await page.goto(path);
	await expectReady(page);
}

export async function goTo(page: Page, list: string): Promise<void> {
	await page
		.getByRole("navigation", { name: "Lists" })
		.getByRole("link", { name: list, exact: false })
		.first()
		.click();
	await expect(page.getByRole("heading", { level: 1 })).toContainText(list);
}
