import assert from 'node:assert/strict';
import test from 'node:test';
import { CONSENT_TEXT, HOUR_LIMIT, handleSignup, handleUnsubscribe, normalizePlanUrl } from './signup.js';

function memoryDb() {
    const signups = new Map();
    const rates = new Map();
    function exec(sql, args) {
        const s = sql.replace(/\s+/g, ' ').trim();
        if (s.startsWith('CREATE TABLE')) return { meta: { changes: 0 } };
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
            const [email, created_at, updated_at, consent_text, plan_url, source, token] = args;
            const prev = signups.get(email);
            if (prev) {
                signups.set(email, { ...prev, updated_at, consent: 1, consent_text, plan_url, source });
            } else {
                signups.set(email, {
                    email, created_at, updated_at, consent: 1, consent_text, plan_url, source, unsubscribe_token: token
                });
            }
            return { meta: { changes: 1 } };
        }
        if (s.startsWith('DELETE FROM signups WHERE email')) {
            return { meta: { changes: signups.delete(args[0]) ? 1 : 0 } };
        }
        if (s.startsWith('DELETE FROM signups WHERE unsubscribe_token')) {
            let n = 0;
            for (const [key, row] of signups) {
                if (row.unsubscribe_token === args[0]) { signups.delete(key); n++; }
            }
            return { meta: { changes: n } };
        }
        throw new Error(`unexpected sql: ${s}`);
    }
    return {
        signups,
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

test('GET is not a compute or signup route', async () => {
    const res = await handleSignup(new Request('https://firecalc.ai/api/signup'), { FIRECALC_SIGNUPS: memoryDb() });
    assert.equal(res.status, 405);
});
