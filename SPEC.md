# mythings — Build Spec

A personal task manager in the spirit of Things 3, built entirely on Cloudflare. This document is a one-shot build brief: an engineer (or coding agent) should be able to build, test and deploy v1 from this file alone.

> **Naming & IP:** "Things" is a trademark of Cultured Code. This project is called **mythings**. Clone the _workflow_ (Inbox → Today → Upcoming → Anytime → Someday → Logbook, Areas/Projects/Headings), not the branding, icons, copy or exact visual design.

---

## 1. Goals

- **Fast and calm.** Every interaction feels instant (optimistic, local-first). Keyboard-first, mouse-friendly.
- **Works offline.** Full read/write offline; syncs when back online.
- **Realtime across devices.** Edit on laptop, see it on phone within ~1s.
- **Installable PWA** on desktop and mobile.
- **Cheap to run.** Fits comfortably in Cloudflare's free / $5 Workers Paid tier for personal use.

### Non-goals (v1)

- Team collaboration / shared lists.
- Native apps, Apple Watch, OS-global quick-entry hotkey.
- Calendar integration (Upcoming shows to-dos only).
- Email-to-inbox (listed as v2).

---

## 2. Stack

| Layer          | Choice                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Runtime        | **Cloudflare Workers** (one Worker serves API + static assets)                                         |
| Static hosting | **Workers Static Assets** (SPA mode, `not_found_handling: "single-page-application"`)                  |
| API framework  | **Hono**                                                                                               |
| Global DB      | **D1** — users, sessions, push subscriptions only                                                      |
| Per-user data  | **Durable Object with SQLite storage** (`UserStore`, one instance per user) — all task data lives here |
| Realtime       | DO **WebSocket Hibernation API**                                                                       |
| Scheduling     | DO **alarms** (repeat materialization, reminders)                                                      |
| Files (v2)     | R2 for attachments                                                                                     |
| Frontend       | **React 19 + TypeScript + Vite**, `@cloudflare/vite-plugin`                                            |
| Client store   | **Dexie** (IndexedDB) as the local source of truth + `dexie-react-hooks` `useLiveQuery`                |
| Routing        | TanStack Router                                                                                        |
| Styling        | Tailwind CSS v4 + Radix UI primitives (popover, dialog, context menu)                                  |
| Drag & drop    | `@dnd-kit/core` + `@dnd-kit/sortable`                                                                  |
| Ordering       | `fractional-indexing` (string sort keys)                                                               |
| IDs            | ULID, generated on the client                                                                          |
| Date parsing   | `chrono-node` for natural language ("tmrw", "next fri", "in 3 days")                                   |
| Validation     | `zod` (shared between client and worker)                                                               |
| Tests          | Vitest + `@cloudflare/vitest-pool-workers`; Playwright for e2e                                         |
| Lang/tooling   | TypeScript strict, pnpm, Biome                                                                         |

**Why per-user Durable Objects instead of D1 for tasks:** each user's data is small, strongly consistent, single-writer, and co-located with that user's WebSocket connections. The DO is the sync authority, so there are no cross-request race conditions and no global DB hot spot. D1 holds only the global data needed to authenticate and route to the right DO.

---

## 3. Repo layout

```
mythings/
├─ wrangler.jsonc
├─ package.json
├─ vite.config.ts
├─ shared/                 # imported by both client and worker
│  ├─ schema.ts            # zod schemas + TS types for entities and ops
│  ├─ views.ts             # pure functions that derive list membership (Today, Upcoming…)
│  ├─ repeat.ts            # recurrence rule → next date(s)
│  └─ dates.ts             # local-date helpers (YYYY-MM-DD strings, tz-aware)
├─ worker/
│  ├─ index.ts             # Hono app, routes, DO export
│  ├─ auth.ts              # signup/login/logout, password hashing, session middleware
│  ├─ user-store.ts        # UserStore Durable Object
│  ├─ db/migrations/       # D1 migrations
│  └─ do-migrations.ts     # SQLite schema migrations inside the DO
├─ src/                    # React app
│  ├─ main.tsx
│  ├─ db/local.ts          # Dexie schema
│  ├─ sync/                # outbox, socket client, pull/push
│  ├─ routes/              # inbox, today, upcoming, anytime, someday, logbook, trash, project/$id, area/$id, tag/$id
│  ├─ components/
│  ├─ keyboard/            # shortcut registry
│  └─ styles.css
├─ public/                 # manifest.webmanifest, icons, sw.js
└─ tests/
   ├─ worker/              # vitest-pool-workers
   ├─ shared/              # unit tests for views/repeat/dates
   └─ e2e/                 # playwright
```

---

## 4. Cloudflare config

`wrangler.jsonc`:

```jsonc
{
	"name": "mythings",
	"main": "worker/index.ts",
	"compatibility_date": "2026-10-01",
	"compatibility_flags": ["nodejs_compat"],
	"assets": {
		"directory": "./dist/client",
		"not_found_handling": "single-page-application",
		"run_worker_first": ["/api/*"]
	},
	"d1_databases": [
		{
			"binding": "DB",
			"database_name": "mythings",
			"database_id": "<fill>",
			"migrations_dir": "worker/db/migrations"
		}
	],
	"durable_objects": {
		"bindings": [{ "name": "USER_STORE", "class_name": "UserStore" }]
	},
	"migrations": [{ "tag": "v1", "new_sqlite_classes": ["UserStore"] }],
	"vars": { "APP_ORIGIN": "https://mythings.example.com" }
	// secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, SESSION_SECRET
}
```

---

## 5. Domain model

All task entities live in the user's DO SQLite **and** are mirrored in the client's Dexie DB, using the same shape. Every row has:

```ts
id: string; // ULID, client-generated
createdAt: number; // ms epoch
updatedAt: number; // ms epoch (server-assigned on apply)
deletedAt: number | null; // soft delete → Trash; hard-purged after 30 days
rev: number; // server sequence number of last change (for sync)
```

### 5.1 Area

`title`, `sortKey`, `tagIds[]`.
Ongoing responsibility (Work, Home). Contains projects and loose to-dos. Never "completes".

### 5.2 Project

`title`, `notes` (markdown), `areaId|null`, `status: "open"|"completed"|"canceled"`, `completedAt`,
`when` (see 5.5), `startDate`, `evening`, `deadline`, `sortKey` (within area or top-level), `todaySortKey`, `tagIds[]`, `repeat|null`, `repeatTemplateId|null`.
Shows a progress ring = completed / (open + completed) to-dos.
Completing a project with open to-dos prompts: "Mark remaining as completed / canceled".

### 5.3 Heading

`projectId`, `title`, `sortKey`, `archived: boolean`.
Groups to-dos inside a project. "Archive heading" moves it and its done items to the bottom, collapsed.

Implementation notes (milestone 9):
- Completing a project from its progress ring asks what to do with any remaining open to-dos ("Mark remaining as Completed / Canceled"); one batch updates them and the project. "Cancel Project" cancels remaining to-dos without asking. Reopening a project leaves its to-dos as they are.
- A heading can be archived only once nothing under it is open; archived headings sit collapsed at the bottom of the project and can be unarchived. Deleting a heading moves its to-dos to Trash with it.
- New projects and areas come from the sidebar's "+ New List" (a project created while an area is open goes into that area) or an area's menu, and open with the title focused. Projects can be moved between areas from their menu.

### 5.4 To-do

`title`, `notes` (markdown), `status`, `completedAt`,
`projectId|null`, `headingId|null`, `areaId|null` (only when not in a project),
`when`, `startDate`, `evening`, `deadline`, `reminderAt|null` (ms epoch),
`sortKey` (within container), `todaySortKey`, `tagIds[]`, `repeat|null`, `repeatTemplateId|null`.

### 5.5 Scheduling ("When")

```ts
when: "inbox" | "anytime" | "someday" | "scheduled";
startDate: string | null; // "YYYY-MM-DD" in the user's local tz; required when when === "scheduled"
evening: boolean; // only meaningful when it appears in Today
deadline: string | null; // "YYYY-MM-DD"
```

- "Today" in the UI = `when: "scheduled"` + `startDate: today`.
- On local midnight, items with `startDate <= today` simply appear in Today; nothing is rewritten.
- `evening` resets to `false` when an item rolls into a new day (handled client-side on display: evening only applies when `startDate === today`; otherwise treat as false).

### 5.6 ChecklistItem

`todoId`, `title`, `done: boolean`, `sortKey`.

### 5.7 Tag

`title`, `parentId|null` (nested tags), `shortcut|null` (single char, e.g. `"e"`), `sortKey`.
Filtering by a parent tag includes its children.

### 5.8 Repeat rule

```ts
repeat: {
  mode: "fixed" | "afterCompletion",
  freq: "daily" | "weekly" | "monthly" | "yearly",
  interval: number,             // every N units
  byWeekday?: number[],         // 0=Sun..6=Sat, weekly only
  byMonthDay?: number,          // monthly/yearly: 1..31, -1 = last day
  byMonth?: number,             // yearly: 1..12 (with byMonthDay; Feb 29 falls back to Feb 28)
  byNth?: { n: 1|2|3|4|-1, weekday: number }, // monthly: "2nd Tuesday", "last Friday"
  deadlineOffsetDays?: number,  // instance deadline = startDate + offset
  reminderTime?: "HH:mm",
  endsOn?: string | null,       // YYYY-MM-DD
  nextDate: string              // next instance's startDate
}
```
Valid combinations: fixed daily has no `by*` fields; fixed weekly may have `byWeekday`; fixed monthly has exactly one of `byMonthDay`/`byNth`; fixed yearly has `byMonth` + `byMonthDay`; `afterCompletion` has none. Weeks for "every N weeks" begin on the user's `weekStart` setting.

A to-do/project with `repeat` is a **template**: it is hidden from normal lists and shown under Upcoming with a ↻ icon. Instances are copies with `repeatTemplateId` set (title, notes, checklist, tags, project/heading/area copied).
- `fixed`: the DO alarm materializes the instance on `nextDate`, then advances `nextDate`.
- `afterCompletion`: when the current instance is completed or canceled, the template's `nextDate` becomes the completion date + interval; the instance itself is created when that date arrives, just like `fixed`, so a series never has more than one pending instance.
- A project instance copies the template's headings and open to-dos (with their checklists).
- An instance on a given date is never created twice, even if the earlier one was deleted. When a series passes `endsOn`, its `nextDate` is parked just past `endsOn`, which hides it from Upcoming.
- Materialize at most one instance ahead. Missed days (server down / long offline) produce only the most recent instance, not a backlog.

### 5.9 Ordering

Every orderable thing has a string `sortKey` from `fractional-indexing`. Moving an item writes one row. To-dos also have `todaySortKey` so Today has its own manual order independent of project order.

---

## 6. Derived lists (pure functions in `shared/views.ts`)

`today` = user's local date. "Open" = `status === "open" && deletedAt === null && repeat === null`.
An item whose project is `someday` (or whose project is not open) is excluded from Today/Anytime.

| List           | Membership                                                                                            | Grouping / order                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Inbox**      | open, `when === "inbox"`                                                                              | `sortKey`                                                                                                                                                                       |
| **Today**      | open, and (`when === "scheduled" && startDate <= today`)**or** `deadline <= today`                    | Two sections: main, then **This Evening** (`evening`). Ordered by `todaySortKey`. Overdue deadlines show red "N days ago". Also includes open projects that meet the same rule. |
| **Upcoming**   | open with `when === "scheduled" && startDate > today`, **plus** repeat templates by `repeat.nextDate` | Next 7 days as individual day headers ("Tomorrow", "Wed 29"), then rest of the month, then by month. Days with no items still render in the 7-day band.                         |
| **Anytime**    | open, `when === "anytime"` or (`scheduled` and `startDate <= today`)                                  | Grouped by Area → Project; loose to-dos first. Items also in Today show a ★.                                                                                                    |
| **Someday**    | open, `when === "someday"`                                                                            | Grouped by Area → Project.                                                                                                                                                      |
| **Logbook**    | `status !== "open"`, not deleted                                                                      | Grouped by `completedAt` day, newest first. Paginate.                                                                                                                           |
| **Trash**      | `deletedAt !== null`                                                                                  | "Empty Trash" button (confirm).                                                                                                                                                 |
| **Project**    | to-dos with `projectId`                                                                               | Loose to-dos, then each heading; archived headings and repeat templates listed separately.                                                                                      |
| **Area**       | projects + loose to-dos in that area                                                                  | Projects first (with progress ring), then to-dos.                                                                                                                               |
| **Tag filter** | Any list can be filtered by one or more tags via a tag bar at the top                                 | —                                                                                                                                                                               |

Sidebar badge counts: Inbox = count; Today = count, plus a red count of Today items whose deadline is today or past.

Details settled in implementation (`shared/views.ts`):
- **Logbook timing** (setting `logbookTiming`): `"immediately"` (default) moves completed items straight to the Logbook. `"daily"` keeps items completed today in their lists, struck through, and moves them to the Logbook tomorrow.
- **Today order:** items without a `todaySortKey` (never placed in Today) come first, oldest first, then by `todaySortKey`.
- **Upcoming:** the "rest of the month" group covers the month containing the 7th day; repeat templates whose `nextDate` is today or earlier are awaiting materialization and are not shown.
- **Anytime** includes active projects even when they have no visible to-dos.
- **Someday** shows someday projects as entries without their to-dos, plus someday to-dos outside someday projects.
- **Logbook** files a finished project's to-dos under the project, and paginates with a `{completedAt, id}` cursor.
- **Trash** lists only top-level deleted items (a deleted project's to-dos are restored with it).
- **Tag filter** requires every selected tag (or a descendant of it); items inherit tags from their project and area.
- **Tag page** (`/tag/$id`, `tagged`) lists open to-dos and projects carrying the tag or a descendant, grouped like Anytime.
- **Sidebar** (`sidebarTree`) shows open projects outside areas first, then every live area (even empty) with its open projects; someday projects are dimmed.

These functions take arrays of entities and return view models. They run on the client against Dexie data, and are unit-tested heavily.

---

## 7. Sync protocol

**Model:** local-first with a server-ordered op log. The client never waits on the network to render a change.

### 7.1 Ops

```ts
type Op = {
	opId: string; // ULID, idempotency key
	entity: "area" | "project" | "heading" | "todo" | "checklist" | "tag";
	entityId: string;
	kind: "upsert" | "delete" | "purge";
	patch?: Record<string, unknown>; // fields changed (upsert); a create sends only the fields set — both sides fill shared defaults (shared/rows.ts)
	clientTs: number;
};
```

### 7.2 Client

1. User action → apply patch to Dexie immediately → append the op to the Dexie `outbox` table.
2. The sync worker (in the page; a Background Sync registration as best-effort) sends outbox ops over the WebSocket in batches of up to 100.
3. Pushes over the socket are one batch at a time: errors for that batch arrive first, then its `ack` (even if every op was rejected); on the ack, delete the batch from the outbox. No ack within 15s, or the socket closing, fails the push, and the next sync uses HTTP.
4. On `changes {rows[], rev}` from the server, upsert the rows into Dexie, **rebasing** them: any still-pending outbox ops for that row are replayed on top of the server row with the same shared `buildRow` the server uses (so derived fields like `when` stay consistent), then store `lastRev`. Rows older than the local copy (`rev` lower) are ignored.
5. On (re)connect: send `hello {lastRev, tz}` → the server replies with all rows where `rev > lastRev` (paged), then live updates. Each `changes` message covers revs `(fromRev, rev]`: the client advances `lastRev` only when `fromRev <= lastRev`, otherwise it applies the rows and sends `hello` again to fill the gap. A `lastRev` ahead of the server gets a full resend (`fromRev: 0`). While the socket is open there is no polling or HTTP pull.
6. If the WebSocket is unavailable, fall back to `POST /api/sync/push` and `GET /api/sync/pull?since=`.
7. A rejected op comes back with the server's current row (`current`, or null if the row doesn't exist); the client replaces its optimistic copy with it (or deletes a rejected create) and reports the error.
8. Local deletes, restores and purges cascade in Dexie the same way as on the server, so Trash and the lists are right while offline.
9. Syncs are single-flight per tab and serialized across tabs with a Web Lock; failures retry with exponential backoff (1s → 60s), and `online`/`visibilitychange` trigger an immediate sync.

### 7.3 Server (UserStore DO)

- Keeps a monotonic `rev` counter in SQLite.
- For each op: skip it if `opId` is already in `applied_ops` (keep the last 10k ops). Otherwise validate it with zod, apply it as a **field-level last-writer-wins merge in server arrival order**, set `rev = ++counter` and `updatedAt = now`, and record the opId. Use one SQLite transaction per batch.
- Broadcast the changed rows to **all** of the user's sockets — including the sender, which gets the canonical (normalized) rows that way — whether the push came over a socket or HTTP. Send that push's errors and then its ack to the sender only.
- Each op succeeds or is rejected on its own, with an error code: `invalid_op` (malformed), `invalid_row` (the merged row breaks a §5 invariant), `missing_reference` (points at a missing or deleted row), `invalid_reference` (a heading from another project), `cycle` (nested tags), `not_found` (delete/purge of an unknown row).
- Normalization before validation, based on what the patch sets: setting `startDate` makes the item `scheduled`; any other `when` clears `startDate` and `evening`; `status` stamps or clears `completedAt` (using `clientTs`); moving a to-do to an area, project or heading clears the containers it left and takes it out of the Inbox; moving it to the Inbox clears its containers; moving a heading moves its to-dos.
- Delete is a soft delete that cascades (area → projects and loose to-dos; project → headings and to-dos; heading → to-dos; tag → child tags). Children share the parent's `deletedAt`, so restoring the parent (`deletedAt: null`) restores exactly the children deleted with it.
- Purge removes rows permanently (to-dos take their checklist items; purged tags are removed from items' `tagIds`) and records a tombstone, so pulls report `purged: {entity, id}[]` alongside `rows`.
- After every batch, due repeat instances are materialized (§5.8) in the same transaction.

### 7.4 WebSocket messages

```
C→S  { type: "hello", lastRev, tz }
C→S  { type: "push", ops: Op[] }   // 1–100 ops
S→C  { type: "ack", opIds, rev }
S→C  { type: "changes", rows: {entity, row}[], purged: {entity, id}[], fromRev, rev, more: boolean }
S→C  { type: "error", opId?, code, message }
```
The Worker authenticates `GET /api/sync/ws` (session + same-origin `Origin`), then forwards it to the user's UserStore, which calls `ctx.acceptWebSocket()` (hibernation) and stores the user's `{tz, weekStart}` with `serializeAttachment`. `"ping"` is answered with `"pong"` by `setWebSocketAutoResponse` without waking the object; the client pings every 25s and reconnects if no pong arrives within 10s. Reconnects back off exponentially with jitter (1s → 30s) and happen immediately on `online`.

---

## 8. HTTP API (Hono, all under `/api`)

| Method | Path                       | Purpose                                                                                             |
| ------ | -------------------------- | --------------------------------------------------------------------------------------------------- |
| POST   | `/auth/signup`             | `{name, email}` → emails a 24-hour link to `/verify-email?token=` (no account yet). Can be disabled with `SIGNUPS_OPEN=false`. |
| POST   | `/auth/signup/link`        | `{token}` → `{email, name}` for the page the link opens                                             |
| POST   | `/auth/signup/verify`      | `{token, name, password}` → creates user, sets session cookie                                       |
| POST   | `/auth/login`              | `{email, password}` → session cookie                                                                |
| POST   | `/auth/logout`             | clears session                                                                                      |
| POST   | `/auth/password`           | `{currentPassword, newPassword}` → changes it and signs out other devices                           |
| POST   | `/auth/logout-all`         | ends every session of the user, this one included                                                   |
| GET    | `/me`                      | `{id, email, name, tz, settings}`                                                                       |
| PATCH  | `/me`                      | update `name`, `tz`, settings                                                                       |
| GET    | `/sync/ws`                 | WebSocket upgrade → forwarded to `USER_STORE.idFromName(userId)`                                    |
| POST   | `/sync/push`               | fallback push: `{ops}` → `{acked, errors, rows, purged, rev}`                                       |
| GET    | `/sync/pull?since=&limit=` | fallback pull → `{rows, purged, rev, more}`; continue from `rev` while `more`                       |
| GET    | `/export`                  | full JSON export of the user's data                                                                 |
| POST   | `/import`                  | JSON import (own format; v2: Things 3 export via its URL-scheme JSON)                               |
| POST   | `/push/subscribe`          | save a Web Push subscription                                                                        |
| DELETE | `/push/subscribe`          | remove it                                                                                           |

**Auth:**
- Passwords: PBKDF2-SHA256 via WebCrypto, 100k iterations (the Workers runtime has historically capped PBKDF2 at 100k), 16-byte salt. The hash stores its iteration count (`pbkdf2_sha256$<iter>$<salt>$<hash>`) so it can be raised later; weaker hashes are upgraded on successful login.
- Sessions: a random 32-byte token in an `HttpOnly; Secure; SameSite=Lax` cookie; store only its SHA-256 in D1; 30-day sliding expiry, and at most 180 days after sign-in.
- Rate limits (Workers Rate Limiting binding, `wrangler.jsonc`): login 5/min per IP, IP+email and email; sign-up 5/min per IP and per address; reset 3/min per IP, IP+email and address.
- Longer limits in D1 (`worker/limits.ts`): account emails (sign-up, reset) to one address at most once a minute and 5 times a day; 10 failed sign-ins in a row lock that email's password sign-in for 15 minutes (counted for unknown emails too; cleared by a successful sign-in or a reset).
- Links: sign-up 24 hours, password reset 1 hour; both single-use, only the newest works.
- Check `Origin` against `APP_ORIGIN` on state-changing requests and on the WS upgrade.
- _Single-user alternative:_ put the whole app behind **Cloudflare Access** and derive the user from the email claim of the `Cf-Access-Jwt-Assertion` JWT, verified against the team's certs (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`). Make this switchable with `AUTH_MODE=password|access`.

**D1 schema:**
```sql
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT NOT NULL,
  tz TEXT NOT NULL DEFAULT 'UTC', settings TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL, user_agent TEXT);
CREATE TABLE push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL);
```

**DO SQLite schema:** one table per entity (columns as in §5; arrays such as `tag_ids` and `repeat` stored as JSON text), plus:
```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);      -- rev counter, tz, schema version
CREATE TABLE applied_ops (op_id TEXT PRIMARY KEY, rev INTEGER NOT NULL);
CREATE INDEX idx_<entity>_rev ON <entity>(rev);             -- for pulls
```

---

## 9. Alarms (inside UserStore)

The DO keeps a single alarm set to the earliest of:
- **next local midnight** in the user's tz → materialize `fixed` repeat instances due today; purge Trash items older than 30 days; trim `applied_ops`.
- **earliest pending `reminderAt`** → send Web Push to all of the user's subscriptions (fetch them from D1), then mark the reminder as sent.

Recompute the alarm after any op that touches `reminderAt`/`repeat`, and after a tz change.

Implementation notes (milestone 12):
- The alarm is recomputed after every push and `hello` (cheap), and the DO stores the user's `{userId, tz, weekStart}` from those requests so it can work later. Daily housekeeping runs on every wake (it's idempotent).
- Sent reminders are recorded per to-do with their time, so moving a reminder makes it due again. Reminders missed by more than an hour (set in the past, or the DO couldn't run) are recorded but not sent.
- Expired subscriptions (404/410 from the push service) are deleted. Notifications open the to-do's project, or Today.
- The client asks for notification permission only when a reminder is saved (the Save click carries the prompt), never on load; with permission already granted it re-registers its subscription on start. A small `public/sw.js` handles `push` and `notificationclick` until the PWA service worker (milestone 13) takes over.
- A reminder moves with its to-do's start date (same local time) and is removed when the to-do loses its date. Repeat templates use the rule's `reminderTime`.
- Sync fix found here: a `changes` broadcast now lists the op ids it already includes (`opIds`), and the sender drops them from its outbox before rebasing. Otherwise a broadcast arriving before its ack replayed the op over fields the server had changed (e.g. a repeat's advanced `nextDate`). Send Web Push with VAPID using a Workers-compatible library (e.g. `@block65/webcrypto-web-push`).

---

## 10. UI / UX

### 10.1 Layout

- **Sidebar** (collapsible; a drawer on mobile): Inbox, Today, Upcoming, Anytime, Someday, Logbook, Trash; then Areas with their projects nested; drag to reorder; "+ New List" button at the bottom (project or area).
- **Main pane:** list title (editable for projects/areas), project notes, then items.
- **Mobile:** bottom-right floating **+** button. Swipe right on a row to set When; swipe left to delete.

### 10.2 To-do row

- Collapsed: checkbox, title, then right-aligned indicators — tags, checklist progress (2/5), notes icon, deadline flag (red when overdue), ★ when in Today (in non-Today lists), ↻ when repeating.
- Click/Enter → **expands inline** (not a modal) into a card: title, notes (markdown, auto-growing textarea), checklist, and a footer with buttons: When (calendar icon), Tags, Checklist, Deadline. Click outside or press Esc → collapse.
- Completing: the checkbox animates; the item stays in place (struck through) for ~1.5s, then leaves Today/Anytime. In Projects it stays visible until the day ends.

### 10.3 "When" popover

Options: Today ★, This Evening ☾, a mini calendar, Someday, plus a text field parsed by chrono ("next mon", "in 2 weeks", "dec 3"). Footer: "Add Reminder" (time picker), "Repeat…" (opens the repeat editor). The same popover is reused for Deadline (calendar + text only).

Implementation notes (milestone 8):
- The **+** button adds a to-do inline to the current list and opens it (Inbox, Today, Upcoming → tomorrow, Anytime, Someday, a project, area or tag; tags selected in the tag bar are applied). Quick Entry (§10.4) is separate.
- A new to-do closed while still blank (no title, notes or checklist) is discarded, as in Things.
- Return in the title closes the card; Escape or ⌘↵ anywhere in it does too. Title and notes save 400ms after typing stops and when the card closes.
- Checklist: Return adds an item below, Backspace on an empty item removes it.
- Completing from a row or card waits 1.5s before saving (unchecking in that window cancels it); reopening from the Logbook is immediate. Pending completions are saved if the page is hidden.
- The When popover's "Add Reminder" and "Repeat…" footer arrive with milestone 12 (reminders and the repeat editor).
- Trash rows have Restore; "Empty Trash" asks for inline confirmation and purges the top-level entries.

### 10.4 Quick Entry

`Ctrl/⌘ + Space`-style in-app shortcut (use `Alt+Space` in the browser) or **+** → a centered modal: title, notes, When, Tags, list picker. Inline tokens in the title are parsed and stripped:
- `#tag`
- `@today` / `@tomorrow` / `@someday` / `@<date phrase>`
- `!<date>` → deadline
- `/Project Name` → move to project (fuzzy match)

Saving with no list goes to the Inbox, or to the current list if one is open. Also handle the PWA `share_target` → open Quick Entry prefilled with the shared title/url.

### 10.5 Quick Find

Typing any printable key while no input is focused opens a command palette that searches lists, projects, areas, tags and to-dos (title + notes). Search runs client-side with a simple fuzzy scorer over Dexie data. Enter opens the result.

### 10.6 Keyboard shortcuts

⌘ = Ctrl on Windows/Linux. Avoid browser-reserved combos (⌘N, ⌘T, ⌘W): use the alternatives below.

| Action                                         | Key                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| New to-do (below selection)                    | `Space` or `Alt+N`                                                  |
| New heading (in project)                       | `Alt+Shift+N`                                                       |
| Quick Entry                                    | `Alt+Space`                                                         |
| Open / collapse selected                       | `Enter` / `Esc`                                                     |
| Move selection                                 | `↑ ↓`; `Shift+↑↓` extends selection                                 |
| Reorder selected                               | `⌘↑ / ⌘↓`                                                           |
| Complete / Cancel                              | `⌘K` / `⌘Alt+K`                                                     |
| When popover                                   | `⌘S` (preventDefault)                                               |
| Deadline                                       | `⌘Shift+D`                                                          |
| Start Today / This Evening / Anytime / Someday | `Alt+T` / `Alt+E` / `Alt+R` / `Alt+O`                               |
| Move to list                                   | `⌘Shift+M`                                                          |
| Tags                                           | `⌘Shift+T`; tag shortcut char toggles while in the tag picker       |
| Delete                                         | `Backspace` / `Delete`                                              |
| Go to Inbox…Logbook                            | `⌘1`…`⌘6` (plus `g i`, `g t`, `g u`, `g a`, `g s`, `g l` sequences) |
| Undo / Redo                                    | `⌘Z` / `⌘Shift+Z`                                                   |
| Shortcut help                                  | `?`                                                                 |

**Undo:** keep an in-memory stack of inverse ops (last 50), applied through the normal op pipeline.

Implementation notes (milestone 11):
- Shortcuts don't fire while typing in a field (⌘Z there is the field's own undo), except Quick Entry's ⌥Space. Space/Enter on a focused button, link or checkbox keep their native behaviour. Browsers reserve some combos in a normal tab (e.g. Chrome's ⌘1…⌘8 and ⌘⇧T); they work in the installed app, and the `g` sequences cover navigation everywhere.
- Quick Find vs. `g` sequences: after `g` the app waits 0.8s; `i t u a s l` navigate, anything else opens Quick Find with both characters.
- Selection: a plain click selects and opens a to-do; ⌘/Ctrl-click toggles, Shift-click selects a range in page order; ↑/↓ move and Shift+↑/↓ extend it. With 2+ selected (or when a shortcut opens a panel) a bar offers When, Move, Tags, Deadline, Complete and Delete for all of them. The open card has its own ⌘K, ⌘⌥K, ⌘S, ⌘⇧D and ⌘⇧T.
- Undo: every change records the previous values of whatever it changed (by comparing rows before and after), so cascades and normalization undo correctly; undoing a create moves it to Trash. Redo is the undo of the undo. Purges aren't undoable, and entries whose rows were purged since are skipped.
- Quick Entry tokens: `#tag` is one word (new tags are created); `@…`, `!…` and `/…` phrases run to the next token, so tokens go after the title. Tokens that don't parse stay in the title; markers only count at the start or after a space (`a@b.com`, `and/or` are left alone).
- Tag shortcut characters are set from the tag page's menu (along with renaming, nesting under another tag, and deleting with Undo). In a tag picker, pressing a tag's key toggles it while the search field is empty; Shift types the letter instead. A key used by another tag moves to the new one.

### 10.7 Multi-select & drag

- Click, Shift-click and ⌘-click select multiple rows; bulk actions apply to all selected rows.
- Drag rows to reorder; drag onto a sidebar item to move them (onto Today = schedule today; onto Someday; onto a project/area; onto Trash = delete).
- Dropping into Today places the items at the top of the main section.

Implementation notes (milestone 10):
- Reorderable lists: Inbox, Today and This Evening (by `todaySortKey`), a project's loose to-dos and each heading, an area's projects and to-dos, and the sidebar's areas and projects. Dragging between lists on the same page moves the item (heading ↔ loose, Today ↔ This Evening, which schedules for today when needed). Rows in Anytime, Someday, Upcoming and tag pages can be dragged onto the sidebar but not reordered there.
- Sidebar targets: Inbox, Today (top of the main section), Anytime, Someday, Logbook (completes a to-do), Trash, any project or area (to-dos go to the end; projects can be dropped onto an area). Upcoming is not a target. Projects can't be dropped onto the Logbook, which would skip the remaining-to-dos prompt.
- Only the moved item gets a new key, unless the list's keys are missing, duplicated or not valid fractional keys; then the list is renumbered in one batch (`src/editing/reorder.ts`).
- Reordering is off while a tag filter is active (items can still be dragged to the sidebar), since renumbering a filtered subset could scramble the hidden items.
- Mouse drags start after 6px of movement, touch drags after a 250ms press. Keyboard reordering is ⌘↑/⌘↓ (milestone 11).

### 10.8 Visual direction (original, not a copy)

- Light and dark themes following `prefers-color-scheme`, with a manual toggle.
- Neutral background, generous whitespace, 15px base text, a system font stack.
- One accent color for selection and focus; yellow star for Today; indigo moon for Evening; red for overdue deadlines; green for completed progress.
- Rounded square checkboxes; round progress rings for projects.
- Subtle 150–200ms transitions; respect `prefers-reduced-motion`.
- Max content width ~720px, centered.
- Accessible: full keyboard operation, visible focus rings, ARIA roles on lists, rows and popovers, and contrast of at least 4.5:1.

### 10.9 Settings

Time zone (auto-detected), week start day, theme, "Group to-dos in Today by project", Logbook move timing ("immediately" / "daily"), notification permission, export/import, change password, sign out of all devices.

_Implementation notes (milestone 14):_
- `/settings` (sidebar gear, ⌘,), loaded on demand. Changes apply at once and are saved with `PATCH /me`, which also hands the new time zone and week start to the UserStore (alarms, repeats); the client re-sends `hello` with the new zone. Offline, a change is put back with a message.
- Theme: `data-theme` on `<html>` overrides `prefers-color-scheme`; mirrored to `localStorage` (`mythings:theme`) and applied by an inline script in `index.html` before first paint. Colors that depend on the theme (accent, overdue) are CSS variables, with `--on-accent` / `--on-overdue` for text on them, picked for 4.5:1 contrast in both themes.
- Export (`GET /api/export`) is every row, Trash included, as `{format: "mythings-export", version: 1, exportedAt, data: {tag, area, project, heading, todo, checklist}}`. Import (`POST /api/import`) adds copies with fresh ids (`shared/transfer.ts`): references are remapped, top-level tags are matched by title, and trashed rows (and rows that need them) are left out. It's applied in batches of 200 ops so each broadcast stays small.
- Swipes (touch only): right opens When for the row, left moves it to the Trash with an Undo toast. Decided after 10px; mostly vertical moves scroll, long presses still drag.
- Animations: cards, popovers, dialogs, toasts and page changes fade or slide in over 150–180ms; `prefers-reduced-motion` turns all motion off.
- Accessibility: checked with axe-core on every list, the settings page, dialogs, popovers, the mobile drawer and the login page in both themes (no violations). Selected rows use `aria-current` (buttons can't be `aria-selected`).
- Vendor libraries are split into their own chunks (`vite.config.ts`), so no chunk is over 250 kB.

---

## 11. Offline & PWA

- `manifest.webmanifest`: name, icons (192/512/maskable), `display: standalone`, `share_target`.
- Service worker (Workbox via `vite-plugin-pwa`): precache the app shell; network-only for `/api/*`.
- Show a small "Offline — changes will sync" pill when disconnected, and an outbox count while syncing.
- On first login on a new device, pull a full snapshot before showing lists (with a loading skeleton).

_Implementation notes (milestone 13):_
- `vite-plugin-pwa` with `injectManifest`: the service worker is `src/sw.ts` (precache + SPA navigation fallback, `/api/*` never cached, Web Push handlers). Updates use `registerType: "prompt"`: a toast offers **Reload** when a new version is waiting.
- Icons come from `public/favicon.svg` via `@vite-pwa/assets-generator` (`pwa-assets.config.ts`).
- Share target is `GET /share?title&text&url`; it opens Quick Entry over the Inbox, prefilled (a URL in `text` moves to the notes).
- Offline start: the last `/me` profile is kept in `localStorage` (`mythings:user`, never the session). If `/me` can't be reached the app starts with it; a 401 clears it. A device that has never signed in shows a "You're offline" screen and retries when back online.
- `SyncStatus.hasSnapshot` is true once a pull (or streamed `changes`) reaches the server's latest rev, and is remembered via `meta.lastRev`. Lists stay on the skeleton until then.

---

## 12. Testing

**Unit (`tests/shared`)** — the logic most likely to be wrong:
- `views.ts`: membership for every list across edge cases — deadline today but `startDate` in the future (→ Today), someday project children, evening rollover, completed projects, deleted parents.
- `repeat.ts`: daily/weekly multi-day/monthly-by-day (31st → short months clamp to last day)/monthly nth weekday/last weekday/yearly Feb 29; `afterCompletion`; `endsOn`; DST transitions in `America/New_York` and `Australia/Sydney`.
- Title token parser (Quick Entry).
- Fractional index moves.

**Worker (`tests/worker`, vitest-pool-workers):**
- Auth flow, session expiry, rate limiting.
- UserStore: idempotent ops, LWW merge, cascade delete/restore, invariant enforcement, `rev` ordering, pull pagination.
- Two WebSocket clients: an op from A is broadcast to B and not echoed to A.
- Alarm: materializes a fixed repeat at midnight in the user's tz; reminder fires a push (mock fetch).

**E2E (Playwright):**
- Sign up → add to Inbox via Quick Entry with `#tag @tomorrow` → appears in Upcoming under Tomorrow.
- Create area → project → heading → to-dos; drag to reorder; reload; order persists.
- Two browser contexts: a change in one appears in the other in under 2s.
- Go offline, make 5 edits, go online → all synced, no duplicates.
- Keyboard-only run through the core flow.

_Implementation notes (pre-deploy):_
- `pnpm e2e` runs Playwright (`e2e/`) in the installed Google Chrome against a production build served by `scripts/e2e-server.sh`, which starts from empty local state in `.wrangler/e2e` (dev data is never touched). Each test signs up its own account.
- Specs: Quick Entry tokens → Upcoming; area → project → heading → to-dos with drag reordering across a reload; realtime between two devices (<2s); 50 offline edits (creates, a rename, a completion) with no loss or duplicates; keyboard-only flow; theme and export/import; tag editing and shortcuts; mobile drawer and swipes; Background Sync after the app is closed.
- Background Sync (§7.2): when changes are stuck offline the page registers `mythings-outbox`; if no app window is open when the connection returns, the service worker pushes the outbox itself (same code as the engine, `src/sync/outbox.ts`), under the same Web Lock, and only for the user the session cookie belongs to.

---

## 13. Build order (milestones)

Build in this order; each milestone ends green on tests.

1. **Scaffold:** Vite + React + Hono Worker + `@cloudflare/vite-plugin`, wrangler config, D1 migration, Biome, Vitest pools. `pnpm dev` serves the app and `/api/health`.
2. **Auth:** signup/login/logout/me, session middleware, login page.
3. **Shared core:** zod schemas, `views.ts`, `dates.ts`, `repeat.ts`, with full unit tests.
4. **UserStore DO:** SQLite migrations, op apply, rev, invariants, HTTP push/pull. Worker tests.
5. **Client data layer:** Dexie schema, outbox, an `useOps()` mutation API, pull/push over HTTP.
6. **Realtime:** WebSocket hibernation, hello/changes/ack, reconnect with backoff.
7. **Shell UI:** sidebar, routing, all list views, read-only.
8. **Editing:** inline row expansion, create/complete/delete, notes, checklist, tags, When/Deadline popovers with chrono.
9. **Areas/Projects/Headings:** CRUD, progress rings, project completion prompt.
10. **Ordering & DnD:** fractional keys, dnd-kit within lists and onto the sidebar, `todaySortKey`.
11. **Keyboard:** shortcut registry, multi-select, undo/redo, Quick Find, Quick Entry with token parsing.
12. **Repeats & reminders:** repeat editor UI, DO alarms, Web Push + VAPID, notification permission flow.
13. **PWA/offline:** service worker, manifest, share target, offline indicator.
14. **Polish:** dark mode, animations, mobile gestures, accessibility pass, export/import, settings.
15. **Deploy:** `wrangler d1 migrations apply --remote`, `wrangler secret put …`, `wrangler deploy`, custom domain.

---

## 14. Acceptance criteria (v1 done when…)

- [ ] All lists in §6 behave per the table, verified by unit tests.
- [ ] Every action in §10.6 works from the keyboard.
- [ ] Creating, editing and completing a to-do re-renders in <16ms locally (no network wait).
- [ ] An edit on device A is visible on device B in <2s on a normal connection.
- [ ] 50 offline edits sync without loss or duplication after reconnecting.
- [ ] Repeating to-dos appear on the correct local date across a DST change.
- [ ] Reminders arrive as push notifications within 1 minute of `reminderAt`.
- [ ] Lighthouse PWA installable; accessibility score ≥ 95.
- [ ] `pnpm test` and `pnpm e2e` pass; `wrangler deploy` succeeds from a clean clone using the README steps.

---

## 15. v2 ideas

Email-to-Inbox (Cloudflare Email Routing → Worker → Inbox), attachments in R2, calendar overlay in Today/Upcoming (ICS subscription), Things 3 import, shared projects (multiple users per DO), AI "brain-dump to to-dos" via Workers AI, a Raycast/Alfred extension using a personal API token.
