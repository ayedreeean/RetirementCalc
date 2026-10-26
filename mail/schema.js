// Tables for the opt-in list and the sender. No calculator imports in this file.
export async function ensureMailSchema(db) {
    await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS signups (
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
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS signup_rate (
            bucket TEXT PRIMARY KEY,
            window_start INTEGER NOT NULL,
            hits INTEGER NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS email_sends (
            email TEXT NOT NULL,
            kind TEXT NOT NULL,
            period TEXT NOT NULL,
            status TEXT NOT NULL,
            plan_url TEXT,
            detail TEXT,
            created_at TEXT NOT NULL,
            PRIMARY KEY (email, kind, period)
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS plan_snapshots (
            email TEXT PRIMARY KEY,
            plan_url TEXT NOT NULL,
            summary_json TEXT NOT NULL,
            saved_at TEXT NOT NULL
        )`)
    ]);
    for (const sql of [
        'ALTER TABLE signups ADD COLUMN wants_quarterly INTEGER NOT NULL DEFAULT 1',
        'ALTER TABLE signups ADD COLUMN wants_january INTEGER NOT NULL DEFAULT 1'
    ]) {
        try { await db.prepare(sql).run(); }
        catch (err) {
            if (!/duplicate column/i.test(String(err && err.message || err))) throw err;
        }
    }
}

export async function deleteSubscriber(db, email) {
    await db.prepare('DELETE FROM email_sends WHERE email = ?').bind(email).run();
    await db.prepare('DELETE FROM plan_snapshots WHERE email = ?').bind(email).run();
    await db.prepare('DELETE FROM signups WHERE email = ?').bind(email).run();
}
