import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Libraries in their own chunks: smaller files, and they stay cached across app releases.
const vendorChunks: [name: string, test: RegExp][] = [
	["react", /node_modules[\\/](react|react-dom|scheduler)[\\/]/],
	["router", /node_modules[\\/]@tanstack[\\/]/],
	["ui", /node_modules[\\/](@radix-ui|@floating-ui|@dnd-kit)[\\/]/],
	["dates", /node_modules[\\/]chrono-node[\\/]/],
	["data", /node_modules[\\/](dexie|zod|fractional-indexing|ulid)[\\/]/],
];

export default defineConfig({
	environments: {
		client: {
			build: {
				rolldownOptions: {
					output: {
						codeSplitting: {
							groups: vendorChunks.map(([name, test]) => ({ name, test })),
						},
					},
				},
			},
		},
	},
	plugins: [
		react(),
		tailwindcss(),
		cloudflare({
			// End-to-end tests run against their own throwaway local state (scripts/e2e-server.sh).
			persistState: process.env.MYTHINGS_STATE
				? { path: process.env.MYTHINGS_STATE }
				: true,
		}),
		VitePWA({
			// Our own service worker (src/sw.ts), for push notifications alongside the precache.
			strategies: "injectManifest",
			srcDir: "src",
			filename: "sw.ts",
			// src/pwa/register.ts applies each new version as soon as it's downloaded
			// (after any in-progress typing), via the SKIP_WAITING message in src/sw.ts.
			registerType: "prompt",
			injectRegister: false,
			injectManifest: {
				globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff2}"],
			},
			includeAssets: [
				"favicon.svg",
				"favicon.ico",
				"apple-touch-icon-180x180.png",
			],
			manifest: {
				name: "mythings",
				short_name: "mythings",
				description: "A calm, local-first to-do list.",
				start_url: "/today",
				scope: "/",
				display: "standalone",
				background_color: "#1c1c1e",
				theme_color: "#2f63e6",
				icons: [
					{ src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
					{ src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
					{ src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
					{
						src: "maskable-icon-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
				// Share a page or text from other apps into Quick Entry (SPEC §10.4).
				share_target: {
					action: "/share",
					method: "GET",
					params: { title: "title", text: "text", url: "url" },
				},
				shortcuts: [
					{
						name: "Today",
						url: "/today",
						icons: [{ src: "pwa-192x192.png", sizes: "192x192" }],
					},
					{
						name: "Inbox",
						url: "/inbox",
						icons: [{ src: "pwa-192x192.png", sizes: "192x192" }],
					},
				],
			},
			devOptions: {
				// A service worker in dev too, so reminders can be tried locally.
				enabled: true,
				type: "module",
				navigateFallback: "index.html",
			},
		}),
	],
});
