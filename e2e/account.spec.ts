import { expect, test } from "@playwright/test";
import { open, signUp, signupCode, uniqueEmail } from "./helpers";

test("forgot password asks for an email and confirms without revealing accounts", async ({
	page,
}) => {
	await page.goto("/today");
	await page.getByRole("button", { name: "Forgot password?" }).click();
	await expect(
		page.getByRole("heading", { name: "Reset your password" }),
	).toBeVisible();
	const email = uniqueEmail();
	await page.getByLabel("Email").fill(email);
	await page.getByRole("button", { name: "Send reset link" }).click();
	await expect(page.getByRole("status")).toContainText(
		`If an account exists for ${email}`,
	);
	await page.getByRole("button", { name: "Back to sign in" }).click();
	await expect(
		page.getByRole("heading", { name: "Sign in to mythings" }),
	).toBeVisible();
});

test("a broken reset link explains itself", async ({ page }) => {
	await page.goto("/reset-password");
	await expect(page.getByRole("alert")).toContainText("incomplete");
	await page.goto("/reset-password?token=not-a-real-token-at-all-12345");
	await page.getByLabel("New password").fill("another password");
	await page.getByRole("button", { name: "Save and sign in" }).click();
	await expect(page.getByRole("alert")).toContainText(
		"expired or was already used",
	);
});

test("the changelog is public and the app shows its version", async ({
	page,
}) => {
	await page.goto("/changelog");
	await expect(
		page.getByRole("heading", { name: "What's new in mythings" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: /^Version \d+\.\d+\.\d+/ }).first(),
	).toBeVisible();

	await signUp(page);
	await open(page, "/settings");
	await expect(page.getByText(/mythings version \d+/)).toBeVisible();
	await expect(page.getByRole("link", { name: "What's new" })).toHaveAttribute(
		"href",
		"/changelog",
	);
});

test("sign-up needs the emailed code; a wrong one is refused", async ({
	page,
}) => {
	const email = uniqueEmail();
	await page.goto("/today");
	await page.getByRole("button", { name: "Create an account" }).click();
	await page.getByLabel("Email").fill(email);
	await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
	await page.getByRole("button", { name: "Create account" }).click();
	await expect(
		page.getByRole("heading", { name: "Check your email" }),
	).toBeVisible();
	await expect(page.getByText(email)).toBeVisible();
	await expect(
		page.getByRole("button", { name: /resend in \d+s/ }),
	).toBeDisabled();

	const code = await signupCode(page, email);
	const wrong = code === "000000" ? "111111" : "000000";
	await page.getByLabel("Code").fill(wrong);
	await page.getByRole("button", { name: "Verify and create account" }).click();
	await expect(page.getByRole("alert")).toContainText("isn't right");

	await page.getByLabel("Code").fill(code);
	await page.getByRole("button", { name: "Verify and create account" }).click();
	await expect(page.getByRole("navigation", { name: "Lists" })).toBeVisible();
});

test("signing out asks first", async ({ page }) => {
	await signUp(page);
	const sidebar = page.getByRole("complementary", { name: "Sidebar" });
	await sidebar.getByRole("button", { name: "Sign out" }).click();
	const dialog = page.getByRole("alertdialog", {
		name: "Sign out of mythings?",
	});
	await expect(dialog).toBeVisible();
	// The safe choice has focus; Escape or Cancel keeps you signed in.
	await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
	await expect(page.getByRole("navigation", { name: "Lists" })).toBeVisible();

	await sidebar.getByRole("button", { name: "Sign out" }).click();
	await dialog.getByRole("button", { name: "Sign out" }).click();
	await expect(
		page.getByRole("heading", { name: "Sign in to mythings" }),
	).toBeVisible();
});

test("the password can be shown and hidden while typing it", async ({
	page,
}) => {
	await page.goto("/today");
	const field = page.getByLabel("Password", { exact: true });
	await field.fill("peek-a-boo-123");
	await expect(field).toHaveAttribute("type", "password");
	await page.getByRole("button", { name: "Show password" }).click();
	await expect(field).toHaveAttribute("type", "text");
	await expect(field).toHaveValue("peek-a-boo-123");
	await page.getByRole("button", { name: "Hide password" }).click();
	await expect(field).toHaveAttribute("type", "password");

	await page.getByRole("button", { name: "Create an account" }).click();
	await expect(
		page.getByRole("button", { name: "Show password" }),
	).toBeVisible();
});

test("the home page introduces the app and leads to sign-up and sign-in", async ({
	page,
}) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", { level: 1, name: /calm place/ }),
	).toBeVisible();
	// The preview's to-dos can be ticked off.
	const preview = page.getByRole("checkbox", { name: "Complete Call Mum" });
	await preview.check();
	await expect(preview).toBeChecked();

	await page
		.getByRole("link", { name: /Get started/ })
		.first()
		.click();
	await expect(page).toHaveURL(/\/signup$/);
	await expect(
		page.getByRole("heading", { name: "Create your account" }),
	).toBeVisible();

	await page.getByRole("link", { name: "mythings home" }).click();
	await expect(page).toHaveURL(/\/$/);
	await page
		.getByRole("navigation", { name: "Site" })
		.getByRole("link", { name: "Sign in" })
		.click();
	await expect(
		page.getByRole("heading", { name: "Sign in to mythings" }),
	).toBeVisible();
	await page.goBack();
	await expect(
		page.getByRole("link", { name: /Get started/ }).first(),
	).toBeVisible();
});
