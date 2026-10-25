import { ulid } from "ulid";
import type {
	Area,
	Heading,
	Project,
	RepeatRule,
	Tag,
	Todo,
} from "../../shared/schema";
import type { ViewContext, ViewData } from "../../shared/views";

export const TODAY = "2026-10-25"; // a Sunday
export const ctx: ViewContext = { today: TODAY, tz: "UTC" };

let clock = Date.UTC(2026, 0, 1);
const tick = () => clock++;

/** Epoch ms at noon UTC on a local date (so it's that date in UTC). */
export function noon(date: string): number {
	return Date.parse(`${date}T12:00:00Z`);
}

const base = () => ({
	id: ulid(),
	createdAt: tick(),
	updatedAt: clock,
	deletedAt: null,
	rev: 0,
});

export function todo(overrides: Partial<Todo> = {}): Todo {
	return {
		...base(),
		title: "To-do",
		notes: "",
		status: "open",
		completedAt: null,
		projectId: null,
		headingId: null,
		areaId: null,
		when: "anytime",
		startDate: null,
		evening: false,
		deadline: null,
		reminderAt: null,
		sortKey: "a0",
		todaySortKey: null,
		tagIds: [],
		repeat: null,
		repeatTemplateId: null,
		...overrides,
	};
}

export function project(overrides: Partial<Project> = {}): Project {
	return {
		...base(),
		title: "Project",
		notes: "",
		areaId: null,
		status: "open",
		completedAt: null,
		when: "anytime",
		startDate: null,
		evening: false,
		deadline: null,
		sortKey: "a0",
		todaySortKey: null,
		tagIds: [],
		repeat: null,
		repeatTemplateId: null,
		...overrides,
	};
}

export function area(overrides: Partial<Area> = {}): Area {
	return { ...base(), title: "Area", sortKey: "a0", tagIds: [], ...overrides };
}

export function heading(
	overrides: Partial<Heading> & { projectId: string },
): Heading {
	return {
		...base(),
		title: "Heading",
		sortKey: "a0",
		archived: false,
		...overrides,
	};
}

export function tag(overrides: Partial<Tag> = {}): Tag {
	return {
		...base(),
		title: "tag",
		parentId: null,
		shortcut: null,
		sortKey: "a0",
		...overrides,
	};
}

export function rule(overrides: Partial<RepeatRule> = {}): RepeatRule {
	return {
		mode: "fixed",
		freq: "daily",
		interval: 1,
		nextDate: TODAY,
		...overrides,
	};
}

export function data(parts: Partial<ViewData> = {}): ViewData {
	return {
		areas: [],
		projects: [],
		headings: [],
		todos: [],
		tags: [],
		...parts,
	};
}

export const scheduled = (startDate: string) => ({
	when: "scheduled" as const,
	startDate,
});
export const done = (date = TODAY) => ({
	status: "completed" as const,
	completedAt: noon(date),
});
