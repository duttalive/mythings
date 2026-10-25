import { defineConfig } from "@playwright/test";

// End-to-end tests (SPEC §12), against a production build served by
// scripts/e2e-server.sh. They use the installed Google Chrome.
export default defineConfig({
	testDir: "e2e",
	timeout: 30_000,
	expect: { timeout: 5_000 },
	fullyParallel: false,
	workers: 2,
	retries: 0,
	reporter: [["list"]],
	use: {
		baseURL: "http://localhost:4174",
		channel: "chrome",
		trace: "retain-on-failure",
		timezoneId: "Europe/Berlin",
	},
	webServer: {
		command: "sh scripts/e2e-server.sh",
		url: "http://localhost:4174/api/health",
		timeout: 180_000,
		reuseExistingServer: false,
	},
});
