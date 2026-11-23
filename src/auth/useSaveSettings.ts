// Changes an account setting from anywhere in the app (the sidebar, the top
// bar): shown at once, saved to the account, and put back if saving fails.

import { useCallback } from "react";
import type { Me, Settings } from "../../shared/schema";
import { api } from "../api";
import { useToast } from "../components/Toast";
import { useAuth } from "./AuthGate";

export function useSaveSettings() {
	const { user, updateUser } = useAuth();
	const toast = useToast();
	return useCallback(
		async (settings: Settings) => {
			const before = user;
			updateUser({ ...user, settings: { ...user.settings, ...settings } });
			try {
				updateUser(
					await api<Me>("/me", { method: "PATCH", body: { settings } }),
				);
			} catch {
				updateUser(before);
				toast.show("Couldn't save that change. Check your connection.");
			}
		},
		[user, updateUser, toast],
	);
}
