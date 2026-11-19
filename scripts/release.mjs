#!/usr/bin/env node
// Cuts the next release: adds "## Version X.Y.Z — date" to CHANGELOG.md listing
// the commits since the last release tag, stamps the version in
// Core_User_Guide.md, commits both as "Release version X.Y.Z", and tags it
// vX.Y.Z (annotated, so `git push --follow-tags` pushes it).
//
// The user guide must keep up: if the app changed since the last release but
// the guide didn't, the release stops. Update the guide (or, for a release
// with nothing users would notice, pass --guide-unchanged).
//
// Versions are MAJOR.MINOR.PATCH (see CLAUDE.md):
//   node scripts/release.mjs [patch]   # 1.0.0 → 1.0.1  small changes (default)
//   node scripts/release.mjs minor     # 1.0.1 → 1.1.0  features and bug fixes
//   node scripts/release.mjs major     # 1.1.0 → 2.0.0  big upgrades
//   … --notes "Text"                   # a summary line on top of the entry
//   … --dry-run                        # print the entry, change nothing
//   … --guide-unchanged                # nothing in the guide needed changing

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "CHANGELOG.md";
const GUIDE = "Core_User_Guide.md";
// Where users would notice a change: the app, its API and its static files.
const APP_PATHS = ["src/", "shared/", "worker/", "public/", "index.html"];
const GUIDE_STAMP = /<!-- guide-version: [\d.]+ -->/;
const GUIDE_LINE = /^_Up to date with mythings \*\*[\d.]+\*\*\./m;
const HEADING = /^## Version (\d+)\.(\d+)\.(\d+) — \d{4}-\d{2}-\d{2}\s*$/m;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const guideUnchanged = args.includes("--guide-unchanged");
const notesAt = args.indexOf("--notes");
const notes = notesAt >= 0 ? args[notesAt + 1]?.trim() : "";
const bump =
	args.find((a) => ["patch", "minor", "major"].includes(a)) ?? "patch";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

if (!dryRun && git("status", "--porcelain")) {
	console.error(
		"Commit or stash your changes first; a release is cut from a clean tree.",
	);
	process.exit(1);
}

const changelog = readFileSync(FILE, "utf8");
const [, ...parts] = changelog.match(HEADING) ?? [null, "0", "0", "0"];
const [major, minor, patch] = parts.map(Number);
const latest = `${major}.${minor}.${patch}`;
const next =
	bump === "major"
		? `${major + 1}.0.0`
		: bump === "minor"
			? `${major}.${minor + 1}.0`
			: `${major}.${minor}.${patch + 1}`;

// Commits since the previous release's tag (1.0.0 was tagged plain "v1").
const previousTag = [`v${latest}`, `v${major}`].find((t) =>
	git("tag", "--list", t),
);
const subjects = git(
	"log",
	...(previousTag ? [`${previousTag}..HEAD`] : []),
	"--no-merges",
	"--format=%s",
)
	.split("\n")
	.map((s) => s.trim())
	.filter((s) => s && !/^Release version /.test(s));

if (subjects.length === 0) {
	console.error(`Nothing to release: no commits since ${previousTag}.`);
	process.exit(1);
}

// Files changed since the previous release.
const changed = git(
	"diff",
	"--name-only",
	...(previousTag ? [previousTag, "HEAD"] : ["HEAD"]),
)
	.split("\n")
	.filter(Boolean);
const appChanged = changed.some((f) => APP_PATHS.some((p) => f.startsWith(p)));
if (appChanged && !changed.includes(GUIDE) && !guideUnchanged) {
	const message = `${GUIDE} hasn't changed since ${previousTag ?? "the last release"}, but the app has. Update it for this release (or pass --guide-unchanged if users won't notice anything).`;
	if (!dryRun) {
		console.error(message);
		process.exit(1);
	}
	console.warn(`Warning: ${message}\n`);
}

// The guide says which version it describes (checked before anything is written).
const guide = readFileSync(GUIDE, "utf8");
if (!GUIDE_STAMP.test(guide) || !GUIDE_LINE.test(guide)) {
	console.error(`${GUIDE} is missing its version lines; see its top.`);
	process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const entry = [
	`## Version ${next} — ${date}`,
	"",
	...(notes ? [notes, ""] : []),
	...subjects.reverse().map((s) => `- ${s}`),
	"",
].join("\n");

if (dryRun) {
	console.log(entry);
	process.exit(0);
}

// Newest first: the entry goes above the previous newest one.
const at = changelog.search(HEADING);
const updated =
	at < 0
		? `${changelog.trimEnd()}\n\n${entry}`
		: `${changelog.slice(0, at)}${entry}\n${changelog.slice(at)}`;
writeFileSync(FILE, updated);
// package.json follows along, so tooling sees the same version.
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = next;
writeFileSync("package.json", `${JSON.stringify(pkg, null, "\t")}\n`);

// The guide follows along too.
writeFileSync(
	GUIDE,
	guide
		.replace(GUIDE_STAMP, `<!-- guide-version: ${next} -->`)
		.replace(GUIDE_LINE, `_Up to date with mythings **${next}**.`),
);

git("add", FILE, "package.json", GUIDE);
git("commit", "-m", `Release version ${next}`);
git("tag", "-a", `v${next}`, "-m", `Version ${next}`);
console.log(
	`Released version ${next} (tag v${next}). Next: pnpm run deploy && git push --follow-tags`,
);
