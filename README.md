# mythings

**A calm, fast, local-first to-do app that works offline and syncs in real time.**

mythings follows the Things 3 way of working (Inbox → Today → Upcoming → Anytime → Someday → Logbook, with Areas, Projects and Headings) and runs entirely on Cloudflare. Every device keeps a full copy of your data, so the app opens instantly, works with no connection, and syncs everywhere within about a second when you're back online.

[![CI](https://github.com/duttalive/mythings/actions/workflows/ci.yml/badge.svg)](https://github.com/duttalive/mythings/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

- **Hosted instance:** https://mythings.dynocoder.com (free; anyone can create an account)
- **What's new:** [CHANGELOG.md](CHANGELOG.md), also shown in the app at `/changelog`
- **Full design:** [SPEC.md](SPEC.md)

## Features

- **Lists that match how you plan:** Inbox, Today (with This Evening), Upcoming, Anytime, Someday and Logbook, plus Areas, Projects, Headings, checklists and nested tags.
- **Natural scheduling:** type "tomorrow", "next fri" or "in 2 weeks"; deadlines, reminders and repeating to-dos (fixed or after completion).
- **Keyboard first:** Quick Entry, Quick Find and shortcuts for nearly everything, with multi-select and drag and drop.
- **Offline and installable:** a PWA for desktop and phone. Changes made offline are queued and synced when the connection returns, even after the tab is closed (Background Sync, where supported).
- **Real time across devices:** edits stream over a WebSocket.
- **Reminders:** Web Push notifications, with no third-party service.
- **Your data stays yours:** export everything as JSON at any time, and import it into any instance.
- **Comfortable to use:** light and dark themes, adjustable text size, finger-sized targets on phones, and colours chosen for 4.5:1 contrast.

## How it works

| Part                     | Technology                                                                 |
| ------------------------ | -------------------------------------------------------------------------- |
| Client (`src/`)          | React 19 PWA, Vite, TanStack Router, Tailwind CSS v4, Dexie (IndexedDB)    |
| API (`worker/`)          | Hono on Cloudflare Workers                                                 |
| Per-user data            | One Durable Object per user (SQLite): the source of truth, realtime hub and alarms for repeats, reminders and Trash |
| Accounts                 | Cloudflare D1: users, sessions, push subscriptions, sign-up links and password resets |
| Shared code (`shared/`)  | zod schemas, list views, date and repeat logic used by client and server   |

Each change is an operation stored in a local outbox and pushed to the user's Durable Object, which applies it, assigns a revision and broadcasts it to the user's other devices. See [SPEC.md §7](SPEC.md#7-sync-protocol) for the protocol.

## Run it locally

You need Node 22+ and Google Chrome (for the end-to-end tests). pnpm is pinned in `package.json`; run it through corepack, or run `corepack enable` once to get a bare `pnpm`.

```bash
git clone https://github.com/duttalive/mythings.git
cd mythings
corepack pnpm install
cp .dev.vars.example .dev.vars
corepack pnpm db:migrate:local
corepack pnpm dev
```

Open http://localhost:5173 and sign up. Locally, emails aren't sent: open the sign-up link (and any password reset link) from at http://localhost:5173/api/dev/mail.

For reminders while developing, add a VAPID key pair to `.dev.vars`:

```bash
corepack pnpm vapid >> .dev.vars
```

The service worker is only built for production, so test offline behaviour with `corepack pnpm preview`.

## Configuration

Variables are set in `wrangler.jsonc` under `vars`. `.dev.vars` overrides them locally and is never committed.

| Variable                           | Purpose                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `APP_ORIGIN`                       | The app's public origin. Used in email links and to reject cross-site requests.                           |
| `AUTH_MODE`                        | `password` (built-in email and password accounts) or `access` (the app sits behind Cloudflare Access).    |
| `SIGNUPS_OPEN`                     | `"true"` to allow new accounts (the hosted instance is open). Set `"false"` for a private instance.       |
| `MAIL_FROM`                        | Sender address for sign-up links and password reset emails (Cloudflare Email Sending).                    |
| `VAPID_SUBJECT`                    | A `mailto:` or `https:` contact for push services.                                                        |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | Required in `access` mode, e.g. `myteam.cloudflareaccess.com` and the Access application's AUD tag.       |
| `DEV_MAILBOX`                      | `"true"` only in local development: emails are kept in memory and shown at `/api/dev/mail`.               |

Secrets (set with `wrangler secret put`): `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Without them the app works, but reminders don't notify.

Sign-in, sign-up and password resets are rate-limited per IP and per email address (the `*_LIMITER` bindings in `wrangler.jsonc`).

## Deploy your own

mythings runs on a single Cloudflare Worker with static assets, D1, Durable Objects, rate limiting and Email Sending. The hosted instance runs on the Workers Paid plan; check [Cloudflare's pricing](https://developers.cloudflare.com/workers/platform/pricing/) for what your plan includes.

1. Fork and clone the repository, install dependencies, and sign in: `corepack pnpm exec wrangler login`.
2. Create a database with `corepack pnpm exec wrangler d1 create mythings` and put its `database_id` in `wrangler.jsonc`.
3. In `wrangler.jsonc`, replace the hosted instance's values with yours:
   - `routes`: your custom domain (or remove `routes` and set `"workers_dev": true`);
   - `APP_ORIGIN`, `MAIL_FROM` and `VAPID_SUBJECT`;
   - `SIGNUPS_OPEN`: `"true"` until your account exists.
4. The Privacy Policy and Terms of Service (`src/routes/legal.tsx`) describe the hosted instance: change the operator, contact address and providers to yours.
5. In `public/_headers`, change `wss://mythings.dynocoder.com` in `connect-src` to your own origin, so the realtime connection is allowed.
6. Onboard your sending domain in the Cloudflare dashboard (Email Service → Email Sending). Sign-up needs it to send the confirmation link. If you'd rather not send email, use `AUTH_MODE: "access"` behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/).
6. Generate VAPID keys with `corepack pnpm vapid`, then store each one with `corepack pnpm exec wrangler secret put VAPID_PUBLIC_KEY` (and `VAPID_PRIVATE_KEY`).
7. Deploy with `corepack pnpm run deploy`. This builds the app, applies D1 migrations and deploys the Worker.
8. Create your account, then set `SIGNUPS_OPEN` back to `"false"` and deploy again if the instance is just for you.

To update, pull the latest changes and deploy again. Database migrations are applied automatically, and installed apps update themselves.

## Development

| Script                                   | What it does                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `dev`                                    | Vite dev server with the Worker running in workerd                             |
| `build` / `preview`                      | Production build into `dist/` / build and serve it locally                     |
| `test`                                   | Vitest: unit tests, plus worker tests inside the Workers runtime               |
| `e2e`                                    | Playwright end-to-end tests in Google Chrome against a fresh production build  |
| `typecheck`                              | `tsc -b` across app, worker and tooling                                        |
| `lint` / `format`                        | Biome check / check and fix                                                    |
| `cf-typegen`                             | Regenerate `worker/worker-configuration.d.ts` after changing `wrangler.jsonc`  |
| `db:migrate:local` / `db:migrate:remote` | Apply D1 migrations                                                            |
| `deploy`                                 | Build, apply remote D1 migrations, and deploy                                  |
| `release` / `ship`                       | Maintainer release flow: changelog entry and tag, then deploy and push         |

Run them with `corepack pnpm <script>`. Before opening a pull request, run `lint`, `typecheck`, `test` and `e2e`.

```
src/        React app, service worker (src/sw.ts) and sync engine (src/sync/)
worker/     Hono API, auth, the UserStore Durable Object, D1 migrations
shared/     Schemas, views, dates and repeat rules used by both sides
tests/      Unit and worker tests (Vitest)
e2e/        End-to-end tests (Playwright)
```

[CLAUDE.md](CLAUDE.md) has the conventions the codebase follows (theming, sizing, phone layouts, security headers) and is a good read for people and coding agents alike.

## Contributing

Bug fixes are welcome as pull requests. For new features or larger changes, please [open an issue](https://github.com/duttalive/mythings/issues/new/choose) first so we can agree on the approach. See [CONTRIBUTING.md](CONTRIBUTING.md), and please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please don't report vulnerabilities in public issues. See [SECURITY.md](SECURITY.md) for how to report one privately.

## License

[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). You can use, change and self-host mythings freely. If you run a modified version for other people over a network, you must offer them its source code.

"Things" is a trademark of Cultured Code GmbH & Co. KG. mythings is an independent project, not affiliated with or endorsed by Cultured Code.
