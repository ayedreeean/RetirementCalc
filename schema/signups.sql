-- FIREcalc optional email list.
-- Binding name: FIRECALC_SIGNUPS (D1). The Pages Function also runs these
-- CREATE statements on first use, so applying this file is optional.
-- Do not add columns for portfolio, income, or spending. The only plan data
-- is the share URL the person chose to save.
--
--   npx wrangler d1 execute firecalc-signups --remote --file=schema/signups.sql
--
-- Rows are deleted by POST /api/unsubscribe. There is no separate archive.

CREATE TABLE IF NOT EXISTS signups (
    email TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    consent INTEGER NOT NULL,
    consent_text TEXT NOT NULL,
    plan_url TEXT,
    source TEXT,
    unsubscribe_token TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS signup_rate (
    bucket TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    hits INTEGER NOT NULL
);
