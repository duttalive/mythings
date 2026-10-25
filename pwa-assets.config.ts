// Icons for the web app manifest, generated from public/favicon.svg:
//   corepack pnpm exec pwa-assets-generator
import {
	defineConfig,
	minimal2023Preset,
} from "@vite-pwa/assets-generator/config";

export default defineConfig({
	headLinkOptions: { preset: "2023" },
	preset: {
		...minimal2023Preset,
		// The mark sits on its own blue tile; maskable/Apple icons fill the safe zone with the same blue.
		maskable: {
			...minimal2023Preset.maskable,
			padding: 0.25,
			resizeOptions: { background: "#2f63e6" },
		},
		apple: {
			...minimal2023Preset.apple,
			padding: 0.25,
			resizeOptions: { background: "#2f63e6" },
		},
	},
	images: ["public/favicon.svg"],
});
