// SQLite schema inside each user's UserStore Durable Object. Append new
// migrations to the end; never edit one that has shipped.

export const DO_MIGRATIONS: string[] = [
	`
	CREATE TABLE applied_ops (op_id TEXT PRIMARY KEY, rev INTEGER NOT NULL);
	CREATE INDEX idx_applied_ops_rev ON applied_ops(rev);

	-- Permanently deleted rows, so clients can drop them on their next pull.
	CREATE TABLE purged (
		entity TEXT NOT NULL,
		id TEXT NOT NULL,
		rev INTEGER NOT NULL,
		PRIMARY KEY (entity, id)
	);
	CREATE INDEX idx_purged_rev ON purged(rev);

	CREATE TABLE areas (
		id TEXT PRIMARY KEY,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		deleted_at INTEGER,
		rev INTEGER NOT NULL,
		title TEXT NOT NULL,
		sort_key TEXT NOT NULL,
		tag_ids TEXT NOT NULL
	);
	CREATE INDEX idx_areas_rev ON areas(rev);

	CREATE TABLE projects (
		id TEXT PRIMARY KEY,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		deleted_at INTEGER,
		rev INTEGER NOT NULL,
		"when" TEXT NOT NULL,
		start_date TEXT,
		evening INTEGER NOT NULL,
		deadline TEXT,
		title TEXT NOT NULL,
		notes TEXT NOT NULL,
		area_id TEXT,
		status TEXT NOT NULL,
		completed_at INTEGER,
		sort_key TEXT NOT NULL,
		today_sort_key TEXT,
		tag_ids TEXT NOT NULL,
		repeat TEXT,
		repeat_template_id TEXT
	);
	CREATE INDEX idx_projects_rev ON projects(rev);
	CREATE INDEX idx_projects_area ON projects(area_id);
	CREATE INDEX idx_projects_template ON projects(repeat_template_id);

	CREATE TABLE headings (
		id TEXT PRIMARY KEY,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		deleted_at INTEGER,
		rev INTEGER NOT NULL,
		project_id TEXT NOT NULL,
		title TEXT NOT NULL,
		sort_key TEXT NOT NULL,
		archived INTEGER NOT NULL
	);
	CREATE INDEX idx_headings_rev ON headings(rev);
	CREATE INDEX idx_headings_project ON headings(project_id);

	CREATE TABLE todos (
		id TEXT PRIMARY KEY,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		deleted_at INTEGER,
		rev INTEGER NOT NULL,
		"when" TEXT NOT NULL,
		start_date TEXT,
		evening INTEGER NOT NULL,
		deadline TEXT,
		title TEXT NOT NULL,
		notes TEXT NOT NULL,
		status TEXT NOT NULL,
		completed_at INTEGER,
		project_id TEXT,
		heading_id TEXT,
		area_id TEXT,
		reminder_at INTEGER,
		sort_key TEXT NOT NULL,
		today_sort_key TEXT,
		tag_ids TEXT NOT NULL,
		repeat TEXT,
		repeat_template_id TEXT
	);
	CREATE INDEX idx_todos_rev ON todos(rev);
	CREATE INDEX idx_todos_project ON todos(project_id);
	CREATE INDEX idx_todos_heading ON todos(heading_id);
	CREATE INDEX idx_todos_area ON todos(area_id);
	CREATE INDEX idx_todos_template ON todos(repeat_template_id);
	CREATE INDEX idx_todos_reminder ON todos(reminder_at) WHERE reminder_at IS NOT NULL;

	CREATE TABLE checklist_items (
		id TEXT PRIMARY KEY,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		deleted_at INTEGER,
		rev INTEGER NOT NULL,
		todo_id TEXT NOT NULL,
		title TEXT NOT NULL,
		done INTEGER NOT NULL,
		sort_key TEXT NOT NULL
	);
	CREATE INDEX idx_checklist_items_rev ON checklist_items(rev);
	CREATE INDEX idx_checklist_items_todo ON checklist_items(todo_id);

	CREATE TABLE tags (
		id TEXT PRIMARY KEY,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		deleted_at INTEGER,
		rev INTEGER NOT NULL,
		title TEXT NOT NULL,
		parent_id TEXT,
		shortcut TEXT,
		sort_key TEXT NOT NULL
	);
	CREATE INDEX idx_tags_rev ON tags(rev);
	CREATE INDEX idx_tags_parent ON tags(parent_id);
	`,
	`
	-- Reminders already pushed. Keyed by the reminder time too, so moving a
	-- reminder makes it due again.
	CREATE TABLE reminders_sent (
		todo_id TEXT PRIMARY KEY,
		reminder_at INTEGER NOT NULL
	);
	`,
];
