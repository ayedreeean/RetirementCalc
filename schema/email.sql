-- Send log and the comparison snapshot for FIREcalc plan mail.
-- The Worker and the Pages signup function also create these on first use.
-- Apply on the existing database firecalc-signups. Do not create a second database.
--
--   npx wrangler d1 execute firecalc-signups --remote --file=schema/email.sql
--
-- status "sent" or "suppressed" blocks another send for that
-- email + kind + period. dry_run, blocked, and skipped can be replaced later.
-- campaign is kind:period (for example quarterly:2026-Q2). The worker adds
-- that column on an existing table, then creates UNIQUE(campaign, email).
-- Those two statements are not in this file: CREATE IF NOT EXISTS will not
-- add a column, and a UNIQUE index on a missing column would fail.
--
-- email_suppressions stores SHA-256(prefix || address), never the address.
-- reason is unsubscribe, complaint, hard_bounce, or provider.
-- A later signup clears only reason unsubscribe, and only with the current
-- consent checkbox. complaint, hard_bounce, and provider stay.

CREATE TABLE IF NOT EXISTS email_sends (
    email TEXT NOT NULL,
    kind TEXT NOT NULL,
    period TEXT NOT NULL,
    status TEXT NOT NULL,
    plan_url TEXT,
    detail TEXT,
    created_at TEXT NOT NULL,
    campaign TEXT,
    PRIMARY KEY (email, kind, period)
);

CREATE TABLE IF NOT EXISTS plan_snapshots (
    email TEXT PRIMARY KEY,
    plan_url TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    saved_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_suppressions (
    email_hash TEXT PRIMARY KEY,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
);
