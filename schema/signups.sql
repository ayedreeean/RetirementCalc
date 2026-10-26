-- FIREcalc optional email list.
-- Binding name: FIRECALC_SIGNUPS (D1). The Pages Function also runs these
-- CREATE statements on first use, so applying this file is optional.
-- Do not add columns for portfolio, income, or spending. The only plan data
-- is the share URL the person chose to save.
-- wants_quarterly and wants_january are 1 or 0. Existing databases already
-- have this table. CREATE IF NOT EXISTS will not add the new columns there.
-- The signup function and the mail worker ALTER those columns on first use.
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
    unsubscribe_token TEXT NOT NULL,
    wants_quarterly INTEGER NOT NULL DEFAULT 1,
    wants_january INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS signup_rate (
    bucket TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    hits INTEGER NOT NULL
);
