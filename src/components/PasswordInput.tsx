// A password field with a button that shows or hides what was typed.

import { type ComponentProps, useState } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";

type Props = Omit<ComponentProps<"input">, "type">;

export function PasswordInput({ className = "", ...props }: Props) {
	const [visible, setVisible] = useState(false);
	return (
		<div className="relative">
			<input
				{...props}
				type={visible ? "text" : "password"}
				autoCapitalize="none"
				autoCorrect="off"
				spellCheck={false}
				className={`${className} pr-10 pointer-coarse:pr-12`}
			/>
			<button
				type="button"
				onClick={() => setVisible((v) => !v)}
				aria-label={visible ? "Hide password" : "Show password"}
				aria-controls={props.id}
				title={visible ? "Hide password" : "Show password"}
				className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:w-12"
			>
				{visible ? (
					<EyeOffIcon className="size-[1.125rem]" />
				) : (
					<EyeIcon className="size-[1.125rem]" />
				)}
			</button>
		</div>
	);
}
