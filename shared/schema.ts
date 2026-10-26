import { z } from "zod";
import { daysInMonth, isValidLocalDate } from "./dates";

// ---------------------------------------------------------------------------
// Account

export const emailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email().max(254));

export const passwordSchema = z
	.string()
	.min(8, "Use at least 8 characters")
	.max(1024, "Use at most 1024 characters");

export const timeZoneSchema = z.string().refine(
	(tz) => {
		try {
			new Intl.DateTimeFormat("en-US", { timeZone: tz });
			return true;
		} catch {
			return false;
		}
	},
	{ message: "Unknown time zone" },
);

export const credentialsSchema = z.object({
	email: emailSchema,
	password: passwordSchema,
});

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1).max(1024),
	newPassword: passwordSchema,
});

/** A person's name as they'd like to be addressed. Empty means not set. */
export const nameSchema = z
	.string()
	.trim()
	.max(100, "Use at most 100 characters")
	.regex(/^[^\p{Cc}]*$/u, "Remove the special characters");

const tokenSchema = z.string().min(20).max(200);

/** Sign-up step 1: who's signing up. The email gets a link to finish. */
export const signupSchema = z.object({
	name: nameSchema.pipe(z.string().min(1, "Enter your name")),
	email: emailSchema,
	tz: timeZoneSchema.optional(),
});

/** Opening the emailed link: which sign-up it belongs to. */
export const signupLinkSchema = z.object({ token: tokenSchema });

export const verifySignupSchema = z.object({
	token: tokenSchema,
	name: nameSchema.pipe(z.string().min(1, "Enter your name")),
	/** Chosen here, on the page the link opens, so only whoever can read the email sets it. */
	password: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
	token: tokenSchema,
	password: passwordSchema,
});

/** User preferences (SPEC §10.9). Every key is optional; missing keys use defaults on the client. */
export const settingsSchema = z
	.object({
		weekStart: z.union([z.literal(0), z.literal(1), z.literal(6)]),
		theme: z.enum(["system", "light", "dark"]),
		groupTodayByProject: z.boolean(),
		logbookTiming: z.enum(["immediately", "daily"]),
	})
	.partial()
	.strict();

export const updateMeSchema = z
	.object({
		/** An empty name clears it. */
		name: nameSchema,
		tz: timeZoneSchema,
		settings: settingsSchema,
	})
	.partial()
	.strict();

export type Settings = z.infer<typeof settingsSchema>;

export type Me = {
	id: string;
	email: string;
	/** Null until the person sets one (accounts from before 1.4.0). */
	name: string | null;
	tz: string;
	settings: Settings;
};

export type ApiErrorBody = {
	error: string;
	issues?: { path: (string | number)[]; message: string }[];
};

// ---------------------------------------------------------------------------
// Primitives

export const ulidSchema = z
	.string()
	.regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Expected a ULID");
export const localDateSchema = z
	.string()
	.refine(isValidLocalDate, { message: "Expected a YYYY-MM-DD date" });
export const timeOfDaySchema = z
	.string()
	.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm (24-hour)");
const sortKeySchema = z.string().min(1).max(256);
const epochMsSchema = z.number().int().nonnegative();
const weekdaySchema = z.number().int().min(0).max(6);
const titleSchema = z.string().max(1000);
const notesSchema = z.string().max(100_000);
const tagIdsSchema = z
	.array(ulidSchema)
	.max(50)
	.refine((ids) => new Set(ids).size === ids.length, {
		message: "Duplicate tag",
	});

export const statusSchema = z.enum(["open", "completed", "canceled"]);
export const whenSchema = z.enum(["inbox", "anytime", "someday", "scheduled"]);
export type Status = z.infer<typeof statusSchema>;
export type When = z.infer<typeof whenSchema>;

// ---------------------------------------------------------------------------
// Repeat rules (SPEC §5.8)

export const repeatRuleSchema = z
	.object({
		mode: z.enum(["fixed", "afterCompletion"]),
		freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
		interval: z.number().int().min(1).max(999),
		/** weekly: which weekdays (0 = Sunday). */
		byWeekday: z.array(weekdaySchema).min(1).max(7).optional(),
		/** monthly or yearly: day of month, -1 = last day. */
		byMonthDay: z
			.number()
			.int()
			.refine((d) => d === -1 || (d >= 1 && d <= 31), {
				message: "Expected 1–31 or -1",
			})
			.optional(),
		/** monthly: "2nd Tuesday", "last Friday". */
		byNth: z
			.object({
				n: z.union([
					z.literal(1),
					z.literal(2),
					z.literal(3),
					z.literal(4),
					z.literal(-1),
				]),
				weekday: weekdaySchema,
			})
			.optional(),
		/** yearly: month, 1–12. */
		byMonth: z.number().int().min(1).max(12).optional(),
		deadlineOffsetDays: z.number().int().min(0).max(365).optional(),
		reminderTime: timeOfDaySchema.optional(),
		endsOn: localDateSchema.nullable().optional(),
		/** startDate of the next instance. Past endsOn once the series has ended. */
		nextDate: localDateSchema,
	})
	.superRefine((rule, ctx) => {
		const by = (
			["byWeekday", "byMonthDay", "byNth", "byMonth"] as const
		).filter((key) => rule[key] !== undefined);
		const allowOnly = (allowed: string[]) => {
			for (const key of by) {
				if (!allowed.includes(key)) {
					ctx.addIssue({
						code: "custom",
						path: [key],
						message: `Not allowed for ${rule.mode} ${rule.freq} rules`,
					});
				}
			}
		};

		if (rule.mode === "afterCompletion") {
			allowOnly([]);
		} else if (rule.freq === "daily") {
			allowOnly([]);
		} else if (rule.freq === "weekly") {
			allowOnly(["byWeekday"]);
		} else if (rule.freq === "monthly") {
			allowOnly(["byMonthDay", "byNth"]);
			if ((rule.byMonthDay === undefined) === (rule.byNth === undefined)) {
				ctx.addIssue({
					code: "custom",
					path: ["byMonthDay"],
					message: "Monthly rules need exactly one of byMonthDay or byNth",
				});
			}
		} else {
			allowOnly(["byMonth", "byMonthDay"]);
			if (rule.byMonth === undefined || rule.byMonthDay === undefined) {
				ctx.addIssue({
					code: "custom",
					path: ["byMonth"],
					message: "Yearly rules need byMonth and byMonthDay",
				});
			} else if (rule.byMonthDay > daysInMonth(2024, rule.byMonth)) {
				ctx.addIssue({
					code: "custom",
					path: ["byMonthDay"],
					message: "That month never has this many days",
				});
			}
		}
	});

export type RepeatRule = z.infer<typeof repeatRuleSchema>;

// ---------------------------------------------------------------------------
// Entities (SPEC §5)
//
// Each entity has a plain field object (used to derive patch schemas, since
// Zod can't make a refined object partial) and a row schema that adds the
// cross-field invariants.

const baseFields = {
	id: ulidSchema,
	createdAt: epochMsSchema,
	updatedAt: epochMsSchema,
	deletedAt: epochMsSchema.nullable(),
	rev: z.number().int().nonnegative(),
};

const scheduleFields = {
	when: whenSchema,
	startDate: localDateSchema.nullable(),
	evening: z.boolean(),
	deadline: localDateSchema.nullable(),
};

const areaFields = z.object({
	...baseFields,
	title: titleSchema,
	sortKey: sortKeySchema,
	tagIds: tagIdsSchema,
});

const projectFields = z.object({
	...baseFields,
	...scheduleFields,
	title: titleSchema,
	notes: notesSchema,
	areaId: ulidSchema.nullable(),
	status: statusSchema,
	completedAt: epochMsSchema.nullable(),
	sortKey: sortKeySchema,
	todaySortKey: sortKeySchema.nullable(),
	tagIds: tagIdsSchema,
	repeat: repeatRuleSchema.nullable(),
	repeatTemplateId: ulidSchema.nullable(),
});

const headingFields = z.object({
	...baseFields,
	projectId: ulidSchema,
	title: titleSchema,
	sortKey: sortKeySchema,
	archived: z.boolean(),
});

const todoFields = z.object({
	...baseFields,
	...scheduleFields,
	title: titleSchema,
	notes: notesSchema,
	status: statusSchema,
	completedAt: epochMsSchema.nullable(),
	projectId: ulidSchema.nullable(),
	headingId: ulidSchema.nullable(),
	areaId: ulidSchema.nullable(),
	reminderAt: epochMsSchema.nullable(),
	sortKey: sortKeySchema,
	todaySortKey: sortKeySchema.nullable(),
	tagIds: tagIdsSchema,
	repeat: repeatRuleSchema.nullable(),
	repeatTemplateId: ulidSchema.nullable(),
});

const checklistItemFields = z.object({
	...baseFields,
	todoId: ulidSchema,
	title: titleSchema,
	done: z.boolean(),
	sortKey: sortKeySchema,
});

const tagFields = z.object({
	...baseFields,
	title: z.string().trim().min(1).max(100),
	parentId: ulidSchema.nullable(),
	shortcut: z.string().length(1).nullable(),
	sortKey: sortKeySchema,
});

type Schedulable = z.infer<typeof projectFields> | z.infer<typeof todoFields>;

function checkSchedulable(row: Schedulable, ctx: z.RefinementCtx) {
	if ((row.when === "scheduled") !== (row.startDate !== null)) {
		ctx.addIssue({
			code: "custom",
			path: ["startDate"],
			message:
				"startDate is required for scheduled items and only allowed for them",
		});
	}
	if (row.evening && row.when !== "scheduled") {
		ctx.addIssue({
			code: "custom",
			path: ["evening"],
			message: "Only scheduled items can be evening",
		});
	}
	if ((row.status === "open") !== (row.completedAt === null)) {
		ctx.addIssue({
			code: "custom",
			path: ["completedAt"],
			message:
				"completedAt is set exactly when the item is completed or canceled",
		});
	}
	if (row.repeat && row.repeatTemplateId) {
		ctx.addIssue({
			code: "custom",
			path: ["repeatTemplateId"],
			message: "A repeat template can't itself be an instance",
		});
	}
	if (row.repeat && row.status !== "open") {
		ctx.addIssue({
			code: "custom",
			path: ["status"],
			message: "Repeat templates stay open",
		});
	}
}

export const areaSchema = areaFields;

export const projectSchema = projectFields.superRefine((row, ctx) => {
	checkSchedulable(row, ctx);
	if (row.when === "inbox") {
		ctx.addIssue({
			code: "custom",
			path: ["when"],
			message: "Projects can't be in the Inbox",
		});
	}
});

export const headingSchema = headingFields;

export const todoSchema = todoFields.superRefine((row, ctx) => {
	checkSchedulable(row, ctx);
	if (row.headingId && !row.projectId) {
		ctx.addIssue({
			code: "custom",
			path: ["headingId"],
			message: "A heading needs a project",
		});
	}
	if (row.projectId && row.areaId) {
		ctx.addIssue({
			code: "custom",
			path: ["areaId"],
			message: "To-dos in a project take the project's area",
		});
	}
	if (row.when === "inbox" && (row.projectId || row.areaId)) {
		ctx.addIssue({
			code: "custom",
			path: ["when"],
			message: "Inbox to-dos can't belong to a project or area",
		});
	}
});

export const checklistItemSchema = checklistItemFields;

export const tagSchema = tagFields.superRefine((row, ctx) => {
	if (row.parentId === row.id) {
		ctx.addIssue({
			code: "custom",
			path: ["parentId"],
			message: "A tag can't be its own parent",
		});
	}
});

export type Area = z.infer<typeof areaSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Heading = z.infer<typeof headingSchema>;
export type Todo = z.infer<typeof todoSchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type Tag = z.infer<typeof tagSchema>;

// The server assigns id (from the op), rev and updatedAt; everything else can be patched.
const serverOwned = { id: true, rev: true, updatedAt: true } as const;

export const entities = {
	area: {
		row: areaSchema,
		patch: areaFields.omit(serverOwned).partial().strict(),
	},
	project: {
		row: projectSchema,
		patch: projectFields.omit(serverOwned).partial().strict(),
	},
	heading: {
		row: headingSchema,
		patch: headingFields.omit(serverOwned).partial().strict(),
	},
	todo: {
		row: todoSchema,
		patch: todoFields.omit(serverOwned).partial().strict(),
	},
	checklist: {
		row: checklistItemSchema,
		patch: checklistItemFields.omit(serverOwned).partial().strict(),
	},
	tag: {
		row: tagSchema,
		patch: tagFields.omit(serverOwned).partial().strict(),
	},
};

export type EntityName = keyof typeof entities;
export const entityNameSchema = z.enum(
	Object.keys(entities) as [EntityName, ...EntityName[]],
);

export type EntityRowMap = {
	area: Area;
	project: Project;
	heading: Heading;
	todo: Todo;
	checklist: ChecklistItem;
	tag: Tag;
};

export type EntityRow = {
	[E in EntityName]: { entity: E; row: EntityRowMap[E] };
}[EntityName];

// ---------------------------------------------------------------------------
// Sync (SPEC §7)

const opBase = {
	opId: ulidSchema,
	entityId: ulidSchema,
	clientTs: epochMsSchema,
};

function upsertOp<E extends EntityName>(entity: E) {
	return z.object({
		...opBase,
		entity: z.literal(entity),
		kind: z.literal("upsert"),
		patch: entities[entity].patch as (typeof entities)[E]["patch"],
	});
}

const upsertOpSchema = z.discriminatedUnion("entity", [
	upsertOp("area"),
	upsertOp("project"),
	upsertOp("heading"),
	upsertOp("todo"),
	upsertOp("checklist"),
	upsertOp("tag"),
]);

/** `delete` moves to Trash (and cascades); `purge` removes permanently. */
const removeOpSchema = z.object({
	...opBase,
	entity: entityNameSchema,
	kind: z.enum(["delete", "purge"]),
});

export const opSchema = z.union([upsertOpSchema, removeOpSchema]);
export type Op = z.infer<typeof opSchema>;

export const MAX_OPS_PER_PUSH = 100;

export const clientMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("hello"),
		lastRev: z.number().int().nonnegative(),
		tz: timeZoneSchema,
	}),
	z.object({
		type: z.literal("push"),
		ops: z.array(opSchema).min(1).max(MAX_OPS_PER_PUSH),
	}),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type OpError = {
	opId: string | null;
	code: string;
	message: string;
	issues?: ApiErrorBody["issues"];
	/**
	 * The server's version of the row the op targeted (null if it doesn't
	 * exist), so the client can undo its optimistic change.
	 */
	current?: EntityRow | null;
};

/** Rows changed since some rev, plus rows that were permanently deleted. */
export type Changes = {
	rows: EntityRow[];
	purged: { entity: EntityName; id: string }[];
};

/** Ops that were applied (or had already been) are acked; rejected ones come back in errors. */
export type PushResult = Changes & {
	rev: number;
	acked: string[];
	errors: OpError[];
};

export type PullResult = Changes & { rev: number; more: boolean };

export type ServerMessage =
	| { type: "ack"; opIds: string[]; rev: number }
	/** Rows covering revs (fromRev, rev]; a client that has seen fromRev can advance to rev. */
	| ({
			type: "changes";
			fromRev: number;
			rev: number;
			more: boolean;
			/**
			 * Ops already applied in this batch. The sender drops them from its
			 * outbox before applying the rows, so it doesn't replay them over
			 * fields the server changed (the ack may arrive later).
			 */
			opIds?: string[];
	  } & Changes)
	| ({ type: "error" } & OpError);
