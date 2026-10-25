import { Modal } from "../components/Modal";
import { formatCombo } from "./keys";
import { SHORTCUTS, type ShortcutGroup } from "./shortcuts";

const GROUPS: ShortcutGroup[] = [
	"Create",
	"Navigate",
	"Edit",
	"Schedule",
	"Other",
];

/** Renders a combo, or a sequence like "g i", or a hint like "a…z". */
function Keys({ combo }: { combo: string }) {
	const parts = combo.includes(" ") ? combo.split(" ") : [combo];
	return (
		<span className="inline-flex gap-1">
			{parts.map((part) => (
				<kbd
					key={part}
					className="rounded border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 font-sans text-xs text-[var(--fg)]"
				>
					{part === "a…z" ? part : formatCombo(part)}
				</kbd>
			))}
		</span>
	);
}

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
	return (
		<Modal title="Keyboard Shortcuts" onClose={onClose} width="max-w-2xl">
			<div className="grid max-h-[70vh] gap-x-8 gap-y-5 overflow-y-auto p-4 sm:grid-cols-2">
				{GROUPS.map((group) => (
					<section key={group}>
						<h3 className="mb-1.5 text-xs font-semibold text-[var(--fg-muted)] uppercase">
							{group}
						</h3>
						<dl className="flex flex-col gap-1.5 text-sm">
							{SHORTCUTS.filter((s) => s.group === group).map((s) => (
								<div
									key={s.label}
									className="flex items-start justify-between gap-3"
								>
									<dt>{s.label}</dt>
									<dd className="flex shrink-0 flex-wrap justify-end gap-1">
										{s.combos.slice(0, 2).map((c) => (
											<Keys key={c} combo={c} />
										))}
									</dd>
								</div>
							))}
						</dl>
					</section>
				))}
			</div>
		</Modal>
	);
}
