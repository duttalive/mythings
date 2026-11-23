# Changelog

Versions are `MAJOR.MINOR.PATCH`: a new major (v1, v2) for big upgrades, minor (1.1.0) for features and bug fixes, patch (1.0.1) for small changes. This file is shown at [/changelog](https://mythings.dynocoder.com/changelog); `pnpm release` adds each new entry (see CLAUDE.md).

## Version 2.5.0 — 2026-11-23

Today now means today.

- Today shows only what you've planned for today. Anything planned for an earlier day that didn't get done moves to Overdue instead of piling up in Today, marked "Planned" with its day.
- A deadline no longer puts a to-do in Today by itself: plan it for today to see it there. It still shows its red flag everywhere else.
- Overdue to-dos stay in Overdue until you complete them or change the deadline; Today isn't offered for them, and Alt+T or dragging one onto Today explains why.
- Dates that have already passed can't be typed into When or Quick Entry; you'll see "That date has passed".
- This Evening has been removed. To-dos you had set for the evening are simply in Today, and typing "tonight" means today.
- New List now asks which Life Bucket a new project or area goes in. The one you're in comes first and is already picked, and you can start a new Life Bucket right there. With only one Life Bucket, it doesn't ask.
- Clicking the Task Notes button again closes Task Notes and takes you back to where you were.

## Version 2.4.2 — 2026-11-23

Fixes for Task Notes and titles, especially on phones.

- Long titles now wrap onto more lines on a to-do's Task Notes page and on project, area, Life Bucket and tag pages, instead of being cut off.
- The hint on an empty line in Task Notes is shorter ("Type / for blocks") and no longer overlaps the text or list below it, and list numbers stay lined up.
- An empty item at the end of a numbered or bulleted list is no longer saved as stray text (like "2.") in the item above it. Notes affected by this open correctly again.
- Tapping into Task Notes on an iPhone no longer zooms the page.
- The arrow on a toggle is easier to tap, and the / menu stays on screen near the right edge.
- The installed app on Android no longer shows a blue bar at the bottom of the screen.

## Version 2.4.1 — 2026-11-23

Task Notes, a full-width layout, and a tidier sidebar.

- Scratch Pad is now called Task Notes. Everything works the same; open it from the notes icon at the top of the page, Quick Find, or g then n. Old Scratch Pad links still work.
- Full width: the new button at the top of every list (and Settings → Appearance → Full width) lets lists and Task Notes use the whole window instead of a centered column. It's off to start with and is saved with your account.
- The Tags heading in the sidebar now has an arrow, like a Life Bucket, to hide or show all your tags at once. It's saved with your account, and visiting or adding a tag shows them again.
- The home page now covers Life Buckets, Task Notes and end-to-end encryption.
- The Privacy Policy and Terms mention Task Notes and that your settings include layout choices.

## Version 2.4.0 — 2026-11-23

A Scratch Pad for every to-do, and easier ways to organize.

- Scratch Pad: a to-do's notes are now a place to write as much as you need. Type / for headings, bulleted and numbered lists, checkboxes, toggles, callouts, quotes, code, tables and dividers, or use Markdown shortcuts like # and - as you type. Your existing notes open just as they were.
- Open any to-do in the Scratch Pad (the notes icon at the bottom of an open to-do) to write on a full page.
- The new Scratch Pad tab, from the icon at the top of every page, Quick Find or g then p, lists every to-do with notes and searches all of them. Quick Find also shows where your search words appear in notes.
- Move a to-do from the open to-do: click the list it's in (or the Move icon) and pick another. The list picker now groups areas and projects by Life Bucket and includes project headings.
- A Life Bucket's page has New Area and New Project buttons, so you can add one right where it belongs.
- If you close or reload the page right after typing, what you typed is still saved.

## Version 2.3.0 — 2026-11-20

Choose how long to-do titles look.

- Checklist items now wrap onto more lines as you type, like to-do titles, so you can read every step in full.
- New setting in Settings → Appearance: **Long to-do titles**. Keep **Wrap** (the default) to see whole titles in your lists, or pick **One line** to keep each title on a single line ending in "…". An open to-do always shows its whole title and checklist. The choice is saved with your account, so it's the same on all your devices.

## Version 2.2.0 — 2026-11-20

A clearer way to organize your lists: Life Buckets.

- Life Buckets: group the big parts of your life, like Work, Family or Personal. Each Life Bucket holds its areas and projects side by side. Create one from New List; its page shows its areas and projects.
- Areas are now for to-dos that keep going, like Health or Home upkeep. They hold to-dos only and have no deadline.
- Projects are for work with an outcome, from start to finish, and can have a deadline. Every area and project sits in a Life Bucket.
- Your lists were rearranged for you, and nothing was lost: an area that held projects is now a Life Bucket with the same name, and if it had its own to-dos, they're in an area of that name inside it. Other areas and projects are in a "Personal" Life Bucket. Rename, move or delete any of them.
- In the sidebar, each Life Bucket shows its areas, then its projects. Drag to reorder them or move them between Life Buckets, and use the arrow to hide what's inside.
- Long to-do titles now wrap onto more lines instead of being cut off, in lists and when a to-do is open.
- The Privacy Policy now mentions Life Buckets among what you store.

## Version 2.1.0 — 2026-11-19

A new Overdue list, and tags you can arrange right in the sidebar.

- Overdue: to-dos and projects whose deadline has passed now leave Today and wait in a new **Overdue** list in the sidebar, after Someday, with a red count. It's grouped by the day each was due, most overdue first, and says how late each group is. Want to work on one today anyway? Set its When to Today and it shows in both.
- Today now shows what's due today; its red count is for those, and for overdue items you've scheduled for today.
- Open Overdue with **g o**, or type "Overdue" in Quick Find.
- Tags: drag a tag in the sidebar onto another to nest it inside, or onto its top or bottom edge to change the order. On a phone, press and hold to drag.
- Delete a tag from the sidebar: right-click it and choose Delete Tag…, or drag it onto Trash. Right-click a nested tag to move it out of its parent.
- Deleting a tag now tells you how many tags nested inside it go too.

## Version 2.0.0 — 2026-11-19

Your to-dos can now be end-to-end encrypted, so only you can read them.

- End-to-end encryption: turn it on in Settings → Security. Your to-dos, notes, checklists and the names of your projects, areas, headings and tags are encrypted on your own devices before they're saved or synced, so nobody else can read them, including us. Everything already in your account is encrypted when you turn it on, and you can turn it off again.
- Recovery key: when you turn encryption on, you save a recovery key. If you ever reset your password, it unlocks your to-dos again. Make a new one any time in Settings → Security.
- Your other devices ask for your password once to read your encrypted to-dos. Signing in on a new device unlocks them straight away.
- Passcode: once encryption is on, lock mythings on any device with its own passcode. It locks itself when you're away (right away, or after 1, 5 or 15 minutes) and whenever the app is reopened, and you can lock it yourself with Lock now. Forgot it? Use your password instead.
- Your password no longer leaves your device when you sign in. You may notice signing in takes a moment longer.
- With encryption on, reminders still show what's due on devices that can read it, export gives you a readable file, and import, search, repeats and offline use work as before.
- A password reset link now tells you straight away if it has expired.
- New user guide covering every feature and flow, kept up to date with each release.
- The Privacy Policy and Terms describe encryption and what it means for your data.

## Version 1.9.0 — 2026-11-19

- Deadlines: see every open to-do and project with a deadline in one list, overdue first, then by day. Type "Deadlines" in Quick Find to open it, and use its search box to narrow it by title, notes, project, area or tag.
- Today's tag bar now only offers tags that something in Today has, so picking one never leaves an empty list.
- With "Group to-dos in Today by project" on, moving a to-do (by dragging or with ⌘↑ / ⌘↓) now keeps it within its project's group, instead of seeming to do nothing while quietly changing the order.
- Today now moves on to the new day as soon as you come back to the app, even if your computer was asleep at midnight.

## Version 1.8.0 — 2026-10-27

- Nested tags now show in the sidebar under their parent tag. Hide or show them with the arrow next to the parent: a hidden tag shows how many tags it holds, stays that way on all your devices, and opens again when you go to one of its tags.
- A tag's page now shows everything with that tag: open items (including those tagged with any tag nested inside it), its repeating to-dos and projects, and "Show N logged items" for what's already done.

## Version 1.7.0 — 2026-10-27

- Completed to-dos stay within reach: at the end of a project or area, "Show N logged items" lists what's been done there, newest first with the day it was done. Untick one to bring it back.
- On phones, swiping a to-do no longer also starts dragging it, so the delete confirmation responds to your first tap.

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
