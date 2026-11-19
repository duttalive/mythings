-- End-to-end encryption (SPEC §8.5). An encrypted account's to-do text is
-- encrypted on its devices with a data key the server never sees; the server
-- only keeps that key sealed under the password and under the recovery key.

ALTER TABLE users ADD COLUMN encrypted INTEGER NOT NULL DEFAULT 0;

CREATE TABLE user_keys (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  wrapped_by_password TEXT NOT NULL,
  wrapped_by_recovery TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
