// Shows a new recovery key with ways to keep it, and asks to confirm it's saved.

import { useId, useState } from "react";
import { secondaryButtonClass } from "../components/ui";

export function RecoveryKeyCard({
	recoveryKey,
	saved,
	onSavedChange,
}: {
	recoveryKey: string;
	saved: boolean;
	onSavedChange: (saved: boolean) => void;
}) {
	const [copied, setCopied] = useState(false);
	const checkId = useId();

	const download = () => {
		const text = `mythings recovery key\n\n${recoveryKey}\n\nYou need this key to read your encrypted tasks if you forget your password. Keep it somewhere safe, like a password manager.\n`;
		const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
		const link = Object.assign(document.createElement("a"), {
			href: url,
			download: "mythings-recovery-key.txt",
		});
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(recoveryKey);
			setCopied(true);
		} catch {
			setCopied(false);
		}
	};

	return (
		<div className="flex flex-col gap-3 rounded-xl bg-[var(--segment)] p-4 ring-1 ring-[var(--border)]">
			<p className="text-sm font-medium">Your recovery key</p>
			<p
				data-testid="recovery-key"
				className="font-mono text-base break-all select-all"
			>
				{recoveryKey}
			</p>
			<p className="text-xs text-[var(--fg-muted)]">
				If you forget your password, this key is the only way to read your
				tasks. We can't recover them for you. Keep it somewhere safe, like a
				password manager.
			</p>
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() => void copy()}
					className={secondaryButtonClass}
				>
					<span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
				</button>
				<button
					type="button"
					onClick={download}
					className={secondaryButtonClass}
				>
					Download
				</button>
			</div>
			<label
				htmlFor={checkId}
				className="flex cursor-pointer items-start gap-2 text-sm pointer-coarse:py-1"
			>
				<input
					id={checkId}
					type="checkbox"
					checked={saved}
					onChange={(e) => onSavedChange(e.target.checked)}
					className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
				/>
				I've saved my recovery key somewhere safe.
			</label>
		</div>
	);
}
