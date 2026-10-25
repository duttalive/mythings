-- Sign-ups waiting for their email to be confirmed (SPEC §8). The account is
-- created only when the emailed code is entered. Only a hash of the code is stored.
CREATE TABLE pending_signups (
  email TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  tz TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
