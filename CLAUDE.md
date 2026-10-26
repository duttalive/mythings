# mythings

A free, open-source, local-first to-do app (Things 3–style). The hosted instance is **https://mythings.dynocoder.com**. SPEC.md is the full design; README.md covers setup.

## Architecture

- `src/`: Vite + React 19 PWA (TanStack Router, Tailwind v4, Radix popovers, dnd-kit). Font: Lexend, self-hosted via `@fontsource-variable/lexend` (works offline).
- `worker/`: Hono API on Cloudflare Workers. D1 holds users, sessions, push subscriptions and password resets.
- One `UserStore` Durable Object per user (SQLite) holds that user's to-dos and is the source of truth; it streams changes over a hibernating WebSocket and runs alarms (repeats, reminders, Trash purge).
- Clients keep a full copy in IndexedDB (Dexie) with an outbox, so every device works offline. Sync core: `src/sync/engine.ts` and `src/sync/outbox.ts` (the latter is DOM-free and shared with the service worker's Background Sync).
- `shared/`: schemas (zod), list views, dates, repeat rules: used by both sides.
- Theme colors are CSS variables in `src/styles.css` (light + dark, picked for 4.5:1 contrast); use `text-on-accent` on `bg-accent`.
- Sizes are in rem: the per-device Text size setting scales the root font size (`src/lib/textSize.ts`). Don't add `px` font sizes.
- Phones: use Tailwind's `pointer-coarse:` variant for finger-sized targets (rows ≥ 44px tall), keep fields ≥ 16px on touch (global rule in `styles.css`), and popovers turn into bottom sheets under 640px. The desktop sidebar width is per device (`SidebarResizer.tsx`).
- Auth: sign-up is two steps — `POST /api/auth/signup` takes a name and email and emails a link to `/verify-email?token=…` (pending row in `signup_links`, 24 h; an existing account gets a "you already have an account" email and the same 202). The page the link opens (`VerifyEmailPage`) calls `POST /api/auth/signup/link` to show the email, then `POST /api/auth/signup/verify` takes the token, name *and the password* and creates the account; the password is chosen there so nobody can plant one for someone else's address. `users.name` is nullable (accounts from before 1.4.0 have none until set in Settings). Password reset links come from `POST /api/auth/forgot` (all work after the response). Neither reveals which emails have accounts; keep it that way. Sign-out always confirms (`SignOutButton`) and drops this browser's push subscription.
- Production sign-ups are open (`SIGNUPS_OPEN: "true"`, since 1.3.0); `.dev.vars` sets it `true` for dev and e2e too.
- Signed-out visitors at `/` see the public home page (`src/home/HomePage.tsx`); `/login` and `/signup` show the auth forms, and any other path shows sign-in. `/changelog`, `/privacy` and `/terms` (`src/routes/legal.tsx`; update `LEGAL_UPDATED` when their text changes) are public too.
- Security headers: pages and files get them from `public/_headers` (CSP with a hash of the inline script in `index.html`; `tests/client/headers.test.ts` catches drift, so update the hash when that script changes), the API from `securityHeaders` in `worker/index.ts`. `/api/dev/mail` only answers loopback requests.

## Commands (run pnpm via corepack)

- `corepack pnpm dev`: http://localhost:5173 (needs `.dev.vars`, see `.dev.vars.example`; `pnpm db:migrate:local` after new migrations). With `DEV_MAILBOX=true`, emails aren't sent; read sign-up codes and reset links at http://localhost:5173/api/dev/mail (404 in production, where it's "false").
- `corepack pnpm test`: unit + worker tests. `corepack pnpm e2e`: Playwright in installed Chrome against a production build with throwaway state (`scripts/e2e-server.sh`).
- `corepack pnpm lint` / `format` / `typecheck`. Run all of these plus e2e before shipping.

## Versions and releases (maintainer; always follow)

- Versions are `MAJOR.MINOR.PATCH`, tagged `vX.Y.Z`:
  - **major** (v1 → v2): big upgrades;
  - **minor** (1.0.x → 1.1.0): new features and bug fixes;
  - **patch** (1.0.0 → 1.0.1): small changes and tweaks.
- `CHANGELOG.md` is the single source of truth. Its newest `## Version X.Y.Z — YYYY-MM-DD` entry is the app version (`APP_VERSION` in `src/changelog.ts`), shown in Settings → About and on the public `/changelog` page.
- Ship every production change as a release: `corepack pnpm ship` = `pnpm release` (defaults to patch) → `pnpm run deploy` (build, remote D1 migrations, `wrangler deploy`) → `git push --follow-tags`.
- For a minor or major release, run the steps separately: `pnpm release minor` (or `major`), then `pnpm run deploy`, then `git push --follow-tags`.
- `pnpm release` writes the entry from commit subjects since the last tag, so write subjects as user-facing changes. `--notes "…"` adds a summary line, and `--dry-run` previews. Polish the entry by amending the release commit and re-tagging, before deploying.
- Installed PWAs update themselves: `src/pwa/register.ts` applies a new service worker as soon as it's downloaded (deferred only while typing) and shows "Updated to version X". `public/_headers` keeps `/`, `index.html`, `sw.js` and the manifest `no-cache`. Never switch back to a prompt-to-update flow.

## Deployment config

- Deploy settings live in `wrangler.jsonc` (domain, D1 `database_id`, `APP_ORIGIN`, `MAIL_FROM`, `VAPID_SUBJECT`); they're the hosted instance's, and forks change them (README → "Deploy your own"). The CSP's `connect-src` in `public/_headers` names the same domain.
- Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (only in Cloudflare; `pnpm vapid` makes a new pair). `.dev.vars` overrides vars locally (`APP_ORIGIN=http://localhost:5173`) and is never committed.
- Email: Cloudflare Email Sending via the `EMAIL` binding, from `MAIL_FROM` (sign-up codes and reset links; `worker/mail.ts`).
- Rate limits (`wrangler.jsonc`): login 5/min per IP, per IP+email and per address, change password 5/min per account, sign-up 5/min per IP and per address, reset 3/min per IP, per IP+email and per address. Keyed on `cf-connecting-ip`; local requests (none or loopback) aren't limited.
- D1 schema changes: a new numbered file in `worker/db/migrations/` (applied by `pnpm run deploy`). Durable Object schema changes: `worker/do-migrations.ts`.

## Open source

- Licensed AGPL-3.0-only (`LICENSE`). Contributions follow `CONTRIBUTING.md` (bug fixes directly, features after an agreed issue); security reports go through GitHub private vulnerability reporting (`SECURITY.md`).
- Never commit secrets, real user data, or the maintainer's private notes: those live in the git-ignored `CLAUDE.local.md`.
