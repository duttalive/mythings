import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				// Worker and shared code, inside the Workers runtime.
				plugins: [
					cloudflareTest(async () => ({
						wrangler: { configPath: "./wrangler.jsonc" },
						miniflare: {
							bindings: {
								TEST_MIGRATIONS: await readD1Migrations(
									"./worker/db/migrations",
								),
								// Emails stay in memory; tests read them from GET /api/dev/mail.
								DEV_MAILBOX: "true",
								// Production keeps sign-ups closed; most tests need them open.
								SIGNUPS_OPEN: "true",
								// A key pair used only by tests.
								VAPID_PUBLIC_KEY:
									"BDb8sP4xNYW2JOC9d70M_OBhMjyZz-GZXtOyH4mTR3mkUoVm_6CYaHInnuaWi2kAX1GH8YqwI1np6nsCx9TmZK8",
								VAPID_PRIVATE_KEY:
									"-Oz6zgCXpXwtlSoWN6Qmc41YQbruCbC7GeM1Cn-305M",
							},
						},
					})),
				],
				test: {
					name: "worker",
					include: ["tests/worker/**/*.test.ts", "tests/shared/**/*.test.ts"],
					setupFiles: ["./tests/setup.ts"],
				},
			},
			{
				// Browser-side code, in Node with an in-memory IndexedDB.
				test: {
					name: "client",
					include: ["tests/client/**/*.test.ts"],
					environment: "node",
					setupFiles: ["fake-indexeddb/auto"],
				},
			},
		],
	},
});
