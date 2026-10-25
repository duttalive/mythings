-- Global tables only. Task data lives in each user's UserStore Durable Object.
CREATE TABLE users (
	id TEXT PRIMARY KEY,
	email TEXT UNIQUE NOT NULL,
	password_hash TEXT NOT NULL,
	tz TEXT NOT NULL DEFAULT 'UTC',
	settings TEXT NOT NULL DEFAULT '{}',
	created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL,
	user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE push_subscriptions (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	endpoint TEXT UNIQUE NOT NULL,
	p256dh TEXT NOT NULL,
	auth TEXT NOT NULL,
	created_at INTEGER NOT NULL
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);
