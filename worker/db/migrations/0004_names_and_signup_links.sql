-- Names, and sign-up by emailed link instead of code (SPEC §8).
--
-- Existing accounts keep working unchanged: their name stays NULL until they
-- set one in Settings, and they count as verified (an account has only ever
-- been created after its email was confirmed).
ALTER TABLE users ADD COLUMN name TEXT;

-- Sign-ups waiting for their emailed link to be opened. The account is
-- created, and its password chosen, on the page the link opens. Only a hash
-- of the link's token is stored. One row per address; asking again replaces
-- the link. pending_signups (codes) is no longer used.
CREATE TABLE signup_links (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tz TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
