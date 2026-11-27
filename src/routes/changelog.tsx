// /changelog: public (no sign-in), rendered from CHANGELOG.md.

import { useEffect } from "react";
import { releases } from "../changelog";
import { buttonClass } from "../components/ui";

const formatDate = (date: string) =>
	new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
		year: "numeric",
		month: "long",
		day: "numeric",
		timeZone: "UTC",
	});

export function ChangelogPage() {
	useEffect(() => {
		document.title = "Changelog · mythings";
	}, []);
	return (
		<main className="mx-auto w-full max-w-[42rem] px-[max(1rem,env(safe-area-inset-left))] py-12 md:px-8">
			<header className="flex items-center gap-3">
				<img src="/favicon.svg" alt="" className="size-9 shrink-0" />
				<div className="min-w-0 flex-1">
					<h1 className="text-2xl font-bold">What's new in mythings</h1>
					<p className="text-sm text-[var(--fg-muted)]">
						Every release, newest first.
					</p>
				</div>
				<a href="/today" className={buttonClass}>
					Open mythings
				</a>
			</header>
			{releases.map((release) => (
				<article
					key={release.version}
					aria-labelledby={`v${release.version}`}
					className="mt-10 border-t border-[var(--border)] pt-6"
				>
					<h2
						id={`v${release.version}`}
						className="flex items-baseline gap-3 text-lg font-semibold"
					>
						Version {release.version}
						<time
							dateTime={release.date}
							className="text-sm font-normal text-[var(--fg-muted)]"
						>
							{formatDate(release.date)}
						</time>
					</h2>
					{release.blocks.map((block) =>
						block.kind === "text" ? (
							<p key={block.text} className="mt-3 leading-relaxed">
								{block.text}
							</p>
						) : (
							<ul
								key={block.items.join("\n")}
								className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed"
							>
								{block.items.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						),
					)}
				</article>
			))}
		</main>
	);
}
