import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { previewOne, runCampaign } from './campaign.js';
import { applyDeliveryEvent, deliverySuppressionReason } from './delivery.js';
import { ensureMailSchema } from './schema.js';
import { yearLimits } from './limits.js';
import { deferralWhatIf, evaluatePlan } from './plan.js';
import { firstWeekday, inSendWindow, mailFor, postalReady, sendBlockers, sendingEnabled } from './schedule.js';
import { emailHash, suppressAddress } from './suppress.js';
import worker from '../workers/firecalc-mail/src/index.js';

const SAMPLE = 'https://firecalc.ai/?tab=accumulation&currentAge=42&currentSavings=350000&income=120000&expenses=60000&targetAmount=1500000&stockAllocation=70&incomeGrowth=2&savingsSimulationCount=1000&savingsReturnMode=shuffled&seed=246813';
const LOW = 'https://firecalc.ai/?tab=accumulation&currentAge=42&currentSavings=200000&income=100000&expenses=85000&targetAmount=1500000&stockAllocation=70&incomeGrowth=2&savingsSimulationCount=200&savingsReturnMode=shuffled&seed=246813';
const RETIRE = 'https://firecalc.ai/?tab=retirement&retirementAge=65&retirementSavings=1000000&annualWithdrawal=40000&retirementStockAllocation=50&taxRate=0&retirementLifeExpectancy=30&simulationCount=100&retirementReturnMode=shuffled&seed=246813';

function d1() {
    const db = new DatabaseSync(':memory:');
    return {
        prepare(sql) {
            const stmt = db.prepare(sql);
            const methods = (args) => ({
                run: async () => {
                    const info = args ? stmt.run(...args) : stmt.run();
                    return { meta: { changes: info.changes } };
                },
                first: async () => (args ? stmt.get(...args) : stmt.get()) || null,
                all: async () => ({ results: args ? stmt.all(...args) : stmt.all() })
            });
            return { ...methods(null), bind(...args) { return methods(args); } };
        },
        async batch(stmts) {
            for (const stmt of stmts) await stmt.run();
        },
        raw: db
    };
}

async function addSignup(db, { email, planUrl, quarterly = 1, january = 1 }) {
    await ensureMailSchema(db);
    await db.prepare(`INSERT INTO signups
        (email, created_at, updated_at, consent, consent_text, plan_url, source, unsubscribe_token, wants_quarterly, wants_january)
        VALUES (?, ?, ?, 1, 'yes', ?, 'calculator', ?, ?, ?)`).bind(
        email, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', planUrl, 'ab'.repeat(32), quarterly, january
    ).run();
}

test('2026 limits are complete and 2027 leaves the unannounced fields empty', () => {
    const y2026 = yearLimits(2026);
    const y2027 = yearLimits(2027);
    assert.equal(y2026.complete, true);
    assert.equal(y2026.row.deferral401k, 24500);
    assert.equal(y2026.row.ira, 7500);
    assert.equal(y2026.row.hsaSelf, 4400);
    assert.equal(y2026.row.ssCola, 2.8);
    assert.equal(y2027.complete, false);
    assert.equal(y2027.row.deferral401k, null);
    assert.equal(y2027.row.catchUp50, null);
    assert.equal(y2027.row.catchUp60, null);
    assert.equal(y2027.row.ira, null);
    assert.equal(y2027.row.hsaSelf, 4500);
    assert.equal(y2027.row.hsaFamily, 9000);
    assert.equal(y2027.row.ssCola, 3.6);
    assert.equal(y2027.row.ssWageBase, 192300);
    assert.match(y2027.todo, /TODO/);
    assert.match(y2027.row.sources.hsaSelf, /rp-26-24/);
});

test('the schedule is the first weekday of Jan, Apr, Jul, and Oct', () => {
    assert.equal(firstWeekday(2026, 0), 1);
    assert.equal(firstWeekday(2028, 0), 3);
    assert.equal(inSendWindow(new Date(Date.UTC(2028, 0, 1))), false);
    assert.equal(inSendWindow(new Date(Date.UTC(2028, 0, 3))), true);
    assert.equal(inSendWindow(new Date(Date.UTC(2026, 3, 8))), false);
    assert.equal(inSendWindow(new Date(Date.UTC(2026, 5, 1))), false);
    const jan = mailFor(new Date(Date.UTC(2027, 0, 4)), { quarterly: true, january: true });
    assert.deepEqual(jan, { kind: 'january', period: '2027', year: 2027 });
    const onlyQuarter = mailFor(new Date(Date.UTC(2027, 0, 4)), { quarterly: true, january: false });
    assert.equal(onlyQuarter.kind, 'quarterly');
    assert.equal(onlyQuarter.period, '2027-Q1');
    const april = mailFor(new Date(Date.UTC(2026, 3, 1)), { quarterly: true, january: true });
    assert.equal(april.kind, 'quarterly');
    assert.equal(april.period, '2026-Q2');
    assert.equal(mailFor(new Date(Date.UTC(2026, 3, 1)), { quarterly: false, january: true }), null);
    assert.equal(postalReady('POSTAL ADDRESS NEEDED'), false);
    assert.equal(postalReady('   '), false);
    assert.equal(postalReady('1 Market St, San Francisco, CA 94105'), true);
    assert.equal(sendingEnabled({ DRY_RUN: 'true' }), false);
    assert.equal(sendingEnabled({ DRY_RUN: 'false' }), true);
    assert.equal(sendingEnabled({ DRY_RUN: false }), false);
    assert.deepEqual(sendBlockers({ DRY_RUN: 'true', MAIL_POSTAL_ADDRESS: 'POSTAL ADDRESS NEEDED' }), ['DRY_RUN', 'POSTAL_ADDRESS']);
    assert.deepEqual(sendBlockers({ DRY_RUN: 'false', MAIL_POSTAL_ADDRESS: '' }), ['POSTAL_ADDRESS']);
    assert.deepEqual(sendBlockers({ DRY_RUN: 'false', POSTAL_ADDRESS: '1 Market St, San Francisco, CA 94105' }), []);
    assert.deepEqual(sendBlockers({ DRY_RUN: false, MAIL_POSTAL_ADDRESS: '1 Market St, San Francisco, CA 94105' }), ['DRY_RUN']);
});

test('a sample savings link renders both emails from the engine', () => {
    const plan = evaluatePlan(SAMPLE);
    assert.equal(plan.ok, true);
    assert.equal(plan.savings, 350000);
    assert.equal(plan.target, 1500000);
    assert.equal(plan.contribution, 60000);
    assert.equal(plan.pathCount, 1000);
    assert.ok(plan.median != null);

    const quarterly = previewOne({ planUrl: SAMPLE, kind: 'quarterly', year: 2026, postal: 'POSTAL ADDRESS NEEDED' });
    assert.equal(quarterly.status, 'ready');
    assert.match(quarterly.message.html, /\$350,000/);
    assert.match(quarterly.message.html, /\$1,500,000/);
    assert.match(quarterly.message.html, /Update my numbers/);
    assert.match(quarterly.message.html, new RegExp(plan.median));
    assert.doesNotMatch(quarterly.message.html, /SAMPLE|EXAMPLE DATA/);
    assert.match(quarterly.message.html, /POSTAL ADDRESS NEEDED/);
    assert.equal(quarterly.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.match(quarterly.headers['List-Unsubscribe'], /^<https:\/\/firecalc\.ai\/api\/unsubscribe\?token=[a-f]{64}>$/);

    const january = previewOne({ planUrl: SAMPLE, kind: 'january', year: 2027, postal: '1 Market St, San Francisco, CA 94105' });
    assert.equal(january.message.sendable, false);
    assert.equal(january.status, 'blocked');
    assert.match(january.message.subject, /\[held\]/);
    assert.match(january.message.html, /PLACEHOLDER/);
    assert.match(january.message.html, /\$4,500/);
    assert.match(january.message.html, /\$9,000/);
    assert.match(january.message.html, /3\.6%/);
    assert.match(january.message.html, /\$192,300/);
    assert.doesNotMatch(january.message.html, /At the deferral limit/);
    assert.match(january.message.html, /1 Market St, San Francisco, CA 94105/);

    const ready = previewOne({ planUrl: SAMPLE, kind: 'january', year: 2026 });
    assert.equal(ready.message.sendable, true);
    assert.match(ready.message.html, /\$24,500/);
    assert.match(ready.message.html, /The current year is filled/);
    assert.doesNotMatch(ready.message.html, /This January email is held/);
});

test('the deferral what-if runs only when the saved contribution is under the limit', () => {
    assert.equal(deferralWhatIf(SAMPLE, 24500), null);
    const whatIf = deferralWhatIf(LOW, 24500);
    assert.equal(whatIf.contribution, 15000);
    assert.equal(whatIf.gap, 9500);
    assert.equal(whatIf.after.contribution, 24500);
    assert.ok(whatIf.after.median != null);
    const mail = previewOne({ planUrl: LOW, kind: 'january', year: 2026 });
    assert.match(mail.message.html, /At the deferral limit/);
    assert.match(mail.message.html, /\$9,500/);
});

test('a retirement link uses the success count and does not invent a balance', () => {
    const built = previewOne({ planUrl: RETIRE, kind: 'quarterly', year: 2026 });
    assert.equal(built.ok, true);
    assert.match(built.message.html, /\$1,000,000/);
    assert.match(built.message.html, /\$40,000/);
    assert.match(built.message.html, new RegExp(`${built.plan.successes} of`));
    assert.doesNotMatch(built.message.html, /Last email/);
});

test('dry-run records a row and does not send; a live send happens once', async () => {
    const db = d1();
    await addSignup(db, { email: 'a@example.com', planUrl: LOW });
    const calls = [];
    const env = {
        DRY_RUN: 'true',
        MAIL_POSTAL_ADDRESS: 'POSTAL ADDRESS NEEDED',
        EMAIL: { send: async (msg) => { calls.push(msg); return { messageId: 'x' }; } }
    };
    const now = new Date(Date.UTC(2026, 3, 1, 15));
    const first = await runCampaign(db, env, { now });
    assert.equal(first.blocked, 1);
    assert.equal(first.dryRun, 0);
    assert.equal(first.sent, 0);
    assert.equal(calls.length, 0);
    const blockedRow = await db.prepare('SELECT status, detail FROM email_sends WHERE email = ?').bind('a@example.com').first();
    assert.equal(blockedRow.status, 'blocked');
    assert.equal(blockedRow.detail, 'POSTAL_ADDRESS');

    env.MAIL_POSTAL_ADDRESS = '1 Market St, San Francisco, CA 94105';
    const dry = await runCampaign(db, env, { now });
    assert.equal(dry.dryRun, 1);
    assert.equal(dry.sent, 0);
    assert.equal(calls.length, 0);
    const row = await db.prepare('SELECT status FROM email_sends WHERE email = ?').bind('a@example.com').first();
    assert.equal(row.status, 'dry_run');
    const snap = await db.prepare('SELECT email FROM plan_snapshots WHERE email = ?').bind('a@example.com').first();
    assert.equal(snap, null);

    env.DRY_RUN = 'false';
    const live = await runCampaign(db, env, { now });
    assert.equal(live.sent, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, 'a@example.com');
    assert.match(calls[0].headers['List-Unsubscribe'], /api\/unsubscribe\?token=/);
    const again = await runCampaign(db, env, { now });
    assert.equal(again.sent, 0);
    assert.equal(again.already, 1);
    assert.equal(calls.length, 1);
    const saved = await db.prepare('SELECT summary_json FROM plan_snapshots WHERE email = ?').bind('a@example.com').first();
    assert.match(saved.summary_json, /200000/);
    const campaign = await db.prepare('SELECT campaign, status FROM email_sends WHERE email = ?').bind('a@example.com').first();
    assert.equal(campaign.status, 'sent');
    assert.equal(campaign.campaign, 'quarterly:2026-Q2');
});

test('an incomplete January is blocked and does not call send', async () => {
    const db = d1();
    await addSignup(db, { email: 'b@example.com', planUrl: SAMPLE });
    const calls = [];
    const env = {
        DRY_RUN: 'false',
        MAIL_POSTAL_ADDRESS: '1 Market St, San Francisco, CA 94105',
        EMAIL: { send: async (msg) => { calls.push(msg); } }
    };
    const errors = [];
    const original = console.error;
    console.error = (line) => errors.push(String(line));
    try {
        const summary = await runCampaign(db, env, { now: new Date(Date.UTC(2027, 0, 4, 15)) });
        assert.equal(summary.blocked, 1);
        assert.equal(summary.sent, 0);
        assert.equal(calls.length, 0);
    } finally {
        console.error = original;
    }
    assert.ok(errors.some(line => line.includes('mail-blocked') && line.includes('2027')));
    const row = await db.prepare('SELECT status, detail FROM email_sends WHERE email = ?').bind('b@example.com').first();
    assert.equal(row.status, 'blocked');
    assert.match(row.detail, /deferral401k/);
});

test('dry-run writes both emails for the sample subscriber', () => {
    const dir = mkdtempSync(join(tmpdir(), 'firecalc-mail-'));
    const result = spawnSync(process.execPath, ['mail/dry-run.mjs'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: { ...process.env, OUT_DIR: dir, YEAR: '2027' },
        encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    const quarterly = readFileSync(join(dir, 'quarterly.html'), 'utf8');
    const january = readFileSync(join(dir, 'january.html'), 'utf8');
    assert.match(quarterly, /\$350,000/);
    assert.match(quarterly, /Update my numbers/);
    assert.match(january, /PLACEHOLDER/);
    assert.match(january, /\$4,500/);
    assert.doesNotMatch(quarterly + january, /SAMPLE|EXAMPLE DATA/);
});

test('the worker health check does not simulate, and admin routes require a token', async () => {
    const health = await worker.fetch(new Request('https://mail.example/health'), { DRY_RUN: 'true' });
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.service, 'firecalc-mail');
    assert.equal(healthBody.dryRun, true);
    assert.equal(JSON.stringify(healthBody).includes('350'), false);

    const missing = await worker.fetch(new Request('https://mail.example/admin/dry-run', { method: 'POST', body: '{}' }), {});
    assert.equal(missing.status, 503);
    const denied = await worker.fetch(new Request('https://mail.example/admin/run', {
        method: 'POST',
        headers: { authorization: 'Bearer nope' },
        body: '{}'
    }), { ADMIN_TOKEN: 'secret-token' });
    assert.equal(denied.status, 401);
    const absent = await worker.fetch(new Request('https://mail.example/simulate'), { ADMIN_TOKEN: 'secret-token' });
    assert.equal(absent.status, 404);

    const preview = await worker.fetch(new Request('https://mail.example/admin/dry-run', {
        method: 'POST',
        headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
        body: JSON.stringify({ planUrl: LOW, kind: 'quarterly', year: 2026 })
    }), { ADMIN_TOKEN: 'secret-token', DRY_RUN: 'true', MAIL_POSTAL_ADDRESS: 'POSTAL ADDRESS NEEDED' });
    assert.equal(preview.status, 200);
    const previewBody = await preview.json();
    assert.match(previewBody.html, /\$200,000/);
    assert.equal(previewBody.sendable, true);

    const calls = [];
    const env = {
        ADMIN_TOKEN: 'secret-token',
        DRY_RUN: 'true',
        MAIL_POSTAL_ADDRESS: 'POSTAL ADDRESS NEEDED',
        EMAIL: { send: async (msg) => { calls.push(msg); return { messageId: 't' }; } }
    };
    const refused = await worker.fetch(new Request('https://mail.example/admin/test-send', {
        method: 'POST',
        headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
        body: JSON.stringify({ to: 'Adrian@Example.com', planUrl: SAMPLE, kind: 'january', year: 2027 })
    }), env);
    assert.equal(refused.status, 409);
    assert.deepEqual((await refused.json()).blocked, ['POSTAL_ADDRESS']);
    assert.equal(calls.length, 0);

    env.MAIL_POSTAL_ADDRESS = '1 Market St, San Francisco, CA 94105';
    const sent = await worker.fetch(new Request('https://mail.example/admin/test-send', {
        method: 'POST',
        headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' },
        body: JSON.stringify({ to: 'Adrian@Example.com', planUrl: SAMPLE, kind: 'january', year: 2027 })
    }), env);
    assert.equal(sent.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, 'adrian@example.com');
    assert.match(calls[0].subject, /\[held\]/);
});

test('a suppressed address is not mailed again, including after the row is put back', async () => {
    const db = d1();
    await addSignup(db, { email: 'c@example.com', planUrl: LOW });
    await suppressAddress(db, 'c@example.com', 'unsubscribe');
    const calls = [];
    const env = {
        DRY_RUN: 'false',
        MAIL_POSTAL_ADDRESS: '1 Market St, San Francisco, CA 94105',
        EMAIL: { send: async (msg) => { calls.push(msg); return { messageId: 's' }; } }
    };
    const now = new Date(Date.UTC(2026, 3, 1, 15));
    const first = await runCampaign(db, env, { now });
    assert.equal(first.sent, 0);
    assert.equal(calls.length, 0);
    const row = await db.prepare('SELECT status, detail, campaign FROM email_sends WHERE email = ?').bind('c@example.com').first();
    assert.equal(row.status, 'suppressed');
    assert.equal(row.detail, 'suppressed');
    assert.equal(row.campaign, 'quarterly:2026-Q2');
    const again = await runCampaign(db, env, { now });
    assert.equal(again.already, 1);
    assert.equal(again.sent, 0);
    assert.equal(calls.length, 0);
});

test('a provider suppression sticks when Email Service rejects the recipient', async () => {
    const db = d1();
    await addSignup(db, { email: 'd@example.com', planUrl: LOW });
    let calls = 0;
    const env = {
        DRY_RUN: 'false',
        MAIL_POSTAL_ADDRESS: '1 Market St, San Francisco, CA 94105',
        EMAIL: {
            send: async () => {
                calls += 1;
                const err = new Error('suppressed');
                err.code = 'E_RECIPIENT_SUPPRESSED';
                throw err;
            }
        }
    };
    const now = new Date(Date.UTC(2026, 3, 1, 15));
    const first = await runCampaign(db, env, { now });
    assert.equal(first.sent, 0);
    assert.equal(first.blocked, 1);
    assert.equal(calls, 1);
    const hash = await emailHash('d@example.com');
    const held = await db.prepare('SELECT reason FROM email_suppressions WHERE email_hash = ?').bind(hash).first();
    assert.equal(held.reason, 'provider');
    const second = await runCampaign(db, env, { now });
    assert.equal(second.already, 1);
    assert.equal(calls, 1);
});

test('complaints and hard bounces suppress, and a soft bounce does not', async () => {
    assert.equal(deliverySuppressionReason({
        type: 'cf.email.sending.message.complained',
        payload: { recipient: 'a@example.com' }
    }), 'complaint');
    assert.equal(deliverySuppressionReason({
        type: 'cf.email.sending.message.bounced',
        payload: { bounce: { type: 'hard' }, recipient: 'a@example.com' }
    }), 'hard_bounce');
    assert.equal(deliverySuppressionReason({
        type: 'cf.email.sending.message.bounced',
        payload: { bounce: { type: 'soft' }, recipient: 'a@example.com' }
    }), null);
    assert.equal(deliverySuppressionReason({
        type: 'cf.email.sending.message.deferred',
        payload: { recipient: 'a@example.com' }
    }), null);

    const db = d1();
    await addSignup(db, { email: 'e@example.com', planUrl: LOW });
    const reason = await applyDeliveryEvent(db, {
        type: 'cf.email.sending.message.complained',
        payload: { recipient: 'E@Example.com' }
    });
    assert.equal(reason, 'complaint');
    assert.equal(await db.prepare('SELECT email FROM signups WHERE email = ?').bind('e@example.com').first(), null);
    const hash = await emailHash('e@example.com');
    assert.equal((await db.prepare('SELECT reason FROM email_suppressions WHERE email_hash = ?').bind(hash).first()).reason, 'complaint');

    await addSignup(db, { email: 'e@example.com', planUrl: LOW });
    const calls = [];
    const summary = await runCampaign(db, {
        DRY_RUN: 'false',
        MAIL_POSTAL_ADDRESS: '1 Market St, San Francisco, CA 94105',
        EMAIL: { send: async (msg) => { calls.push(msg); } }
    }, { now: new Date(Date.UTC(2026, 3, 1, 15)) });
    assert.equal(summary.sent, 0);
    assert.equal(calls.length, 0);

    const soft = await applyDeliveryEvent(db, {
        type: 'cf.email.sending.message.bounced',
        payload: { bounce: { type: 'soft' }, recipient: 'e@example.com' }
    });
    assert.equal(soft, null);
    assert.equal((await db.prepare('SELECT reason FROM email_suppressions WHERE email_hash = ?').bind(hash).first()).reason, 'complaint');
});

test('the queue handler records a hard bounce and ignores a soft bounce', async () => {
    const db = d1();
    await addSignup(db, { email: 'q@example.com', planUrl: LOW });
    const acked = [];
    await worker.queue({
        messages: [
            {
                body: {
                    type: 'cf.email.sending.message.bounced',
                    payload: { bounce: { type: 'hard' }, recipient: 'q@example.com' }
                },
                ack() { acked.push('hard'); },
                retry() { acked.push('retry-hard'); }
            },
            {
                body: {
                    type: 'cf.email.sending.message.bounced',
                    payload: { bounce: { type: 'soft' }, recipient: 'q@example.com' }
                },
                ack() { acked.push('soft'); },
                retry() { acked.push('retry-soft'); }
            }
        ]
    }, { FIRECALC_SIGNUPS: db });
    assert.deepEqual(acked, ['hard', 'soft']);
    assert.equal(await db.prepare('SELECT email FROM signups WHERE email = ?').bind('q@example.com').first(), null);
    const hash = await emailHash('q@example.com');
    assert.equal((await db.prepare('SELECT reason FROM email_suppressions WHERE email_hash = ?').bind(hash).first()).reason, 'hard_bounce');
});
