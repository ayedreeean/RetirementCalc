-- FIREcalc optional email list.
-- Binding name: FIRECALC_SIGNUPS (D1). The Pages Function also runs these
-- CREATE statements on first use, so applying this file is optional.
-- Do not add columns for portfolio, income, or spending. The only plan data
-- is the share URL the person chose to save.
-- wants_quarterly and wants_january are 1 or 0. consent_version records
-- which consent sentence the person agreed to. New signups write
-- 2026-10-26.2. The ALTER default is 2026-10-26.1 so rows saved under the
-- older monthly sentence keep that version.
-- Existing databases already have this table. CREATE IF NOT EXISTS will not
-- add the new columns there. The signup function and the mail worker ALTER
-- those columns on first use. This file does not ALTER, so it is safe to
-- re-run and it will not fail on a duplicate column.
--
--   npx wrangler d1 execute firecalc-signups --remote --file=schema/signups.sql
--
-- Unsubscribe deletes the signup row and stores a hash in email_suppressions.
-- The hash is not removed by this file.

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
    wants_january INTEGER NOT NULL DEFAULT 1,
    consent_version TEXT NOT NULL DEFAULT '2026-10-26.1'
);

CREATE TABLE IF NOT EXISTS signup_rate (
    bucket TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    hits INTEGER NOT NULL
);
