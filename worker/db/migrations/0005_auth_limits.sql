-- Limits on account emails and sign-in (SPEC §8).

-- Emails sent to an address per kind ('signup', 'reset'): a short cooldown
-- between them and a daily cap, whichever IPs ask. Rows older than a day are
-- cleared out as new ones are written.
CREATE TABLE email_sends (
  email TEXT NOT NULL,
  kind TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  sends INTEGER NOT NULL,
  last_sent_at INTEGER NOT NULL,
  PRIMARY KEY (email, kind)
);

-- Failed sign-ins in a row per email (known or not, so a lock doesn't reveal
-- which emails have accounts). Cleared by a successful sign-in or a reset.
CREATE TABLE login_failures (
  email TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);

-- Sessions also end a fixed time after sign-in, however active. Existing
-- sessions count from when this migration runs.
ALTER TABLE sessions ADD COLUMN created_at INTEGER;
UPDATE sessions SET created_at = CAST(unixepoch('subsec') * 1000 AS INTEGER);
