-- Send log and the comparison snapshot for FIREcalc plan mail.
-- The Worker and the Pages signup function also create these on first use.
-- Apply on the existing database firecalc-signups. Do not create a second database.
--
--   npx wrangler d1 execute firecalc-signups --remote --file=schema/email.sql
--
-- status "sent" is the only row that blocks another send for that
-- email + kind + period. dry_run, blocked, and skipped can be replaced later.

CREATE TABLE IF NOT EXISTS email_sends (
    email TEXT NOT NULL,
    kind TEXT NOT NULL,
    period TEXT NOT NULL,
    status TEXT NOT NULL,
    plan_url TEXT,
    detail TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (email, kind, period)
);

CREATE TABLE IF NOT EXISTS plan_snapshots (
    email TEXT PRIMARY KEY,
    plan_url TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    saved_at TEXT NOT NULL
);
