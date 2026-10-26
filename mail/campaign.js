import { deferralWhatIf, evaluatePlan, snapshotFrom } from './plan.js';
import { yearLimits } from './limits.js';
import { renderJanuary, listHeaders } from './render.js';
import { renderQuarterly } from './render.js';
import { mailFor, postalReady, sendingEnabled } from './schedule.js';
import { ensureMailSchema } from './schema.js';

export { ensureMailSchema };

const BATCH = 25;

export function compose(row, decision, { postal, prior } = {}) {
    const plan = evaluatePlan(row.plan_url);
    if (!plan.ok) return { ok: false, status: 'skipped', detail: plan.reason, plan: null };
    const token = row.unsubscribe_token;
    if (decision.kind === 'january') {
        const limits = yearLimits(decision.year);
        const whatIf = limits.row && limits.row.deferral401k != null
            ? deferralWhatIf(row.plan_url, limits.row.deferral401k)
            : null;
        const message = renderJanuary({
            plan, planUrl: row.plan_url, token, postal, year: decision.year, prior, whatIf
        });
        return {
            ok: true,
            status: message.sendable ? 'ready' : 'blocked',
            detail: message.sendable ? null : `missing ${message.missing.join(', ')}`,
            plan,
            message,
            headers: listHeaders(token)
        };
    }
    const message = renderQuarterly({
        plan, planUrl: row.plan_url, token, postal, prior, period: decision.period
    });
    return { ok: true, status: 'ready', detail: null, plan, message, headers: listHeaders(token) };
}

async function alreadySent(db, email, kind, period) {
    const row = await db.prepare(
        'SELECT status FROM email_sends WHERE email = ? AND kind = ? AND period = ?'
    ).bind(email, kind, period).first();
    return row && row.status === 'sent';
}

export async function recordSend(db, { email, kind, period, status, planUrl, detail }) {
    const now = new Date().toISOString();
    try {
        await db.prepare(`INSERT INTO email_sends (email, kind, period, status, plan_url, detail, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(email, kind, period) DO UPDATE SET
                status = excluded.status,
                plan_url = excluded.plan_url,
                detail = excluded.detail,
                created_at = excluded.created_at
            WHERE email_sends.status != 'sent'`).bind(
            email, kind, period, status, planUrl || null, detail || null, now
        ).run();
    } catch (err) {
        if (!/UNIQUE/i.test(String(err && err.message || err))) throw err;
    }
}

async function priorSnapshot(db, email) {
    const row = await db.prepare('SELECT summary_json FROM plan_snapshots WHERE email = ?').bind(email).first();
    if (!row || !row.summary_json) return null;
    try { return JSON.parse(row.summary_json); }
    catch { return null; }
}

async function saveSnapshot(db, email, plan, planUrl) {
    const summary = snapshotFrom(plan);
    if (!summary) return;
    const json = JSON.stringify(summary);
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO plan_snapshots (email, plan_url, summary_json, saved_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET plan_url = excluded.plan_url, summary_json = excluded.summary_json, saved_at = excluded.saved_at`
    ).bind(email, planUrl, json, now).run();
}

export async function runCampaign(db, env, options = {}) {
    await ensureMailSchema(db);
    const now = options.now || new Date();
    const force = !!options.force;
    const postal = env.MAIL_POSTAL_ADDRESS || '';
    const live = options.live != null ? options.live : sendingEnabled(env);
    const addressReady = postalReady(postal);
    const batch = options.batch || BATCH;
    const rows = (await db.prepare(
        'SELECT email, plan_url, unsubscribe_token, wants_quarterly, wants_january FROM signups'
    ).all()).results || [];
    const summary = { considered: 0, sent: 0, dryRun: 0, blocked: 0, skipped: 0, already: 0 };
    for (const row of rows) {
        if (summary.considered >= batch) break;
        const decision = mailFor(now, {
            quarterly: row.wants_quarterly !== 0,
            january: row.wants_january !== 0
        }, { force });
        if (options.kind) {
            if (!decision || decision.kind !== options.kind) continue;
        }
        if (!decision) continue;
        if (await alreadySent(db, row.email, decision.kind, decision.period)) {
            summary.already += 1;
            continue;
        }
        summary.considered += 1;
        const prior = await priorSnapshot(db, row.email);
        const built = compose(row, decision, { postal, prior });
        if (!built.ok) {
            summary.skipped += 1;
            await recordSend(db, {
                email: row.email, kind: decision.kind, period: decision.period,
                status: 'skipped', planUrl: row.plan_url, detail: built.detail
            });
            continue;
        }
        if (built.status === 'blocked') {
            summary.blocked += 1;
            await recordSend(db, {
                email: row.email, kind: decision.kind, period: decision.period,
                status: 'blocked', planUrl: row.plan_url, detail: built.detail
            });
            console.error(JSON.stringify({ event: 'mail-blocked', kind: decision.kind, period: decision.period, detail: built.detail }));
            continue;
        }
        if (!live) {
            summary.dryRun += 1;
            await recordSend(db, {
                email: row.email, kind: decision.kind, period: decision.period,
                status: 'dry_run', planUrl: row.plan_url, detail: 'dry run'
            });
            if (options.capture) options.capture.push({ email: row.email, ...built, decision });
            continue;
        }
        if (!addressReady) {
            summary.blocked += 1;
            await recordSend(db, {
                email: row.email, kind: decision.kind, period: decision.period,
                status: 'blocked', planUrl: row.plan_url, detail: 'postal address is still the placeholder'
            });
            console.error(JSON.stringify({ event: 'mail-blocked', kind: decision.kind, period: decision.period, detail: 'postal address' }));
            continue;
        }
        try {
            await env.EMAIL.send({
                from: { email: env.MAIL_FROM || 'updates@firecalc.ai', name: env.MAIL_FROM_NAME || 'FIREcalc' },
                to: row.email,
                subject: built.message.subject,
                html: built.message.html,
                text: built.message.text,
                headers: built.headers
            });
        } catch (err) {
            summary.blocked += 1;
            const code = err && err.code ? String(err.code) : 'send failed';
            await recordSend(db, {
                email: row.email, kind: decision.kind, period: decision.period,
                status: 'blocked', planUrl: row.plan_url, detail: code
            });
            console.error(JSON.stringify({ event: 'mail-send-failed', kind: decision.kind, period: decision.period, code }));
            continue;
        }
        await recordSend(db, {
            email: row.email, kind: decision.kind, period: decision.period,
            status: 'sent', planUrl: row.plan_url, detail: null
        });
        await saveSnapshot(db, row.email, built.plan, row.plan_url);
        summary.sent += 1;
    }
    return summary;
}

export function previewOne({ planUrl, kind, year, postal, token, prior }) {
    const row = {
        plan_url: planUrl,
        unsubscribe_token: token || 'a'.repeat(64),
        email: 'preview@example.com'
    };
    const decision = kind === 'january'
        ? { kind: 'january', period: String(year), year }
        : { kind: 'quarterly', period: `${year}-Q1`, year };
    return compose(row, decision, { postal, prior });
}
