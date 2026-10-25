import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useKeyboard } from "../keyboard/KeyboardProvider";
import { sharedEntry } from "../lib/share";

/**
 * The manifest's share target (SPEC §11): another app shared something, so
 * open Quick Entry with it and show the Inbox behind.
 */
export function SharePage() {
	const { openQuickEntry } = useKeyboard();
	const navigate = useNavigate();
	const handled = useRef(false);

	useEffect(() => {
		if (handled.current) return;
		handled.current = true;
		const params = new URLSearchParams(window.location.search);
		const entry = sharedEntry({
			title: params.get("title"),
			text: params.get("text"),
			url: params.get("url"),
		});
		void navigate({ to: "/inbox", replace: true }).then(() =>
			openQuickEntry(entry),
		);
	}, [navigate, openQuickEntry]);

	return null;
}
