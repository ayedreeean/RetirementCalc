-- Consent version, hashed suppression, and the campaign send log.
-- Safe to run more than once on firecalc-signups. It only creates the
-- suppression table. It does not ALTER signups or email_sends, and it does
-- not create the UNIQUE(campaign, email) index: that index is created by
-- mail/schema.js after the campaign column exists.
--
--   npx wrangler d1 execute firecalc-signups --remote --file=schema/email-prefs.sql
--
-- consent_version on signups:
--   2026-10-26.1  older "monthly reminder" rows (ALTER default)
--   2026-10-26.2  current quarterly + January consent sentence
-- The Pages Function writes 2026-10-26.2 on every new or refreshed signup.
--
-- An address in email_suppressions is not mailed. Re-checking the consent
-- box clears reason unsubscribe only. complaint, hard_bounce, and provider
-- stay, including when the person submits the form again.

CREATE TABLE IF NOT EXISTS email_suppressions (
    email_hash TEXT PRIMARY KEY,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL
);
