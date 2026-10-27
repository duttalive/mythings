# Changelog

Versions are `MAJOR.MINOR.PATCH`: a new major (v1, v2) for big upgrades, minor (1.1.0) for features and bug fixes, patch (1.0.1) for small changes. This file is shown at [/changelog](https://mythings.dynocoder.com/changelog); `pnpm release` adds each new entry (see CLAUDE.md).

## Version 1.6.0 — 2026-10-27

Safer deleting, and more control over projects and tags.

- Deleting anything now asks first, and says what goes with it (for example a project's to-dos). Cancel is the default, so a stray tap or Enter keeps everything. Things you delete still go to Trash, and Undo still works.
- Emptying Trash asks you to tick "I understand this can't be undone" first.
- Reorder headings in a project by dragging them by their title, or with Move Up / Move Down in a heading's menu. Their to-dos move with them.
- Add tags straight from the sidebar with the + next to Tags. Press Enter to add one and keep typing the next.

## Version 1.5.1 — 2026-10-26

- In dark mode, it's now easy to see which option is selected in Settings (theme, text size, when completed to-dos move to the Logbook) and in a repeat's "On a schedule / After completion" choice.

## Version 1.5.0 — 2026-10-26

- Hide or show an area's projects in the sidebar with the arrow next to the area. A hidden area shows how many projects it holds, stays that way on all your devices, and opens again when you go to one of its projects.

## Version 1.4.0 — 2026-10-26

Easier sign-up, your name, and clear policies.

- Sign up with your name and email: we send you a link, and you choose your password on the page it opens. No more codes to type.
- Add or change your name in Settings → Account.
- New Privacy Policy and Terms of Service pages, linked from sign-up, the home page and Settings → About. They work offline too.
- Clearer messages when you need to wait before trying again.
- You'll be asked to sign in again after a long time, even on a device you use every day.

## Version 1.3.0 — 2026-10-25

Open to everyone, with a proper front door.

- Anyone can create a free account again.
- A new home page at mythings.dynocoder.com shows what mythings does, with a small Today list you can try.
- Sign-up and sign-in have their own addresses (/signup and /login), and the logo takes you back home.

## Version 1.2.1 — 2026-10-25

- Tighter limits on password guessing and reset emails

## Version 1.2.0 — 2026-10-25

Security and privacy improvements.

- Stronger protection for accounts, sign-up and password resets.
- Signing out also stops this device's reminders for your account.
- New accounts are by invitation for now.

## Version 1.1.1 — 2026-10-25

- Show or hide your password while typing it, with the eye button in the password field (sign in, sign up, reset and change password).

## Version 1.1.0 — 2026-10-25

Works properly on phones, and a few things you asked for.

- Made for phones: bigger tap targets, pickers that open as bottom sheets, a search button, no zooming when you tap a field, and room for notches and home bars in the installed app.
- New accounts confirm their email first: sign-up sends a 6-digit code, and the account is created once it's entered.
- Text size setting (Settings → Appearance), separately for each device.
- On a computer, drag the sidebar's edge to make it wider or narrower (double-click to reset).
- Signing out now asks first, so a stray tap won't sign you out.

## Version 1.0.1 — 2026-10-25

A new look and clearer version numbers.

- The app now uses the Lexend typeface, designed for easy reading.
- Version numbers now follow MAJOR.MINOR.PATCH: majors (v1, v2) for big upgrades, minors (1.1.0) for features and fixes, patches (1.0.1) for small changes.

## Version 1.0.0 — 2026-10-25

The first public release. mythings is free for anyone.

- Inbox, Today (with This Evening), Upcoming, Anytime, Someday, Logbook and Trash.
- Areas, projects with progress rings, headings, checklists, notes and nested tags.
- Schedule with natural language ("next fri", "in 2 weeks"), deadlines, reminders and repeating to-dos.
- Quick Entry (⌥Space) with inline #tags, @dates, !deadlines and /lists, and Quick Find by just typing.
- Drag and drop, multi-select, undo and redo, and a full set of keyboard shortcuts (press ?).
- Syncs instantly across all your devices and works fully offline; changes made offline sync when you're back.
- Install it as an app on your phone or computer; updates arrive automatically.
- Reminders as notifications, light and dark themes, swipe gestures on phones, export and import.
- Accounts with email and password, including password reset by email.
