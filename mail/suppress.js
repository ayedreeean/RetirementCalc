// Hashed suppression list. The hash is SHA-256 of a fixed prefix plus the
// normalized address. The prefix is not a secret; it only stops this digest
// from matching a bare hash of the same inbox published somewhere else.
// Pages signup and the mail worker both compute it. No pepper is stored.

const PREFIX = 'firecalc-suppress-v1:';

export async function emailHash(email) {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(PREFIX + String(email || '').trim().toLowerCase())
    );
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function suppressionReason(db, email) {
    const hash = await emailHash(email);
    const row = await db.prepare('SELECT reason FROM email_suppressions WHERE email_hash = ?').bind(hash).first();
    return row && row.reason ? row.reason : null;
}

export async function suppressAddress(db, email, reason) {
    const hash = await emailHash(email);
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO email_suppressions (email_hash, reason, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(email_hash) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at`
    ).bind(hash, reason, now).run();
}

export async function clearUnsubscribe(db, email) {
    const hash = await emailHash(email);
    await db.prepare(`DELETE FROM email_suppressions WHERE email_hash = ? AND reason = 'unsubscribe'`).bind(hash).run();
}
