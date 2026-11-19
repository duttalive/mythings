// Applies sync ops to a user's Store (SPEC §7.3): field-level last-writer-wins
// in arrival order, server-side normalization and invariants, cascading
// deletes/restores, and repeat-instance creation.

import { ulid } from "ulid";
import { plainFields } from "../shared/crypto/fields";
import { addDays, localDateOf, todayIn } from "../shared/dates";
import { instanceSchedule, materialize, nextAfter } from "../shared/repeat";
import { buildRow, type Fields } from "../shared/rows";
import {
	type ApiErrorBody,
	type EntityName,
	type EntityRow,
	type EntityRowMap,
	entities,
	type Op,
	type Project,
	type RepeatRule,
	type Todo,
} from "../shared/schema";
import { defaultBucket } from "../shared/structure";
import type { Store } from "./store";

export type UserContext = {
	userId: string;
	tz: string;
	weekStart: number;
	/** Text must arrive encrypted (SPEC §8.5); plain text is rejected. */
	encrypted?: boolean;
};

/** Thrown to reject one op without affecting the rest of the batch. */
export class OpRejected extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly issues?: ApiErrorBody["issues"],
	) {
		super(message);
	}
}

type AnyRow = EntityRowMap[EntityName];

export class Applier {
	readonly changed = new Map<string, EntityRow>();
	readonly purged = new Map<string, { entity: EntityName; id: string }>();
	private readonly now = Date.now();

	constructor(
		private readonly store: Store,
		private readonly user: UserContext,
	) {}

	apply(op: Op): void {
		if (op.kind === "upsert") {
			this.upsert(
				op.entity,
				op.entityId,
				op.patch as Record<string, unknown>,
				op.clientTs,
			);
			return;
		}
		const existing = this.store.get(op.entity, op.entityId);
		if (!existing)
			throw new OpRejected(
				"not_found",
				`${op.entity} ${op.entityId} not found`,
			);
		if (op.kind === "delete") {
			if (existing.deletedAt === null)
				this.softDelete(op.entity, existing, this.now);
		} else {
			this.purgeTree(op.entity, existing);
		}
	}

	// -------------------------------------------------------------------------
	// Upsert

	private upsert(
		entity: EntityName,
		id: string,
		patch: Record<string, unknown>,
		clientTs: number,
	) {
		// An old tab or a device that missed the switch mustn't put plain text back.
		if (this.user.encrypted && plainFields(entity, patch).length > 0)
			throw new OpRejected(
				"encryption_required",
				"This account is encrypted; encrypt the change and send it again",
			);
		const existing = this.store.get(entity, id) as Fields | null;
		const merged = buildRow(
			entity,
			id,
			existing,
			patch,
			clientTs,
			this.now,
			(headingId) => this.store.get("heading", headingId)?.projectId,
		);
		if (entity === "area" || entity === "project")
			this.placeInBucket(entity, merged, existing, patch);
		const row = this.validate(entity, merged);
		this.checkReferences(entity, row as unknown as Fields, existing);
		this.write(entity, row);

		if (!existing) return;
		const before = existing as Fields;
		if (before.deletedAt !== null && row.deletedAt === null) {
			this.restoreChildren(entity, row.id, before.deletedAt);
		} else if (before.deletedAt === null && row.deletedAt !== null) {
			this.cascadeDelete(entity, row.id, row.deletedAt);
		}
		if (
			entity === "heading" &&
			before.projectId !== (row as Fields).projectId
		) {
			for (const todo of this.store.where("todo", "heading_id = ?", row.id)) {
				this.write("todo", {
					...todo,
					projectId: (row as Fields).projectId as string,
					areaId: null,
				});
			}
		}
		if (
			(entity === "todo" || entity === "project") &&
			before.status === "open" &&
			(row as Fields).status !== "open"
		) {
			this.onInstanceFinished(entity, row as Todo | Project);
		}
	}

	/**
	 * Every live area and project sits in a Life Bucket (SPEC §5.2). One sent
	 * without a usable bucket — from an app version before buckets, an import,
	 * or a restore whose bucket is gone — goes into the first bucket. A project
	 * put into an area goes into that area's bucket.
	 */
	private placeInBucket(
		entity: "area" | "project",
		row: Fields,
		existing: Fields | null,
		patch: Record<string, unknown>,
	) {
		if (entity === "area") {
			if (existing && "kind" in patch && patch.kind !== existing.kind)
				throw new OpRejected(
					"invalid_row",
					"An area can't become a Life Bucket, or the other way round",
					[{ path: ["kind"], message: "Can't change" }],
				);
			if (row.kind === "bucket") {
				row.bucketId = null;
				return;
			}
		}
		const field = entity === "area" ? "bucketId" : "areaId";
		if (row.deletedAt !== null) return;
		const id = row[field] as string | null;
		let target = id ? (this.store.get("area", id) as Fields | null) : null;
		if (target && target.kind !== "bucket" && entity === "project")
			target = target.bucketId
				? (this.store.get("area", target.bucketId as string) as Fields | null)
				: null;
		row[field] =
			target && target.kind === "bucket" && target.deletedAt === null
				? target.id
				: this.defaultBucket();
	}

	/** The first live Life Bucket, made ("Personal") if there are none. */
	private defaultBucket(): string {
		const first = this.store.where(
			"area",
			"kind = 'bucket' AND deleted_at IS NULL ORDER BY sort_key, id LIMIT 1",
		)[0];
		if (first) return first.id;
		const bucket = defaultBucket(ulid(), this.now);
		this.write("area", bucket);
		return bucket.id;
	}

	private reference<E extends EntityName>(
		entity: E,
		id: string,
		field: string,
	): EntityRowMap[E] {
		const row = this.store.get(entity, id);
		if (!row || row.deletedAt !== null) {
			throw new OpRejected(
				"missing_reference",
				`${field} ${id} doesn't exist`,
				[{ path: [field], message: `No such ${entity}` }],
			);
		}
		return row;
	}

	/** Checks references that this op introduces (unchanged ones are left alone). */
	private checkReferences(
		entity: EntityName,
		row: Fields,
		existing: Fields | null,
	) {
		const changed = (field: string) =>
			row[field] != null && (!existing || existing[field] !== row[field]);

		if (changed("projectId") && entity !== "project")
			this.reference("project", row.projectId as string, "projectId");
		if (changed("areaId")) {
			const container = this.reference("area", row.areaId as string, "areaId");
			// A to-do goes in an area; a project's areaId names its Life Bucket.
			const wanted = entity === "todo" ? "area" : "bucket";
			if (container.kind !== wanted)
				throw new OpRejected(
					"invalid_reference",
					entity === "todo"
						? "To-dos go in an area or a project, not a Life Bucket"
						: "Projects go in a Life Bucket",
					[
						{
							path: ["areaId"],
							message: `Not ${wanted === "area" ? "an area" : "a Life Bucket"}`,
						},
					],
				);
		}
		if (changed("todoId"))
			this.reference("todo", row.todoId as string, "todoId");
		if (
			entity === "todo" &&
			row.headingId &&
			(changed("headingId") || changed("projectId"))
		) {
			const heading = this.reference(
				"heading",
				row.headingId as string,
				"headingId",
			);
			if (heading.projectId !== row.projectId) {
				throw new OpRejected(
					"invalid_reference",
					"The heading belongs to a different project",
					[{ path: ["headingId"], message: "Heading is in another project" }],
				);
			}
		}
		if (entity === "tag" && changed("parentId")) {
			let parent: Fields | null = this.reference(
				"tag",
				row.parentId as string,
				"parentId",
			);
			while (parent) {
				if (parent.id === row.id) {
					throw new OpRejected("cycle", "A tag can't be nested inside itself", [
						{ path: ["parentId"], message: "Creates a cycle" },
					]);
				}
				parent = parent.parentId
					? (this.store.get("tag", parent.parentId as string) as Fields | null)
					: null;
			}
		}
		if (Array.isArray(row.tagIds)) {
			const before = new Set((existing?.tagIds as string[] | undefined) ?? []);
			for (const tagId of row.tagIds as string[]) {
				if (!before.has(tagId)) this.reference("tag", tagId, "tagIds");
			}
		}
	}

	private validate<E extends EntityName>(
		entity: E,
		row: Fields,
	): EntityRowMap[E] {
		const result = entities[entity].row.safeParse(row);
		if (!result.success) {
			throw new OpRejected(
				"invalid_row",
				result.error.issues[0]?.message ?? "Invalid row",
				result.error.issues.map((i) => ({
					path: i.path.filter(
						(p): p is string | number => typeof p !== "symbol",
					),
					message: i.message,
				})),
			);
		}
		return result.data as EntityRowMap[E];
	}

	/** Assigns a new rev and saves the row. */
	private write<E extends EntityName>(entity: E, row: EntityRowMap[E]) {
		const saved = { ...row, rev: this.store.nextRev(), updatedAt: this.now };
		this.store.put(entity, saved);
		this.changed.set(`${entity}:${row.id}`, {
			entity,
			row: saved,
		} as EntityRow);
	}

	// -------------------------------------------------------------------------
	// Delete, restore, purge

	private children(
		entity: EntityName,
		id: string,
		forPurge = false,
	): [EntityName, AnyRow][] {
		const tagged = <E extends EntityName>(child: E, rows: EntityRowMap[E][]) =>
			rows.map((row) => [child, row] as [EntityName, AnyRow]);
		switch (entity) {
			case "area":
				return [
					...tagged("area", this.store.where("area", "bucket_id = ?", id)),
					...tagged("project", this.store.where("project", "area_id = ?", id)),
					...tagged("todo", this.store.where("todo", "area_id = ?", id)),
				];
			case "project":
				return [
					...tagged(
						"heading",
						this.store.where("heading", "project_id = ?", id),
					),
					...tagged("todo", this.store.where("todo", "project_id = ?", id)),
				];
			case "heading":
				return tagged("todo", this.store.where("todo", "heading_id = ?", id));
			case "tag":
				return tagged("tag", this.store.where("tag", "parent_id = ?", id));
			case "todo":
				// Checklist items are hidden with their to-do; they only go when it's purged.
				return forPurge
					? tagged(
							"checklist",
							this.store.where("checklist", "todo_id = ?", id),
						)
					: [];
			case "checklist":
				return [];
		}
	}

	/** Children deleted along with a parent share its deletedAt, so a restore brings back exactly those. */
	private softDelete(entity: EntityName, row: AnyRow, at: number) {
		this.write(entity, { ...row, deletedAt: at });
		this.cascadeDelete(entity, row.id, at);
	}

	private cascadeDelete(entity: EntityName, id: string, at: number) {
		for (const [childEntity, child] of this.children(entity, id)) {
			const current = this.store.get(childEntity, child.id);
			if (current && current.deletedAt === null)
				this.softDelete(childEntity, current, at);
		}
	}

	private restoreChildren(entity: EntityName, id: string, deletedAt: number) {
		for (const [childEntity, child] of this.children(entity, id)) {
			const current = this.store.get(childEntity, child.id);
			if (current && current.deletedAt === deletedAt) {
				this.write(childEntity, { ...current, deletedAt: null });
				this.restoreChildren(childEntity, child.id, deletedAt);
			}
		}
	}

	private purgeTree(entity: EntityName, row: AnyRow) {
		for (const [childEntity, child] of this.children(entity, row.id, true)) {
			this.purgeTree(childEntity, child);
		}
		this.store.purge(entity, row.id);
		const key = `${entity}:${row.id}`;
		this.changed.delete(key);
		this.purged.set(key, { entity, id: row.id });

		if (entity === "tag") {
			for (const holder of ["area", "project", "todo"] as const) {
				for (const item of this.store.where(
					holder,
					"tag_ids LIKE ?",
					`%"${row.id}"%`,
				)) {
					this.write(holder, {
						...item,
						tagIds: item.tagIds.filter((t) => t !== row.id),
					});
				}
			}
		}
	}

	/** Permanently deletes Trash items deleted before `cutoff` (SPEC §9: after 30 days). */
	purgeTrashOlderThan(cutoff: number): void {
		// Parents first: their children go with them.
		for (const entity of [
			"area",
			"project",
			"heading",
			"todo",
			"checklist",
			"tag",
		] as const) {
			for (const row of this.store.where(
				entity,
				"deleted_at IS NOT NULL AND deleted_at < ?",
				cutoff,
			)) {
				if (this.store.get(entity, row.id)) this.purgeTree(entity, row);
			}
		}
	}

	// -------------------------------------------------------------------------
	// Repeats

	/** Creates any instances that are due for the user's today. Safe to call repeatedly. */
	materializeDue(): void {
		const today = todayIn(this.user.tz);
		for (const entity of ["todo", "project"] as const) {
			for (const template of this.store.where(
				entity,
				"repeat IS NOT NULL AND deleted_at IS NULL",
			)) {
				const rule = template.repeat as RepeatRule;
				if (rule.mode === "fixed") {
					const due = materialize(rule, today, this.user.weekStart);
					if (!due) continue;
					if (!this.hasInstanceOn(entity, template.id, due.instanceDate)) {
						this.createInstance(entity, template, due.instanceDate);
					}
					this.setNextDate(entity, template, due.nextDate);
				} else if (
					rule.nextDate <= today &&
					!(rule.endsOn && rule.nextDate > rule.endsOn) &&
					!this.hasInstanceOn(entity, template.id, rule.nextDate) &&
					this.store.where(
						entity,
						"repeat_template_id = ? AND status = 'open' AND deleted_at IS NULL",
						template.id,
					).length === 0
				) {
					this.createInstance(entity, template, rule.nextDate);
				}
			}
		}
	}

	/** Any instance on that date counts, even a deleted one, so deleting an instance doesn't respawn it. */
	private hasInstanceOn(
		entity: "todo" | "project",
		templateId: string,
		date: string,
	): boolean {
		return (
			this.store.where(
				entity,
				"repeat_template_id = ? AND start_date = ?",
				templateId,
				date,
			).length > 0
		);
	}

	/** An after-completion series schedules its next instance from the day this one was finished. */
	private onInstanceFinished(
		entity: "todo" | "project",
		instance: Todo | Project,
	) {
		if (!instance.repeatTemplateId || instance.completedAt === null) return;
		const template = this.store.get(entity, instance.repeatTemplateId);
		const rule = template?.repeat;
		if (
			!template ||
			template.deletedAt !== null ||
			rule?.mode !== "afterCompletion"
		)
			return;
		const finishedOn = localDateOf(instance.completedAt, this.user.tz);
		this.setNextDate(
			entity,
			template,
			nextAfter(rule, finishedOn, this.user.weekStart),
		);
	}

	private setNextDate(
		entity: "todo" | "project",
		template: Todo | Project,
		nextDate: string | null,
	) {
		const rule = template.repeat as RepeatRule;
		// A finished series parks nextDate just past endsOn, which hides it from Upcoming.
		const next = nextDate ?? addDays(rule.endsOn ?? rule.nextDate, 1);
		this.write(entity, {
			...template,
			repeat: { ...rule, nextDate: next },
		} as EntityRowMap[typeof entity]);
	}

	private createInstance(
		entity: "todo" | "project",
		template: Todo | Project,
		date: string,
	) {
		const rule = template.repeat as RepeatRule;
		const schedule = instanceSchedule(rule, date, this.user.tz);
		const common = {
			id: ulid(),
			createdAt: this.now,
			deletedAt: null,
			status: "open" as const,
			completedAt: null,
			when: "scheduled" as const,
			startDate: date,
			evening: false,
			deadline: schedule.deadline,
			todaySortKey: null,
			repeat: null,
			repeatTemplateId: template.id,
		};

		if (entity === "todo") {
			const instance = this.validate("todo", {
				...(template as Todo),
				...common,
				reminderAt: schedule.reminderAt,
			});
			this.write("todo", instance);
			this.copyChecklist(template.id, instance.id);
			return;
		}

		const instance = this.validate("project", {
			...(template as Project),
			...common,
		});
		this.write("project", instance);
		const headingIds = new Map<string, string>();
		for (const heading of this.store.where(
			"heading",
			"project_id = ? AND deleted_at IS NULL",
			template.id,
		)) {
			const copy = {
				...heading,
				id: ulid(),
				createdAt: this.now,
				projectId: instance.id,
			};
			headingIds.set(heading.id, copy.id);
			this.write("heading", copy);
		}
		const todos = this.store.where(
			"todo",
			"project_id = ? AND deleted_at IS NULL AND status = 'open' AND repeat IS NULL",
			template.id,
		);
		for (const todo of todos) {
			const copy = {
				...todo,
				id: ulid(),
				createdAt: this.now,
				projectId: instance.id,
				headingId: todo.headingId
					? (headingIds.get(todo.headingId) ?? null)
					: null,
				todaySortKey: null,
			};
			this.write("todo", copy);
			this.copyChecklist(todo.id, copy.id);
		}
	}

	private copyChecklist(fromTodoId: string, toTodoId: string) {
		for (const item of this.store.where(
			"checklist",
			"todo_id = ? AND deleted_at IS NULL",
			fromTodoId,
		)) {
			this.write("checklist", {
				...item,
				id: ulid(),
				createdAt: this.now,
				todoId: toTodoId,
				done: false,
			});
		}
	}
}
