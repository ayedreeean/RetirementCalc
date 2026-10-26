import assert from 'node:assert/strict';
import test from 'node:test';
import { emailHash, suppressAddress, suppressionReason } from '../../mail/suppress.js';
import { CONSENT_TEXT, CONSENT_VERSION, HOUR_LIMIT, handleSignup, handleUnsubscribe, normalizePlanUrl } from './signup.js';

function memoryDb() {
    const signups = new Map();
    const rates = new Map();
    const sends = new Map();
    const snapshots = new Map();
    const suppressions = new Map();
    function exec(sql, args) {
        const s = sql.replace(/\s+/g, ' ').trim();
        if (s.startsWith('CREATE ')) return { meta: { changes: 0 } };
        if (s.startsWith('ALTER TABLE')) return { meta: { changes: 0 } };
        if (s.startsWith('DELETE FROM signup_rate')) {
            let n = 0;
            for (const [key, row] of rates) {
                if (row.window_start < args[0]) { rates.delete(key); n++; }
            }
            return { meta: { changes: n } };
        }
        if (s.startsWith('INSERT INTO signup_rate')) {
            const [bucket, window_start] = args;
            const row = rates.get(bucket);
            if (row) row.hits += 1;
            else rates.set(bucket, { window_start, hits: 1 });
            return { meta: { changes: 1 } };
        }
        if (s.startsWith('SELECT hits FROM signup_rate')) {
            return rates.get(args[0]) || null;
        }
        if (s.startsWith('INSERT INTO signups')) {
            const [email, created_at, updated_at, consent_text, plan_url, source, token, wants_quarterly, wants_january, consent_version] = args;
            const prev = signups.get(email);
            if (prev) {
                signups.set(email, {
                    ...prev, updated_at, consent: 1, consent_text, plan_url, source,
                    wants_quarterly, wants_january, consent_version
                });
            } else {
                signups.set(email, {
                    email, created_at, updated_at, consent: 1, consent_text, plan_url, source,
                    unsubscribe_token: token, wants_quarterly, wants_january, consent_version
                });
            }
            return { meta: { changes: 1 } };
        }
        if (s.startsWith('INSERT INTO email_suppressions')) {
            const [email_hash, reason, created_at] = args;
            suppressions.set(email_hash, { email_hash, reason, created_at });
            return { meta: { changes: 1 } };
        }
        if (s.startsWith('SELECT reason FROM email_suppressions')) {
            return suppressions.get(args[0]) || null;
        }
        if (s.startsWith('DELETE FROM email_suppressions')) {
            const row = suppressions.get(args[0]);
            if (row && row.reason === 'unsubscribe') {
                suppressions.delete(args[0]);
                return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
        }
        if (s.startsWith('SELECT email FROM signups WHERE unsubscribe_token')) {
            for (const row of signups.values()) {
                if (row.unsubscribe_token === args[0]) return row;
            }
            return null;
        }
        if (s.startsWith('DELETE FROM email_sends')) {
            return { meta: { changes: sends.delete(args[0]) ? 1 : 0 } };
        }
        if (s.startsWith('DELETE FROM plan_snapshots')) {
            return { meta: { changes: snapshots.delete(args[0]) ? 1 : 0 } };
        }
        if (s.startsWith('DELETE FROM signups WHERE email')) {
            return { meta: { changes: signups.delete(args[0]) ? 1 : 0 } };
        }
        throw new Error(`unexpected sql: ${s}`);
    }
    return {
        signups,
        sends,
        snapshots,
        suppressions,
        prepare(sql) {
            return {
                bind(...args) {
                    return {
                        run: async () => exec(sql, args),
                        first: async () => {
                            const row = exec(sql, args);
                            return row && row.meta ? null : row;
                        }
                    };
                },
                run: async () => exec(sql, [])
            };
        },
        async batch(stmts) {
            for (const stmt of stmts) await stmt.run();
        }
    };
}

function post(url, body, { ip = '203.0.113.10', headers = {}, json = true } = {}) {
    const extra = {
        origin: 'https://firecalc.ai',
        'cf-connecting-ip': ip,
        ...headers
    };
    if (json) {
        return new Request(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json', ...extra },
            body: JSON.stringify(body)
        });
    }
    return new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', ...extra },
        body: new URLSearchParams(body).toString()
    });
}

const PLAN = 'https://firecalc.ai/?tab=accumulation&currentAge=38&currentSavings=220000&income=110000&expenses=72000&targetAmount=1800000&stockAllocation=70&incomeGrowth=2&savingsSimulationCount=1000&savingsReturnMode=shuffled&seed=246813';

test('a missing binding fails closed', async () => {
    const res = await handleSignup(post('https://firecalc.ai/api/signup', { email: 'a@b.co' }), {});
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /not available/);
});

test('signup stores only email, time, consent, and the canonical plan link', async () => {
    const db = memoryDb();
    const res = await handleSignup(post('https://firecalc.ai/api/signup', {
        email: ' Person@Example.com ',
        consent: true,
        source: 'when-can-i-retire',
        planUrl: PLAN,
        retirementSavings: 999999,
        fc_website: ''
    }, { ip: '203.0.113.11' }), { FIRECALC_SIGNUPS: db });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(db.signups.size, 1);
    const row = db.signups.get('person@example.com');
    assert.equal(row.consent, 1);
    assert.equal(row.consent_text, CONSENT_TEXT);
    assert.equal(row.plan_url, PLAN);
    assert.equal(row.source, 'when-can-i-retire');
    assert.match(row.created_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(row.unsubscribe_token, /^[a-f0-9]{64}$/);
    assert.equal(row.retirementSavings, undefined);
    assert.equal(JSON.stringify(row).includes('999999'), false);
    assert.equal(row.wants_quarterly, 1);
    assert.equal(row.wants_january, 1);
    assert.equal(row.consent_version, CONSENT_VERSION);
});

test('a second signup refreshes the link and keeps the original token', async () => {
    const db = memoryDb();
    const env = { FIRECALC_SIGNUPS: db };
    await handleSignup(post('https://firecalc.ai/api/signup', {
        email: 'a@example.com', consent: true, source: 'calculator', planUrl: PLAN
    }, { ip: '203.0.113.12' }), env);
    const first = db.signups.get('a@example.com');
    const other = PLAN.replace('targetAmount=1800000', 'targetAmount=2000000');
    const res = await handleSignup(post('https://firecalc.ai/api/signup', {
        email: 'a@example.com', consent: true, source: 'coast-fire', planUrl: other
    }, { ip: '203.0.113.12' }), env);
    assert.equal(res.status, 200);
    const row = db.signups.get('a@example.com');
    assert.equal(row.unsubscribe_token, first.unsubscribe_token);
    assert.equal(row.created_at, first.created_at);
    assert.equal(row.plan_url, other);
    assert.equal(row.source, 'coast-fire');
});

test('validation, honeypot, and cross-site posts do not store a row', async () => {
    const db = memoryDb();
    const env = { FIRECALC_SIGNUPS: db };
    const base = { email: 'a@example.com', consent: true, source: 'calculator', planUrl: PLAN };
    assert.equal((await handleSignup(post('https://firecalc.ai/api/signup', { ...base, email: 'nope' }, { ip: '203.0.113.20' }), env)).status, 400);
    assert.equal((await handleSignup(post('https://firecalc.ai/api/signup', { ...base, consent: false }, { ip: '203.0.113.21' }), env)).status, 400);
    assert.equal((await handleSignup(post('https://firecalc.ai/api/signup', { ...base, planUrl: 'https://evil.example/?tab=accumulation&currentAge=30' }, { ip: '203.0.113.22' }), env)).status, 400);
    assert.equal((await handleSignup(post('https://firecalc.ai/api/signup', { ...base, planUrl: PLAN + '&hack=1' }, { ip: '203.0.113.23' }), env)).status, 400);
    const honey = await handleSignup(post('https://firecalc.ai/api/signup', { ...base, fc_website: 'http://spam.example' }, { ip: '203.0.113.24' }), env);
    assert.equal(honey.status, 200);
    const cross = await handleSignup(post('https://firecalc.ai/api/signup', base, {
        ip: '203.0.113.25',
        headers: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }
    }), env);
    assert.equal(cross.status, 403);
    assert.equal(db.signups.size, 0);
});

test('a comma-formatted calculator link is accepted and canonicalized', () => {
    const raw = 'http://127.0.0.1:8788/?tab=accumulation&currentSavings=50,000&currentAge=30&seed=246813';
    const plan = normalizePlanUrl(raw);
    assert.equal(plan.url, 'https://firecalc.ai/?tab=accumulation&currentSavings=50%2C000&currentAge=30&seed=246813');
});

test('a form post without JavaScript can save', async () => {
    const db = memoryDb();
    const res = await handleSignup(post('https://firecalc.ai/api/signup', {
        email: 'form@example.com',
        consent: 'yes',
        source: 'four-percent-rule',
        plan_url: PLAN,
        return_to: '/guides/four-percent-rule',
        fc_website: ''
    }, { ip: '203.0.113.30', json: false }), { FIRECALC_SIGNUPS: db });
    assert.equal(res.status, 200);
    assert.equal(db.signups.get('form@example.com').source, 'four-percent-rule');
    assert.equal(db.signups.get('form@example.com').wants_quarterly, 1);
    assert.equal(db.signups.get('form@example.com').wants_january, 1);
});

test('an explicit email choice can turn one message off, and both off is rejected', async () => {
    const db = memoryDb();
    const env = { FIRECALC_SIGNUPS: db };
    const base = { email: 'choice@example.com', consent: true, source: 'calculator', planUrl: PLAN, emailChoice: true };
    const rejected = await handleSignup(post('https://firecalc.ai/api/signup', {
        ...base, wantsQuarterly: false, wantsJanuary: false
    }, { ip: '203.0.113.70' }), env);
    assert.equal(rejected.status, 400);
    assert.equal(db.signups.size, 0);
    const saved = await handleSignup(post('https://firecalc.ai/api/signup', {
        ...base, wantsQuarterly: true, wantsJanuary: false
    }, { ip: '203.0.113.71' }), env);
    assert.equal(saved.status, 200);
    const row = db.signups.get('choice@example.com');
    assert.equal(row.wants_quarterly, 1);
    assert.equal(row.wants_january, 0);
});

test('the rate limit trips without storing past the cap', async () => {
    const db = memoryDb();
    const env = { FIRECALC_SIGNUPS: db };
    const body = { email: 'rate@example.com', consent: true, source: 'calculator', planUrl: PLAN };
    let last = 0;
    for (let i = 0; i < HOUR_LIMIT + 1; i++) {
        const res = await handleSignup(post('https://firecalc.ai/api/signup', body, { ip: '203.0.113.40' }), env);
        last = res.status;
    }
    assert.equal(last, 429);
    assert.equal(db.signups.size, 1);
});

test('unsubscribe deletes by email or token and does not say which', async () => {
    const db = memoryDb();
    const env = { FIRECALC_SIGNUPS: db };
    await handleSignup(post('https://firecalc.ai/api/signup', {
        email: 'gone@example.com', consent: true, source: 'calculator', planUrl: PLAN
    }, { ip: '203.0.113.50' }), env);
    const token = db.signups.get('gone@example.com').unsubscribe_token;
    db.sends.set('gone@example.com', true);
    db.snapshots.set('gone@example.com', true);
    const missing = await handleUnsubscribe(post('https://firecalc.ai/api/unsubscribe', {
        email: 'nobody@example.com'
    }, { ip: '203.0.113.51' }), env);
    const missingBody = await missing.json();
    assert.equal(missing.status, 200);
    assert.match(missingBody.message, /If that email was on the list/);
    assert.equal(db.signups.size, 1);

    const byToken = await handleUnsubscribe(post('https://firecalc.ai/api/unsubscribe', { token }, { ip: '203.0.113.52' }), env);
    assert.equal(byToken.status, 200);
    assert.equal(db.signups.size, 0);
    assert.equal(db.sends.size, 0);
    assert.equal(db.snapshots.size, 0);

    await handleSignup(post('https://firecalc.ai/api/signup', {
        email: 'gone@example.com', consent: true, source: 'calculator', planUrl: PLAN
    }, { ip: '203.0.113.53' }), env);
    const byEmail = await handleUnsubscribe(post('https://firecalc.ai/api/unsubscribe', {
        email: 'gone@example.com'
    }, { ip: '203.0.113.54' }), env);
    assert.equal((await byEmail.json()).message, missingBody.message);
    assert.equal(db.signups.size, 0);
});

test('unsubscribe without a binding fails closed', async () => {
    const res = await handleUnsubscribe(post('https://firecalc.ai/api/unsubscribe', { email: 'a@example.com' }), {});
    assert.equal(res.status, 503);
});

test('a one-click unsubscribe from a mail client deletes by token', async () => {
    const db = memoryDb();
    const env = { FIRECALC_SIGNUPS: db };
    await handleSignup(post('https://firecalc.ai/api/signup', {
        email: 'click@example.com', consent: true, source: 'calculator', planUrl: PLAN
    }, { ip: '203.0.113.80' }), env);
    const token = db.signups.get('click@example.com').unsubscribe_token;
    db.sends.set('click@example.com', true);
    const cross = await handleUnsubscribe(post(`https://firecalc.ai/api/unsubscribe?token=${token}`, {
        email: 'click@example.com'
    }, {
        ip: '203.0.113.81',
        headers: { 'sec-fetch-site': 'cross-site', origin: 'https://mail.google.com' }
    }), env);
    assert.equal(cross.status, 403);
    assert.equal(db.signups.size, 1);

    const click = await handleUnsubscribe(post(`https://firecalc.ai/api/unsubscribe?token=${token}`, {
        'List-Unsubscribe': 'One-Click'
    }, {
        ip: '203.0.113.81',
        json: false,
        headers: { 'sec-fetch-site': 'cross-site', origin: 'https://mail.google.com' }
    }), env);
    assert.equal(click.status, 204);
    assert.equal(await click.text(), '');
    assert.equal(db.signups.size, 0);
    assert.equal(db.sends.size, 0);
    assert.equal(db.suppressions.size, 1);
    assert.equal(await suppressionReason(db, 'click@example.com'), 'unsubscribe');

    const unknown = await handleUnsubscribe(post(`https://firecalc.ai/api/unsubscribe?token=${'c'.repeat(64)}`, {
        'List-Unsubscribe': 'One-Click'
    }, {
        ip: '203.0.113.82',
        json: false,
        headers: { 'sec-fetch-site': 'cross-site', origin: 'https://mail.google.com' }
    }), env);
    assert.equal(unknown.status, 204);
    assert.equal(await unknown.text(), '');
    assert.equal(db.suppressions.size, 1);
});

test('GET /api/unsubscribe redirects to the human page and keeps the token', async () => {
    const env = { FIRECALC_SIGNUPS: memoryDb() };
    const token = 'ab'.repeat(32);
    const res = await handleUnsubscribe(new Request(`https://firecalc.ai/api/unsubscribe?token=${token}`, {
        headers: { host: 'firecalc.ai' }
    }), env);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), `https://firecalc.ai/unsubscribe?token=${token}`);

    const local = await handleUnsubscribe(new Request(`http://127.0.0.1:8791/api/unsubscribe?token=${token}`, {
        headers: { host: '127.0.0.1:8791' }
    }), env);
    assert.equal(local.status, 302);
    assert.equal(local.headers.get('location'), `http://127.0.0.1:8791/unsubscribe?token=${token}`);
});

test('an unsubscribed address is not stored again without consent, and a complaint is not cleared', async () => {
    const db = memoryDb();
    const env = { FIRECALC_SIGNUPS: db };
    const email = 'again@example.com';
    await handleSignup(post('https://firecalc.ai/api/signup', {
        email, consent: true, source: 'calculator', planUrl: PLAN
    }, { ip: '203.0.113.90' }), env);
    const token = db.signups.get(email).unsubscribe_token;
    const removed = await handleUnsubscribe(post('https://firecalc.ai/api/unsubscribe', { token }, { ip: '203.0.113.91' }), env);
    assert.equal(removed.status, 200);
    assert.equal(db.signups.size, 0);
    assert.equal(await suppressionReason(db, email), 'unsubscribe');

    const noConsent = await handleSignup(post('https://firecalc.ai/api/signup', {
        email, consent: false, source: 'calculator', planUrl: PLAN
    }, { ip: '203.0.113.92' }), env);
    assert.equal(noConsent.status, 400);
    assert.equal(db.signups.size, 0);
    assert.equal(await suppressionReason(db, email), 'unsubscribe');

    const restored = await handleSignup(post('https://firecalc.ai/api/signup', {
        email, consent: true, source: 'calculator', planUrl: PLAN
    }, { ip: '203.0.113.93' }), env);
    assert.equal(restored.status, 200);
    assert.equal(db.signups.size, 1);
    assert.equal(db.signups.get(email).consent_version, CONSENT_VERSION);
    assert.equal(await suppressionReason(db, email), null);

    for (const reason of ['complaint', 'hard_bounce', 'provider']) {
        const banned = `${reason}@example.com`;
        await suppressAddress(db, banned, reason);
        const refused = await handleSignup(post('https://firecalc.ai/api/signup', {
            email: banned, consent: true, source: 'calculator', planUrl: PLAN
        }, { ip: '203.0.113.94' }), env);
        assert.equal(refused.status, 400);
        assert.match((await refused.json()).error, /not accepted/);
        assert.equal(db.signups.has(banned), false);
        assert.equal(await suppressionReason(db, banned), reason);
        assert.equal(db.suppressions.get(await emailHash(banned)).reason, reason);
    }
});

test('GET is not a compute or signup route', async () => {
    const res = await handleSignup(new Request('https://firecalc.ai/api/signup'), { FIRECALC_SIGNUPS: memoryDb() });
    assert.equal(res.status, 405);
});
