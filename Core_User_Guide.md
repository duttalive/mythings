# mythings Core User Guide

<!-- guide-version: 2.0.0 -->
_Up to date with mythings **2.0.0**. This guide is updated with every release; see [CHANGELOG.md](CHANGELOG.md) for what changed in each one._

mythings is a free, open-source to-do app in the spirit of Things 3. It keeps a full copy of your to-dos on every device you use, so everything works instantly and offline, and changes sync to your other devices within a second or two when you're online. The hosted app lives at **https://mythings.dynocoder.com**.

This guide walks through every feature and flow, end to end. If you only read one section, read [Core ideas](#3-core-ideas): everything else builds on it.

## Contents

1. [Getting started](#1-getting-started)
2. [The screen at a glance](#2-the-screen-at-a-glance)
3. [Core ideas](#3-core-ideas)
4. [The lists](#4-the-lists)
5. [Working with to-dos](#5-working-with-to-dos)
6. [Scheduling: When, deadlines, reminders and repeats](#6-scheduling-when-deadlines-reminders-and-repeats)
7. [Projects and headings](#7-projects-and-headings)
8. [Areas](#8-areas)
9. [Tags](#9-tags)
10. [Selecting, moving and reordering](#10-selecting-moving-and-reordering)
11. [Deleting, Trash and Undo](#11-deleting-trash-and-undo)
12. [Finding things: Quick Find](#12-finding-things-quick-find)
13. [Keyboard shortcuts](#13-keyboard-shortcuts)
14. [Phones and tablets](#14-phones-and-tablets)
15. [Sync, offline and devices](#15-sync-offline-and-devices)
16. [Settings](#16-settings)
17. [Encryption and passcode](#17-encryption-and-passcode)
18. [Your data](#18-your-data)
19. [Public pages](#19-public-pages)
20. [Troubleshooting and FAQ](#20-troubleshooting-and-faq)

---

## 1. Getting started

### 1.1 The home page

Visiting the app signed out shows the public home page: what mythings is, a working preview of Today, and buttons to **Sign up** or **Sign in**. Its footer links to What's new, the Privacy Policy, the Terms of Service and the source code.

### 1.2 Creating an account

1. Choose **Sign up** (or go to `/signup`).
2. Enter your **name** and **email**, then submit. By signing up you agree to the Terms of Service and Privacy Policy, which are linked right there.
3. A **Check your email** screen appears. We email you a sign-up link; no account exists yet.
4. Open the link. It shows your email address and asks for your name again (prefilled) and a **password**. You choose the password here, on the page the link opens, so nobody can sign up with your address and set a password for you.
5. Submit, and you're signed in and taken to Today.

Good to know:

- If the email already has an account, you get an email saying so instead, and the screen looks exactly the same. mythings never reveals which addresses have accounts.
- Links expire after a while and work only once. If one has expired or was already used, the page says so; start again from Sign up.
- If you ask for emails too often, you'll be asked to wait a little before trying again.

### 1.3 Signing in and out

- **Sign in** with your email and password at `/login`.
- After several unsuccessful attempts you'll be asked to wait before trying again, or to reset your password.
- After a long time you'll be asked to sign in again, even on a device you use every day.
- **Sign out** is at the bottom of the sidebar, next to your email. It always asks you to confirm, and it stops reminders being sent to this browser.

### 1.4 Forgot your password

1. On the sign-in page choose **Forgot password?**, enter your email and choose **Send reset link**.
2. The screen confirms that if an account exists for that address, a link is on its way (it says the same either way).
3. Open the link, choose a new password, and you're signed in.

Reset links also expire and work only once; ask for a new one if needed.

If you've turned on [end-to-end encryption](#17-encryption-and-passcode), a new password doesn't unlock your to-dos by itself: a device that's already unlocked keeps working (and updates your password for the others), and on any other device you'll be asked for your **recovery key** once.

### 1.5 Installing the app

mythings is an installable web app (a PWA):

- **Desktop Chrome or Edge:** use the install icon in the address bar, or the browser menu's _Install mythings_.
- **iPhone or iPad (Safari):** Share → _Add to Home Screen_.
- **Android (Chrome):** menu → _Install app_ or _Add to Home screen_.

Installed, it opens in its own window, works offline, can receive reminders as notifications, and appears in the system share sheet (see [Quick Entry](#53-quick-entry)).

### 1.6 Updates

The app updates itself. When a new version has downloaded it's applied straight away (or as soon as you stop typing), and a small toast says **Updated to version X**, with a **What's new** link. You never need to reload by hand.

---

## 2. The screen at a glance

**Sidebar** (left on a computer, a drawer on a phone):

- **Inbox**, with a count of its to-dos.
- **Today**, with a count, plus a red count of items in Today whose deadline is today.
- **Upcoming**, **Anytime**, **Someday**.
- **Overdue**, with a red count of open items whose deadline has passed.
- **Logbook** and **Trash**.
- Your **projects** (those not in an area), then each **area** with its projects. An arrow next to an area hides or shows its projects.
- **Tags**, nested under their parent tags, with a **+** to add one and arrows to hide nested tags.
- **+ New List** at the bottom, to create a project or an area.
- At the very bottom: the sync status, your email, **Settings** (gear) and **Sign out**.

**Main pane:** the list's title (editable for projects, areas and tags), any header details (notes, tag chips), a tag bar for filtering, then the items.

**Floating +** (bottom right): adds a to-do to the list you're looking at.

On a computer you can drag the sidebar's edge to make it wider or narrower; the width is remembered on that device. The sidebar can also be hidden with the button at the top left.

---

## 3. Core ideas

### 3.1 To-dos

A to-do has a **title**, optional **notes** (Markdown), an optional **checklist**, **tags**, a **When** (when you plan to work on it), an optional **deadline** (when it's due), an optional **reminder**, and optionally a **repeat**. It lives in the Inbox, an area or a project, and inside a project it can sit under a heading.

A to-do is **open**, **completed** or **canceled**. Completed and canceled to-dos move to the Logbook.

### 3.2 Projects

A project is a goal with an end: "Move apartments", "Launch website". It holds to-dos (optionally grouped under **headings**), has notes, its own When and deadline, and shows a **progress ring** that fills as its to-dos are completed. A project can belong to an area. When everything's done, you complete the project.

### 3.3 Areas

An area is an ongoing part of life that never "finishes": Work, Home, Health. It holds projects and loose to-dos. Tags on an area apply to everything inside it.

### 3.4 Headings

Headings split a project into sections ("Packing", "Utilities"). They can be reordered and archived.

### 3.5 Tags

Tags label to-dos, projects and areas across lists: `errands`, `phone`, `urgent`. Tags can be nested ("shop" inside "errands"); filtering by a parent tag includes everything tagged with the tags inside it. Items **inherit** tags from their project and area.

### 3.6 When versus deadline

These are different on purpose:

- **When** is when you _intend to start_: Today, This Evening, a future date, Anytime, Someday, or not decided yet (Inbox).
- **Deadline** is when it's _due_. On the day it's due, a to-do shows up in Today even if its When is later, with a red flag. Once that day has passed, it moves to **Overdue** instead (see [Overdue](#46-overdue)).

### 3.7 Where an item shows up

| When            | Shows in                                                      |
| --------------- | ------------------------------------------------------------- |
| Not decided     | Inbox                                                         |
| Today           | Today (and Anytime, with a ★)                                 |
| This Evening    | Today, in the **This Evening** section                        |
| A future date   | Upcoming, until that day arrives; then Today                  |
| Anytime         | Anytime                                                       |
| Someday         | Someday                                                       |

To-dos inside a Someday project (or a project scheduled for later) stay out of Today and Anytime until the project itself is active.

---

## 4. The lists

Every list shows its items in order and most can be filtered with the **tag bar** under the title: click one or more tags and only items with **all** of them (or tags nested inside them) remain. Click a tag again to remove it. While a filter is on, rows can't be reordered (they can still be dragged to the sidebar), so hidden items keep their places.

### 4.1 Inbox

Where new to-dos land when you haven't decided anything about them yet. Process it by giving each to-do a When, a project or area, or deleting it. Reorder by dragging or with ⌘↑ / ⌘↓.

### 4.2 Today

Everything you plan to do today:

- To-dos and projects scheduled for today or earlier.
- Anything whose deadline is today, even if scheduled later.
- Once a deadline has passed, the item leaves Today and waits in [Overdue](#46-overdue). To work on it today anyway, set its When to **Today** (or This Evening): it then shows in both, with its overdue deadline in red.
- A **This Evening** section for things you've set for this evening. While you drag, it appears even when empty so you can drop items into it.

Details:

- **Order** is your own, separate from each project's order. Drag rows, or use ⌘↑ / ⌘↓. Items that arrive in Today on their own (a scheduled date comes round, a deadline arrives) appear at the top.
- **Group to-dos in Today by project** (Settings → Lists) shows loose items first, then a small heading per project with its to-dos. While grouped, moving a to-do keeps it within its project's group.
- **Tag bar:** offers only the tags that something in Today has. If a filter leaves nothing, it says "Nothing in Today has these tags."
- **A new day:** at midnight Today moves on. If your computer was asleep at midnight, Today catches up as soon as you come back to the app. Anything scheduled for "This Evening" yesterday comes back as a normal Today item.
- The sidebar badge counts open items in Today; the red badge counts those that are due (today, or overdue items you've scheduled for today).

### 4.3 Upcoming

What's scheduled for later:

- The next seven days, each with its own header ("Tomorrow", then weekday names). Empty days still show, so you can see your week.
- Then the rest of the month, then one group per month.
- **Repeating** to-dos and projects appear on their next date with a ↻ icon.

The **+** button on Upcoming adds a to-do for tomorrow.

### 4.4 Anytime

Everything you could work on now: to-dos set to Anytime, and scheduled ones whose day has come. Grouped as loose to-dos first, then projects, then each area with its to-dos and projects. Items that are also in Today show a ★. Active projects appear even if none of their to-dos are listed.

### 4.5 Someday

Things you might do one day. Someday projects appear as single entries (their to-dos stay inside them), plus Someday to-dos outside such projects, grouped by area and project.

### 4.6 Overdue

Everything whose deadline has passed and isn't done yet, so nothing late gets lost in Today. It sits in the sidebar after Someday, with a red count.

- Grouped by the day it was due, **most overdue first**. Each group says how late it is ("3 days overdue"), and each row shows its project or area.
- Projects with a passed deadline appear here too, as do to-dos with any When (Anytime, Someday, a date, or none).
- Completed items, repeating templates and to-dos inside finished or deleted projects are left out. Tick one off and it leaves Overdue the same way it leaves other lists.
- To deal with something here: complete it, give it a later **deadline** (it leaves Overdue, and comes back to Today on the new day), clear the deadline, or set its When to **Today** to keep it in Today as well while it's still overdue.
- The **tag bar** offers only the tags that something overdue has.

Open it from the sidebar, with **g o**, or by typing "Overdue" in Quick Find.

### 4.7 Logbook

Completed and canceled items, newest first, grouped by the day they were finished. A completed project's to-dos are filed under the project. Untick an item to reopen it; it goes straight back where it came from. Older entries load as you scroll.

When completed items move here depends on **Settings → Lists → Move completed to-dos to the Logbook**:

- **Immediately** (default): a completed to-do stays in place, struck through, for a moment, then leaves its list.
- **Daily:** completed items stay in their lists, struck through, until tomorrow.

### 4.8 Trash

Deleted items stay here for **30 days**, then they're deleted for good. Each row has **Restore**, which brings it back with everything that was deleted with it (a project's to-dos and headings, an area's projects). **Empty Trash** deletes everything here permanently; see [Deleting](#11-deleting-trash-and-undo).

### 4.9 Deadlines (hidden list)

Like in Things, Deadlines isn't in the sidebar: open **Quick Find**, type "Deadlines" and press Enter. It shows every open to-do and project that has a deadline, overdue or not (for only the overdue ones, use [Overdue](#46-overdue)):

- **Overdue** first (in red), then one group per deadline day ("Today", "Tomorrow", then dates).
- Completed items, and to-dos inside finished or deleted projects, are left out.
- The **Search deadlines** box narrows the list to items whose title, notes, project, area or tags contain every word you type. Escape clears it.

### 4.10 A project's page

See [Projects and headings](#7-projects-and-headings).

### 4.11 An area's page

See [Areas](#8-areas).

### 4.12 A tag's page

See [Tags](#9-tags).

---

## 5. Working with to-dos

### 5.1 Adding a to-do

- The floating **+** (or **Space** / **Alt+N** with nothing being typed) adds a to-do to the current list and opens it, with the title ready for typing. In Upcoming it's scheduled for tomorrow; in a project, area or tag it goes there; tags selected in the tag bar are added so it stays visible.
- With a to-do selected, **Space** adds the new one just below it.
- A new to-do you close while it's still completely empty is discarded.
- **Quick Entry** (Alt+Space) adds a to-do from anywhere; see below.

### 5.2 The to-do card

Click a to-do (or select it and press **Enter**) to open it in place as a card:

- **Title** at the top. Return closes the card.
- **Notes** below, in Markdown; the box grows as you type.
- **Checklist:** Return adds an item below; Backspace on an empty item removes it; tick items off as you go. The row shows progress like 2/5.
- **Footer buttons:** When (which also holds reminders and repeats), Tags, Add checklist, Deadline, and **⋯ More actions** (Mark as Canceled, or Reopen, and Delete To-Do).
- Changes save automatically a moment after you stop typing, and when the card closes.
- Close it with Return in the title, **Escape**, **⌘Return**, or by clicking outside.

The collapsed row shows, from left to right: the checkbox, the title, then tags, checklist progress, a notes icon, the deadline (red when due or overdue), ★ if it's in Today (in lists other than Today), and ↻ if it repeats. In Today and Upcoming, rows also show which project or area they belong to.

### 5.3 Quick Entry

**Alt+Space** opens a centered box to add a to-do without leaving what you're doing. Fill in the title and notes, or type shortcuts straight into the title:

| Type in the title       | Does                                       |
| ----------------------- | ------------------------------------------ |
| `#errands`              | Adds the tag (created if it doesn't exist) |
| `@today`, `@tomorrow`   | Sets When                                  |
| `@someday`              | Sets When to Someday                       |
| `@next friday`, `@dec 3`| Schedules for that date                    |
| `!friday`, `!nov 30`    | Sets the deadline                          |
| `/Move`                 | Puts it in the project best matching "Move"|

Put these after the title; anything that isn't understood stays in the title. Without a list, the to-do goes to the list you're on, or the Inbox.

**Sharing into mythings:** with the app installed, share a page or text from another app to mythings and Quick Entry opens prefilled (a link goes into the notes).

### 5.4 Completing and canceling

- Tick the checkbox (or **⌘K**). The item is struck through and, a moment later, leaves the list for the Logbook. Untick it within that moment to keep it.
- **Cancel** (⌘⌥K, or **Mark as Canceled** in the card's ⋯ menu) marks it as canceled instead; it also goes to the Logbook.
- Reopen anything from the Logbook, or from a project's or tag's logged items, by unticking it.

### 5.5 Moving a to-do

- **Move to list** (⌘⇧M, or **Move** in the bar that appears for selected to-dos) moves it to the Inbox, a project (and heading) or an area.
- **Drag** it onto a sidebar list; see [Drag and drop](#103-drag-and-drop).

### 5.6 Tags on a to-do

The Tags button (⌘⇧T) opens a picker: type to find or create a tag, click to toggle. A tag's **shortcut key** toggles it while the search box is empty (Shift types the letter instead).

---

## 6. Scheduling: When, deadlines, reminders and repeats

### 6.1 The When popover

Open it from a to-do's **When** button, **⌘S**, or by swiping right on a phone. It offers:

- A field where you can **type a date**: "tomorrow", "tmrw", "next fri", "in 2 weeks", "dec 3", "tonight", "someday". A preview shows what it understood; press Enter to set it.
- **Today** ★ and **This Evening** ☾.
- A **calendar** for any future date.
- **Someday**, and **Clear** to remove the date.
- **Add Reminder** and **Repeat…** (below).

Keyboard shortcuts set When directly: **Alt+T** Today, **Alt+E** This Evening, **Alt+R** Anytime, **Alt+O** Someday.

### 6.2 Deadlines

Open with the **Deadline** button or **⌘⇧D**. Type a date ("friday", "nov 30") or pick it on the calendar; **Clear deadline** removes it. Items due today appear in Today with a red flag; once the day has passed they move to [Overdue](#46-overdue). Every deadline is collected in the [Deadlines list](#49-deadlines-hidden-list).

### 6.3 Reminders

In the When popover choose **Add Reminder** and pick a time. At that time you get a notification on every device where you've allowed notifications, even if the app is closed. Clicking it opens the to-do's project, or Today.

- The first time you save a reminder, the browser asks permission to show notifications. You can also turn them on in **Settings → Notifications**.
- If you move the to-do to another day, the reminder moves with it (same time). Removing the date removes the reminder.
- A reminder that was missed by a long time (say the device was off) isn't sent late.

### 6.4 Repeating to-dos and projects

Choose **Repeat…** in the When popover. The repeat editor offers two kinds:

- **On a schedule:** every N days, weeks (on chosen weekdays), months (on a day of the month, the last day, or "the 2nd Tuesday" / "the last Friday"), or years (on a date).
- **After completion:** the next one is due N days, weeks, months or years after you finish the current one.

Options: a **deadline** a number of days after each one starts, a **reminder time**, and an **end date**.

How it behaves:

- The repeating item itself is a template: it doesn't appear in normal lists, only in **Upcoming** on its next date (with ↻) and in its project's **Repeating** section.
- On the day, a fresh copy appears (in Today) with the same title, notes, checklist, tags and place. A repeating project copies its headings and open to-dos too.
- Only one copy is created at a time. If you were away for a while, you get the latest one, not a backlog.
- "Every N weeks" counts weeks starting on your chosen first day of the week (Settings → Date & time).
- Edit or stop a repeat from the template (in Upcoming or the project), via **Repeat…**.

---

## 7. Projects and headings

### 7.1 Creating a project

**+ New List → New Project** in the sidebar. It opens with its title ready to type. If you're on an area's page, the new project goes into that area. An area's menu can also add a project.

### 7.2 A project's page

- **Title** (click to edit) with the **progress ring** next to it.
- **Notes** and details (When, deadline, tags) under the title.
- **Loose to-dos** first, then each **heading** with its to-dos.
- A **Repeating** section for repeat templates in the project.
- **Archived headings** at the bottom, collapsed.
- **Show N logged items** at the very end: the project's completed and canceled to-dos, newest first with the day they were done. Untick one to bring it back. It starts hidden each time you open the project.

The **+** button and Space add to-dos to the project.

### 7.3 Completing, canceling and reopening a project

- Click the **progress ring** to complete the project. If open to-dos remain, you're asked whether to mark them **Completed** or **Canceled**.
- **Cancel Project** (the project's ⋯ menu) cancels it and its remaining to-dos.
- **Reopen Project** (same menu), or unticking it in the Logbook, reopens it and leaves its to-dos as they were.

### 7.4 Moving a project

With **Move to Area…** in the project's ⋯ menu, move it into another area or out of areas. You can also drag it in the sidebar onto an area, or reorder it within its group.

### 7.5 Headings

- **New heading:** **Add Heading** in the project's ⋯ menu, or **Alt+Shift+N**.
- **Rename** by clicking its title.
- **Reorder** by dragging a heading by its title, or with **Move Up / Move Down** in its menu. Its to-dos move with it.
- **Move to-dos** between headings (or out to the loose list) by dragging.
- **Archive** a heading once nothing under it is open; it moves to the bottom of the project, collapsed, with its finished to-dos. Unarchive it from its menu.
- **Delete** a heading (it asks first); its to-dos go to the Trash with it.

---

## 8. Areas

- **Create:** **+ New List → New Area**.
- **The area's page:** its projects (with progress rings) first, then its loose to-dos, then **Show N logged items** for its completed projects and finished loose to-dos. To-dos inside its projects stay with those projects.
- **Rename** by clicking the title; tags on an area apply to everything inside.
- **In the sidebar:** the arrow next to an area hides or shows its projects. A hidden area shows how many projects it holds. This is saved to your account, so it's the same on all devices. Opening one of its projects (from search, a link or a new project) opens the area again.
- **Reorder** areas, and projects within and between areas, by dragging in the sidebar.
- **Delete** from the area's menu (it asks first): its projects and to-dos go to the Trash with it.

---

## 9. Tags

### 9.1 Creating tags

- The **+** next to **Tags** in the sidebar opens a field: type a name and press Enter; it stays open for the next one. Escape closes it. Names that already exist aren't added twice.
- Type a new tag in any tag picker, or `#name` in Quick Entry.

### 9.2 Nesting

In the sidebar, **drag a tag onto the middle of another tag** to nest it inside (a highlight shows where it will go). To take it out again, drag it next to a top-level tag, or right-click it and choose **Move out of “…”**. You can also use **Inside** in the **⋯** menu on a tag's page. A tag can't be nested inside itself or one of its own nested tags. Nested tags show indented under their parent, at any depth. A parent tag with nested tags gets an arrow to hide or show them; a hidden parent shows how many tags it holds. This is saved to your account. Visiting a nested tag opens everything above it again.

### 9.3 Reordering tags

Drag a tag in the sidebar onto the **top or bottom edge** of another tag: a line shows where it lands, and it moves just above or below that tag (alongside it, under the same parent). The order is saved to your account. On a touch screen, press and hold a tag to start dragging.

### 9.4 A tag's page

- Chips to the parent tag (↑) and the nested tags.
- Everything open with this tag, **including tags nested inside it**, grouped like Anytime (loose to-dos, projects, then areas).
- **Repeating** to-dos and projects with the tag, soonest next date first.
- **Show N logged items** for what's already done.
- The **⋯** menu: **Shortcut key** (a single letter that toggles this tag in any tag picker; a key used by another tag moves to this one), **Inside** (parent tag), and **Delete Tag**.

### 9.5 Deleting a tag

Delete a tag in any of three ways: right-click it in the sidebar and choose **Delete Tag…**, drag it onto **Trash** in the sidebar, or use **Delete Tag** in the **⋯** menu on its page. It asks first, saying how many items it will come off and how many tags nested inside it go too. The items themselves stay. Tags don't go to the Trash, so use **Undo** straight away if you change your mind. Deleting a tag also deletes the tags nested inside it.

---

## 10. Selecting, moving and reordering

### 10.1 Selecting

- **Click** a to-do to select and open it.
- **⌘-click** (Ctrl-click) to add or remove one from the selection; **Shift-click** to select a range.
- **↑ / ↓** move the selection; **Shift+↑ / ↓** extend it. **Escape** closes the card, then clears the selection.

### 10.2 Acting on several at once

With two or more selected, a bar appears with **When**, **Move**, **Tags**, **Deadline**, **Complete** and **Delete** for all of them. Keyboard shortcuts (⌘S, ⌘⇧M, ⌘⇧T, ⌘⇧D, ⌘K, Delete) work on the whole selection.

### 10.3 Drag and drop

- **Reorder** by dragging rows in the Inbox, Today and This Evening, a project's loose to-dos and each heading, an area's projects and to-dos, and the sidebar's areas and projects.
- **Between sections on one page:** heading ↔ loose to-dos in a project; Today ↔ This Evening (scheduling for today when needed).
- **Onto the sidebar:**
  - **Inbox**, **Anytime**, **Someday**: sets that When.
  - **Today**: schedules for today and puts it at the top of Today.
  - **Logbook**: completes a to-do.
  - **Trash**: deletes (it asks first).
  - A **project** or **area**: moves it there (to the end). Projects can be dropped onto an area.
  - **Tags** in the sidebar: drag a tag onto another to nest it, or onto its top or bottom edge to reorder (see [Tags](#9-tags)), or onto Trash to delete it.
  - Upcoming isn't a drop target; projects can't be dropped onto the Logbook (complete them from their ring, so you're asked about remaining to-dos).
- With the mouse, a drag starts after a small movement; on touch screens, press and hold.
- Rows in Anytime, Someday, Upcoming and tag pages can be dragged to the sidebar but not reordered there.

### 10.4 Keyboard reordering

**⌘↑ / ⌘↓** move the selected item up or down in its list (in Today grouped by project, within its group).

---

## 11. Deleting, Trash and Undo

### 11.1 Every delete asks first

Deleting anything opens a confirmation that says what goes with it (for example "It moves to Trash with its 3 to-dos and 2 headings"). **Cancel** is focused, so Enter or Escape keeps everything. This applies to deleting from a card, the keyboard (Backspace / Delete), the bulk bar, menus, swiping left on a phone, and dragging onto Trash.

### 11.2 Trash

Deleted items wait in the Trash for 30 days and can be restored with everything deleted alongside them. **Empty Trash** deletes them permanently, on all your devices: you must tick **"I understand this can't be undone"** before the button works.

### 11.3 Undo and redo

**⌘Z** undoes your last change and **⌘⇧Z** redoes it, for up to 50 steps. Some actions also show a toast with an **Undo** button (for example deleting a tag, or swiping a row away on a phone). Undo works across complex changes (moving a project with its to-dos, completing a project with its remaining to-dos). Undoing the creation of a to-do moves it to the Trash. Permanent deletions (emptying the Trash) can't be undone. While you're typing in a field, ⌘Z is the field's own undo.

---

## 12. Finding things: Quick Find

Start typing any letter while you're not in a text field (or click the search icon at the top) and **Quick Find** opens with what you typed. It searches, as you type:

- Lists (Inbox, Today, Upcoming, Anytime, Someday, **Deadlines**, Logbook, Trash).
- Projects (with their area), areas and tags.
- To-dos, by title and notes.

Use ↑ / ↓ and **Enter** to open a result, or click it. Opening a to-do takes you to the list it's in and opens it there. Lists and projects rank above to-dos when they match about as well.

The **g** shortcuts navigate without searching: **g i** Inbox, **g t** Today, **g u** Upcoming, **g a** Anytime, **g s** Someday, **g o** Overdue, **g l** Logbook. After **g**, the app waits a moment; any other letter opens Quick Find with both letters.

---

## 13. Keyboard shortcuts

Press **?** to see this list in the app. ⌘ means Ctrl on Windows and Linux. Shortcuts don't fire while you're typing in a field (except Alt+Space).

| Action                                   | Keys                                   |
| ---------------------------------------- | -------------------------------------- |
| New to-do (below the selection)          | Space or Alt+N                         |
| New heading (in a project)               | Alt+Shift+N                            |
| Quick Entry                              | Alt+Space                              |
| Quick Find                               | start typing                           |
| Open / close the selected to-do          | Enter / Esc                            |
| Move the selection                       | ↑ ↓ (Shift to extend)                  |
| Reorder the selection                    | ⌘↑ / ⌘↓                                |
| Complete / Cancel                        | ⌘K / ⌘⌥K                               |
| When…                                    | ⌘S                                     |
| Deadline…                                | ⌘⇧D                                    |
| Today / This Evening / Anytime / Someday | Alt+T / Alt+E / Alt+R / Alt+O          |
| Move to list…                            | ⌘⇧M                                    |
| Tags…                                    | ⌘⇧T                                    |
| Delete                                   | Backspace or Delete                    |
| Go to Inbox … Logbook                    | ⌘1 … ⌘6, or g i / t / u / a / s / l    |
| Go to Overdue                            | g o                                    |
| Settings                                 | ⌘,                                     |
| Undo / Redo                              | ⌘Z / ⌘⇧Z                               |
| Shortcut help                            | ?                                      |

Some browsers keep a few combinations for themselves in a normal tab (such as Chrome's ⌘1…⌘8); they work in the installed app, and the **g** shortcuts work everywhere.

---

## 14. Phones and tablets

- The sidebar is a **drawer**: open it with the button at the top left; tap outside it to close.
- The floating **+** adds a to-do.
- **Swipe right** on a row to open When. **Swipe left** to delete it (it asks first, and offers Undo).
- **Press and hold** a row to drag it; mostly vertical movements scroll as usual.
- Popovers (When, Tags, Deadline…) open as **sheets** from the bottom of the screen.
- Buttons and rows are finger-sized, and text fields are large enough that your phone doesn't zoom in.
- **Text size** (Settings → Appearance) can be set separately on each device.

---

## 15. Sync, offline and devices

- Every device keeps a full copy of your to-dos, so lists open instantly and everything works **offline**: add, edit, complete, move and delete as usual.
- Changes made offline are queued and sent when you're back online. The sidebar shows the status: **Synced**, **Syncing** with a count of changes waiting, or **Offline — changes will sync**.
- Changes appear on your other devices within a second or two while they're online.
- On a new device, the app downloads your to-dos once after you sign in, then works offline from then on.
- A device that has never signed in shows "You're offline" and retries when the connection returns.
- The Privacy Policy and Terms of Service also work offline once the app has been opened.

---

## 16. Settings

Open with the gear at the bottom of the sidebar, or **⌘,**. Changes apply at once. (While offline, changes to synced settings are put back with a message.)

**Appearance**

- **Theme:** Light, Dark or System. Applied before the page even appears, so there's no flash.
- **Text size:** Small, Default, Large, Larger. This device only. On a computer you can also drag the sidebar's edge to resize it.

**Date & time**

- **Time zone:** detected automatically; change it if you travel or it's wrong. It decides when "today" starts, when repeats appear and when reminders go off.
- **Week starts on:** affects calendars and "every N weeks" repeats.

**Lists**

- **Group to-dos in Today by project.**
- **Move completed to-dos to the Logbook:** Immediately or Daily (see [Logbook](#47-logbook)).

**Notifications**

- Shows whether this browser can show reminders and lets you turn them on.

**Data**

- **Export** and **Import** (see [Your data](#18-your-data)).

**Security**

- **End-to-end encryption:** turn it on or off, or make a new recovery key (see [Encryption and passcode](#17-encryption-and-passcode)).
- **Passcode on this device**, **Lock after** and **Lock now**, once encryption is on.

**Account**

- **Signed in as** your email, with **Sign out**.
- **Name:** change it any time.
- **Change password:** asks for the current one; other devices are signed out. With encryption on, your to-dos stay readable with the new password.
- **Sign out of all devices**, including this one.

**About**

- The app version, with **What's new** (the changelog).
- Links to the **Privacy Policy** and **Terms of Service**.

---

## 17. Encryption and passcode

### 17.1 End-to-end encryption

With end-to-end encryption on, the words in your account are encrypted on your own devices before they're saved or synced: to-do titles and notes, checklist items, and the names of projects, areas, headings and tags. Only your devices can read them; the server stores them in a form nobody else can read, including us.

So that repeats, reminders and the Trash keep working, some details stay readable to the server: dates and deadlines, repeat settings, reminder times, whether something is completed or in the Trash, and how items are arranged.

It's off until you turn it on.

**Turning it on**

1. Open **Settings → Security** and choose **Turn on encryption…**.
2. Your **recovery key** appears: eight groups of four letters and digits. **Copy** or **Download** it and keep it somewhere safe, such as a password manager.
3. Tick **I've saved my recovery key somewhere safe**, enter your password, and choose **Turn on encryption**.
4. Everything already in your account is encrypted in the background. Keep the app open and online for a moment; it finishes on its own the next time any of your devices is online, too.

Your other devices notice the change and ask for your password once (see below).

**Using encrypted to-dos**

Everything works as before: Quick Find, tags, repeats, reminders, drag and drop and offline use. Your devices decrypt as you go.

- **Signing in on a device:** your password unlocks your to-dos straight away.
- **A device that was already signed in** shows **Unlock your data** once: enter your password.
- **Reminders** show the to-do's title on devices that can read it. On a device locked with a passcode, or one that can't read it yet, the reminder says only that a to-do is due.
- **Export** gives you a readable file, decrypted on your device. **Import** works as usual; imported items are encrypted on your device before they're saved.
- **Signing out** removes this device's ability to read your to-dos until you sign in again.

**Your recovery key**

The recovery key is the only way to read your to-dos if you forget your password: we can't reset encryption for you.

- After a **password reset**, a device that's already unlocked keeps working. Any other device shows **Unlock your data**: choose **Use my recovery key**, type the key (capitals and dashes don't matter) and your new password. From then on, the new password works everywhere.
- **New recovery key…** in Settings → Security makes a new one; the old one stops working.
- If you've lost both your password and your recovery key, choose **I don't have it** on the unlock screen to **start over**: you get a new recovery key and can keep using mythings, but anything encrypted before can't be read again and shows a lock (🔒). You can delete those items.
- **Changing your password** in Settings keeps everything readable; you don't need the recovery key for that.

**Turning it off**

Choose **Turn off…** in Settings → Security and enter your password. Your to-dos are decrypted on your devices and stored without end-to-end encryption again, and any passcode on this device is removed.

### 17.2 Passcode on this device

Once encryption is on, you can lock mythings on a device with a passcode. While it's locked, nothing on that device can be read without the passcode.

1. In **Settings → Security**, choose **Set passcode…**.
2. Enter a passcode of at least 6 characters twice, then **Save passcode**. Longer passcodes are harder to guess.

Then:

- **Lock after** sets how soon it locks when you're away: **Right away** (as soon as you leave the app), **1 min**, **5 min** (the default) or **15 min** without a tap, click or key press. Reloading the page or reopening the app also asks for the passcode.
- **Lock now** locks it straight away.
- On the lock screen, enter the passcode and choose **Unlock**. After too many wrong tries in a row, the device forgets its key and you unlock with your password instead.
- **Forgot it?** Choose **Use your password instead** on the lock screen.
- **Change passcode…** and **Remove** are in Settings → Security.

The passcode belongs to that device only; your other devices have their own (or none). Changes you make while signed in still sync, and changes waiting to sync are sent once you unlock.

---

## 18. Your data

- **Export** (Settings → Data) downloads everything in your account, Trash included, as a JSON file. With encryption on, it's decrypted on your device first, so the file is readable: keep it somewhere safe.
- **Import** adds the contents of an export file as copies: to-dos, projects, areas, headings, checklists and tags. Top-level tags with the same name are matched rather than duplicated. Items that were in the Trash aren't imported. Importing never overwrites what you already have.
- **Deleting your account:** export your data if you want it, then email us from your account's address (see the Privacy Policy) and we'll delete the account and everything in it.
- The [Privacy Policy](https://mythings.dynocoder.com/privacy) explains what's stored, why, and who processes it.

---

## 19. Public pages

These work without signing in:

- **Home** (`/`): what mythings is, with sign-up and sign-in.
- **What's new** (`/changelog`): every release and what changed.
- **Privacy Policy** (`/privacy`) and **Terms of Service** (`/terms`).
- **Sign in** (`/login`) and **Sign up** (`/signup`).

---

## 20. Troubleshooting and FAQ

**Something I completed is still showing.** If Settings → Lists → Move completed to-dos to the Logbook is set to **Daily**, completed items stay (struck through) until tomorrow.

**A to-do with a later date is in Today.** Its deadline is today; deadlines bring items into Today on the day they're due.

**A to-do disappeared from Today.** Its deadline has passed, so it moved to **Overdue**. Set its When to Today to keep it in Today too, or give it a new deadline.

**A to-do scheduled for today isn't in Today.** Check its project: to-dos inside a Someday project, or a project scheduled for later, wait until the project is active.

**I can't reorder a list.** A tag filter is on; clear the tag bar first. Anytime, Someday, Upcoming and tag pages can't be reordered (only dragged to the sidebar).

**I don't get reminders.** Turn on notifications in Settings → Notifications and allow them in your browser or system settings. On iPhone and iPad, install the app to your Home Screen first.

**My changes didn't reach my other device.** Check the sync status in the sidebar. Offline changes are kept on the device and sent automatically when it's back online.

**The sign-up or reset link doesn't work.** It may have expired or already been used; ask for a new one. Only the newest link works.

**My to-dos ask me to "Unlock your data".** Your account uses end-to-end encryption and this device can't read it yet. Enter your password; if you've reset your password since, use your recovery key.

**I forgot my passcode.** Choose **Use your password instead** on the lock screen.

**Some items show a lock (🔒) instead of a title.** They were encrypted with a key this device doesn't have, for example from before you started over without your recovery key. They can't be read; you can delete them.

**Can you recover my encrypted to-dos?** No. Only your password or your recovery key can unlock them. That's what keeps them private.

**Where's the Deadlines list?** It's hidden, as in Things: type "Deadlines" in Quick Find.

**Something else?** Report bugs or ideas on the [GitHub repository](https://github.com/duttalive/mythings/issues).
