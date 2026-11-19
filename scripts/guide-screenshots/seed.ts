// Made-up to-dos for the user guide's screenshots, as an export file that the
// script imports into a throwaway local account. Dates are relative to today
// so every list has something in it whenever the screenshots are taken.

import { generateNKeysBetween } from "fractional-indexing";
import { ulid } from "ulid";
import {
	addDays,
	addMonths,
	todayIn,
	weekday,
	zonedTimeToEpoch,
} from "../../shared/dates";
import type { RepeatRule } from "../../shared/schema";

export const TZ = "Europe/Berlin";

type Row = Record<string, unknown>;

export function seedFile() {
	const now = Date.now();
	const today = todayIn(TZ, now);
	const day = (n: number) => addDays(today, n);
	const at = (date: string, time: string) => zonedTimeToEpoch(date, time, TZ);

	const base = () => ({
		id: ulid(),
		createdAt: now,
		updatedAt: now,
		deletedAt: null,
		rev: 0,
	});
	const keys = generateNKeysBetween(null, null, 200);
	let k = 0;
	const key = () => keys[k++] as string;

	// Tags
	const tags: Row[] = [];
	const tag = (
		title: string,
		parentId: string | null = null,
		shortcut = null as string | null,
	) => {
		const row = {
			...base(),
			title,
			parentId,
			shortcut,
			sortKey: key(),
			collapsed: false,
		};
		tags.push(row);
		return row.id;
	};
	const errands = tag("errands", null, "e");
	const shop = tag("shop", errands);
	const work = tag("work", null, "w");
	const home = tag("home");
	const phone = tag("phone", null, "p");
	const urgent = tag("urgent", null, "u");

	// Areas
	const areas: Row[] = [];
	const area = (title: string, tagIds: string[] = []) => {
		const row = { ...base(), title, sortKey: key(), tagIds, collapsed: false };
		areas.push(row);
		return row.id;
	};
	const workArea = area("Work", [work]);
	const homeArea = area("Home", [home]);
	const healthArea = area("Health");

	// Projects
	const projects: Row[] = [];
	const schedule = (when: Partial<Row>) => ({
		when: "anytime",
		startDate: null,
		evening: false,
		deadline: null,
		...when,
	});
	const project = (title: string, fields: Partial<Row> = {}) => {
		const row = {
			...base(),
			...schedule(fields),
			title,
			notes: "",
			areaId: null,
			status: "open",
			completedAt: null,
			sortKey: key(),
			todaySortKey: null,
			tagIds: [],
			repeat: null,
			repeatTemplateId: null,
			...fields,
		};
		projects.push(row);
		return row.id;
	};
	const move = project("Move apartments", {
		areaId: homeArea,
		deadline: day(12),
		notes:
			"New place: **14 Linden Street**, 3rd floor.\n\nKeys handed over on the 1st. Movers booked for the morning.",
	});
	const website = project("Launch website", {
		areaId: workArea,
		deadline: day(20),
		notes: "Portfolio site with case studies and a contact form.",
	});
	const report = project("Quarterly report", {
		areaId: workArea,
		deadline: day(-3),
	});
	const trip = project("Plan summer trip", {
		when: "scheduled",
		startDate: day(9),
	});
	const spanish = project("Learn Spanish", { when: "someday" });
	project("Run a half marathon", { areaId: healthArea });

	// Headings
	const headings: Row[] = [];
	const heading = (projectId: string, title: string, archived = false) => {
		const row = { ...base(), projectId, title, sortKey: key(), archived };
		headings.push(row);
		return row.id;
	};
	const packing = heading(move, "Packing");
	const utilities = heading(move, "Utilities");
	const movingDay = heading(move, "Moving day");
	const design = heading(website, "Design");
	const content = heading(website, "Content");

	// To-dos
	const todos: Row[] = [];
	const checklist: Row[] = [];
	const todaySort = generateNKeysBetween(null, null, 40);
	const todo = (
		title: string,
		fields: Partial<Row> = {},
		items: [string, boolean][] = [],
	) => {
		const scheduled =
			fields.when === "scheduled" &&
			fields.startDate &&
			(fields.startDate as string) <= today;
		const row = {
			...base(),
			...schedule({ when: "inbox", ...fields }),
			title,
			notes: "",
			status: "open",
			completedAt: null,
			projectId: null,
			headingId: null,
			areaId: null,
			reminderAt: null,
			sortKey: key(),
			todaySortKey: scheduled ? (todaySort.shift() as string) : null,
			tagIds: [],
			repeat: null,
			repeatTemplateId: null,
			...fields,
		};
		todos.push(row);
		for (const [itemTitle, done] of items)
			checklist.push({
				...base(),
				todoId: row.id,
				title: itemTitle,
				done,
				sortKey: key(),
			});
		return row.id;
	};
	const done = (daysAgo: number, hour = "16:20") => ({
		status: "completed",
		completedAt: at(day(-daysAgo), hour),
	});
	const onDay = (n: number, extra: Partial<Row> = {}) => ({
		when: "scheduled",
		startDate: day(n),
		...extra,
	});

	// Inbox
	todo("Read the article on habit building", {
		notes: "https://example.com/habits\n\nSaved from my phone.",
	});
	todo("Call the dentist about a check-up", { tagIds: [phone] });
	todo("Ideas for Alex's birthday present");
	todo("Find a new running playlist");

	// Today
	todo("Reply to Maria about the proposal", { ...onDay(0), areaId: workArea });
	todo(
		"Buy groceries",
		{ ...onDay(0), tagIds: [errands, shop], notes: "The market closes at 6." },
		[
			["Milk", true],
			["Eggs", true],
			["Bread", false],
			["Coffee beans", false],
			["Tomatoes", false],
		],
	);
	todo("Pay the electricity bill", {
		...onDay(0),
		deadline: day(0),
		areaId: homeArea,
		tagIds: [urgent],
	});
	todo("Book a van for moving day", {
		...onDay(0),
		projectId: move,
		headingId: movingDay,
	});
	todo("Draft homepage copy", {
		...onDay(0),
		projectId: website,
		headingId: content,
	});
	todo("Go for a 5 km run", {
		...onDay(0, { evening: true }),
		areaId: healthArea,
	});
	todo("Call Mum", { ...onDay(0, { evening: true }), tagIds: [phone] });

	// Overdue
	todo("Submit expense report", {
		when: "anytime",
		deadline: day(-2),
		areaId: workArea,
	});
	todo("Return library books", {
		when: "anytime",
		deadline: day(-5),
		tagIds: [errands],
	});

	// Upcoming
	todo("Dentist appointment", {
		...onDay(1),
		reminderAt: at(day(1), "09:30"),
		areaId: healthArea,
	});
	todo("Prepare the team offsite agenda", { ...onDay(3), areaId: workArea });
	todo("Pick up dry cleaning", { ...onDay(4), tagIds: [errands] });
	todo("Renew passport", { ...onDay(16), deadline: day(30) });
	todo("Book a table for our anniversary", { ...onDay(40) });

	// Anytime
	todo("Clean out the garage", { when: "anytime", areaId: homeArea });
	todo("Organise holiday photos", { when: "anytime", areaId: homeArea });
	todo("Update my CV", { when: "anytime", areaId: workArea });
	todo("Stretch for 10 minutes", { when: "anytime", areaId: healthArea });

	// Someday
	todo("Learn to bake sourdough", { when: "someday" });
	todo("Visit Japan in cherry blossom season", { when: "someday" });
	todo("Build a bookshelf", { when: "someday", areaId: homeArea });
	todo("Order a phrasebook", { when: "anytime", projectId: spanish });
	todo("Find a weekly class", { when: "anytime", projectId: spanish });

	// Project: Move apartments
	todo("Get boxes and tape", { when: "anytime", projectId: move, ...done(2) });
	todo("Sort clothes to donate", {
		when: "anytime",
		projectId: move,
		...done(1),
	});
	todo(
		"Pack the kitchen",
		{ when: "anytime", projectId: move, headingId: packing },
		[
			["Plates and bowls", true],
			["Glasses", false],
			["Pots and pans", false],
		],
	);
	todo("Pack books", { when: "anytime", projectId: move, headingId: packing });
	todo("Label every box by room", {
		when: "anytime",
		projectId: move,
		headingId: packing,
	});
	todo("Set up internet at the new place", {
		when: "anytime",
		projectId: move,
		headingId: utilities,
		deadline: day(10),
	});
	todo("Cancel the old electricity contract", {
		when: "anytime",
		projectId: move,
		headingId: utilities,
		tagIds: [phone],
	});
	todo("Update my address with the bank", {
		when: "anytime",
		projectId: move,
		headingId: utilities,
		...done(0, "11:05"),
	});
	todo("Hand back the old keys", {
		when: "anytime",
		projectId: move,
		headingId: movingDay,
	});
	todo("Measure the new living room", { when: "anytime", projectId: move });

	// Project: Launch website
	todo("Pick a colour palette", {
		when: "anytime",
		projectId: website,
		headingId: design,
		...done(3),
	});
	todo("Design the homepage", {
		when: "anytime",
		projectId: website,
		headingId: design,
	});
	todo("Write three case studies", {
		when: "anytime",
		projectId: website,
		headingId: content,
	});
	todo("Choose a domain name", { when: "anytime", projectId: website });

	// Project: Quarterly report (overdue)
	todo("Collect numbers from finance", {
		when: "anytime",
		projectId: report,
		...done(4),
	});
	todo("Write the summary", { when: "anytime", projectId: report });

	// Project: Plan summer trip (starts later)
	todo("Compare flights", { when: "anytime", projectId: trip });
	todo("Book accommodation", { when: "anytime", projectId: trip });

	// Logbook
	todo("Renew car insurance", {
		when: "anytime",
		areaId: homeArea,
		...done(0, "09:40"),
	});
	todo("Send invoice to client", {
		when: "anytime",
		areaId: workArea,
		...done(1),
	});
	todo("Fix the bike light", {
		when: "anytime",
		tagIds: [errands],
		...done(1, "18:10"),
	});
	todo("Old gym membership", {
		when: "anytime",
		areaId: healthArea,
		status: "canceled",
		completedAt: at(day(-2), "12:00"),
	});

	// Repeating
	const rule = (r: Partial<RepeatRule>): RepeatRule =>
		({ mode: "fixed", interval: 1, nextDate: day(1), ...r }) as RepeatRule;
	todo("Water the plants", {
		when: "scheduled",
		startDate: day(2),
		areaId: homeArea,
		repeat: rule({ freq: "daily", interval: 3, nextDate: day(2) }),
	});
	const friday = day((5 - weekday(today) + 7) % 7 || 7);
	todo("Weekly review", {
		when: "scheduled",
		startDate: friday,
		repeat: rule({
			freq: "weekly",
			byWeekday: [5],
			reminderTime: "17:00",
			nextDate: friday,
		}),
	});
	todo("Pay rent", {
		when: "scheduled",
		startDate: addMonths(today, 1).slice(0, 8).concat("01"),
		areaId: homeArea,
		tagIds: [urgent],
		repeat: rule({
			freq: "monthly",
			byMonthDay: 1,
			deadlineOffsetDays: 2,
			nextDate: addMonths(today, 1).slice(0, 8).concat("01"),
		}),
	});
	todo("Back up my laptop", {
		when: "scheduled",
		startDate: day(6),
		projectId: website,
		repeat: rule({
			mode: "afterCompletion",
			freq: "weekly",
			interval: 2,
			nextDate: day(6),
		}),
	});

	return {
		format: "mythings-export",
		version: 1,
		exportedAt: new Date(now).toISOString(),
		data: {
			tag: tags,
			area: areas,
			project: projects,
			heading: headings,
			todo: todos,
			checklist,
		},
	};
}
