// The client's local copy of the user's data (IndexedDB via Dexie). It is the
// source of truth for rendering; the sync engine reconciles it with the server.

import Dexie, { type Table } from "dexie";
import type {
	Area,
	ChecklistItem,
	EntityName,
	EntityRowMap,
	Heading,
	Op,
	Project,
	Tag,
	Todo,
} from "../../shared/schema";

export type OutboxEntry = {
	seq?: number;
	entity: EntityName;
	entityId: string;
	op: Op;
};

export type MetaEntry = { key: string; value: unknown };

export const ENTITY_TABLES = {
	area: "areas",
	project: "projects",
	heading: "headings",
	todo: "todos",
	checklist: "checklist",
	tag: "tags",
} as const satisfies Record<EntityName, string>;

export class LocalDb extends Dexie {
	areas!: Table<Area, string>;
	projects!: Table<Project, string>;
	headings!: Table<Heading, string>;
	todos!: Table<Todo, string>;
	checklist!: Table<ChecklistItem, string>;
	tags!: Table<Tag, string>;
	outbox!: Table<OutboxEntry, number>;
	meta!: Table<MetaEntry, string>;

	constructor(name: string) {
		super(name);
		this.version(1).stores({
			areas: "id",
			projects: "id, areaId, repeatTemplateId",
			headings: "id, projectId",
			todos: "id, projectId, headingId, areaId, repeatTemplateId",
			checklist: "id, todoId",
			tags: "id, parentId",
			outbox: "++seq, [entity+entityId]",
			meta: "key",
		});
	}

	rows<E extends EntityName>(entity: E): Table<EntityRowMap[E], string> {
		return this[ENTITY_TABLES[entity]] as unknown as Table<
			EntityRowMap[E],
			string
		>;
	}

	/** Every table, for read-write transactions that touch rows and the outbox. */
	get allTables() {
		return [
			this.areas,
			this.projects,
			this.headings,
			this.todos,
			this.checklist,
			this.tags,
			this.outbox,
			this.meta,
		];
	}
}

/** Each user gets their own database, so signing in as someone else never mixes data. */
export function openLocalDb(userId: string): LocalDb {
	return new LocalDb(`mythings-${userId}`);
}
