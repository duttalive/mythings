import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { registerPwa } from "./pwa/register";
// Lexend, bundled (and precached by the service worker) so it works offline.
import "@fontsource-variable/lexend";
import "./styles.css";

// Before anything else, so the app shell is cached even if sign-in never completes.
registerPwa();

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
