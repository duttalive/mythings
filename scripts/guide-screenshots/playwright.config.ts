import { defineConfig } from "@playwright/test";

// Takes the screenshots in docs/guide/ for Core_User_Guide.md, against the
// same throwaway production build as the end-to-end tests:
//   corepack pnpm guide:screenshots
export default defineConfig({
	testDir: ".",
	timeout: 600_000,
	expect: { timeout: 10_000 },
	workers: 1,
	retries: 0,
	reporter: [["list"]],
	use: {
		baseURL: "http://localhost:4175",
		channel: "chrome",
		timezoneId: "Europe/Berlin",
		locale: "en-US",
		viewport: { width: 1280, height: 800 },
		deviceScaleFactor: 2,
		colorScheme: "light",
		actionTimeout: 8_000,
	},
	webServer: {
		command: "sh scripts/guide-screenshots/server.sh",
		cwd: "../..",
		url: "http://localhost:4175/api/health",
		timeout: 180_000,
		reuseExistingServer: false,
	},
});
