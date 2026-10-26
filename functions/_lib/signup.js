// Optional "email me my plan" storage. This module does not import the
// calculator and it does not run a simulation. Dollars stay inside the share
// URL the person chose to save. The scheduled mail worker is the only place
// that reads that URL to fill an email.

import { deleteSubscriber, ensureMailSchema } from '../../mail/schema.js';
import { clearUnsubscribe, suppressionReason, suppressAddress } from '../../mail/suppress.js';

export const CONSENT_VERSION = '2026-10-26.2';
export const CONSENT_TEXT = 'I agree to let FIREcalc store my email address, the time of this request, this consent, and the share link on this page. The share link contains the calculator inputs in the address. I want that link saved so FIREcalc can email it to me, send a quarterly check-in, and send a January yearly checkpoint. I can turn either email off here, and I can delete this signup at any time.';

export const HOUR_LIMIT = 8;
export const DAY_LIMIT = 30;
export const BINDING = 'FIRECALC_SIGNUPS';

export const SOURCES = new Set([
    'calculator',
    'when-can-i-retire',
    'retire-on-one-million',
    'fire-calculator-for-families',
    'coast-fire',
    'four-percent-rule'
]);

export const ALLOWED_RETURNS = new Set([
    '/',
    '/guides/when-can-i-retire',
    '/guides/retire-on-one-million',
    '/guides/fire-calculator-for-families',
    '/guides/coast-fire',
    '/guides/four-percent-rule',
    '/unsubscribe'
]);

const PLAN_KEYS = new Set([
    'tab', 'seed', 'pack',
    'currentAge', 'currentSavings', 'income', 'expenses', 'targetAmount',
    'stockAllocation', 'incomeGrowth', 'savingsSimulationCount', 'savingsReturnMode',
    'retirementAge', 'retirementSavings', 'annualWithdrawal', 'retirementStockAllocation',
    'taxRate', 'retirementLifeExpectancy', 'simulationCount', 'retirementReturnMode',
    'ssMonthlyBenefit', 'ssClaimingAge', 'spouseSSMonthlyBenefit', 'spouseSSClaimingAge',
    'monthlyPension', 'pensionStartAge', 'monthlyOtherIncome', 'otherIncomeDuration',
    'withdrawalAdjustment', 'includeSS', 'includeSpouseSS', 'includeOtherIncome',
    'taxMode', 'taxFilingStatus', 'taxPreTaxPct', 'taxRothPct', 'taxTaxablePct',
    'taxOptimizeOrder', 'taxStateRate'
]);

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const TOKEN_RE = /^[a-f0-9]{64}$/;
const VALUE_RE = /^[A-Za-z0-9._,-]*$/;

const SAVED_MESSAGE = 'Saved. Quarterly check-ins and the January checkpoint go out on the schedule once sending is turned on. You can delete this signup anytime.';
const DELETED_MESSAGE = 'If that email was on the list, it has been deleted.';
const UNAVAILABLE = 'Email signup is not available on this deployment yet. The calculator still runs in your browser.';

const schemaReady = new WeakMap();

function json(request, status, body) {
    const type = (request.headers.get('content-type') || '').toLowerCase();
    const accept = (request.headers.get('accept') || '').toLowerCase();
    const wantsJson = type.includes('application/json') || accept.includes('application/json');
    const headers = {
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
    };
    if (wantsJson) {
        return new Response(JSON.stringify(body), {
            status,
            headers: { ...headers, 'content-type': 'application/json; charset=utf-8' }
        });
    }
    const back = ALLOWED_RETURNS.has(body.back) ? body.back : '/';
    const text = body.ok ? body.message : body.error;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${body.ok ? 'Saved' : 'Not saved'} — FIREcalc</title></head><body style="font-family:system-ui,sans-serif;background:#FAF8F4;color:#1C2433;max-width:640px;margin:48px auto;padding:0 20px;line-height:1.5"><p>${escapeHtml(text)}</p><p><a href="${escapeHtml(back)}">Back</a></p></body></html>`;
    return new Response(html, {
        status,
        headers: { ...headers, 'content-type': 'text/html; charset=utf-8' }
    });
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function originAllowed(request) {
    const site = request.headers.get('sec-fetch-site');
    if (site === 'cross-site') return false;
    const origin = request.headers.get('origin');
    if (!origin) return true;
    let host;
    try { host = new URL(origin).host; } catch { return false; }
    const reqHost = request.headers.get('host');
    if (reqHost && host === reqHost) return true;
    return host === 'firecalc.ai' || host === 'www.firecalc.ai';
}

export function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
    const [local, domain] = email.split('@');
    if (!local || !domain || local.startsWith('.') || local.endsWith('.') || domain.includes('..') || local.includes('..')) return null;
    return email;
}

export function normalizePlanUrl(raw) {
    if (raw == null || String(raw).trim() === '') return { error: 'That link is not a FIREcalc plan link.' };
    let url;
    try { url = new URL(String(raw).trim(), 'https://firecalc.ai'); }
    catch { return { error: 'That link is not a FIREcalc plan link.' }; }
    if (url.username || url.password) return { error: 'That link is not a FIREcalc plan link.' };
    const host = url.hostname.toLowerCase();
    const local = host === 'localhost' || host === '127.0.0.1';
    const prod = host === 'firecalc.ai' || host === 'www.firecalc.ai';
    if (!local && !prod) return { error: 'That link is not a FIREcalc plan link.' };
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'That link is not a FIREcalc plan link.' };
    if (!local && url.protocol !== 'https:') return { error: 'That link is not a FIREcalc plan link.' };
    const path = url.pathname === '/index.html' ? '/' : url.pathname;
    if (path !== '/' && path !== '') return { error: 'That link is not a FIREcalc plan link.' };
    const params = url.searchParams;
    const keys = [...params.keys()];
    if (!keys.length || keys.length > 40) return { error: 'That link is not a FIREcalc plan link.' };
    if (new Set(keys).size !== keys.length) return { error: 'That link is not a FIREcalc plan link.' };
    for (const key of keys) {
        const value = params.get(key);
        if (!PLAN_KEYS.has(key) || value == null || value.length > 32 || !VALUE_RE.test(value)) {
            return { error: 'That link is not a FIREcalc plan link.' };
        }
    }
    if (params.get('tab') === 'accumulation' && params.has('pack')) {
        return { error: 'That link is not a FIREcalc plan link.' };
    }
    const canonical = `https://firecalc.ai/?${params.toString()}`;
    if (canonical.length > 2000) return { error: 'That link is not a FIREcalc plan link.' };
    return { url: canonical };
}

function consentGiven(data) {
    return data.consent === true || data.consent === 'yes' || data.consent === 'on';
}

function honeypotTripped(data) {
    const trap = data.fc_website ?? data.company ?? '';
    return String(trap).trim() !== '';
}

function backPath(data) {
    const value = data.return_to || data.returnTo || '/';
    return ALLOWED_RETURNS.has(value) ? value : '/';
}

async function readBody(request) {
    let text;
    try { text = await request.text(); }
    catch { return { error: 'The signup could not be read.', status: 400 }; }
    if (text.length > 8000) return { error: 'That signup was too large.', status: 400 };
    const type = (request.headers.get('content-type') || '').toLowerCase();
    if (type.includes('application/json')) {
        try { return { data: text ? JSON.parse(text) : {} }; }
        catch { return { error: 'The signup could not be read.', status: 400 }; }
    }
    if (type.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(text);
        return { data: Object.fromEntries(params.entries()) };
    }
    return { error: 'The signup could not be read.', status: 400 };
}

function database(env) {
    const db = env && env[BINDING];
    if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') return null;
    return db;
}

function ensureSchema(db) {
    let pending = schemaReady.get(db);
    if (!pending) {
        pending = ensureMailSchema(db).catch(err => {
            schemaReady.delete(db);
            throw err;
        });
        schemaReady.set(db, pending);
    }
    return pending;
}

function flagOn(value) {
    return value === true || value === 1 || value === '1' || value === 'yes' || value === 'on' || value === 'true';
}

function emailPrefs(data) {
    const named = data.email_choice != null || data.emailChoice != null
        || data.wants_quarterly != null || data.wantsQuarterly != null
        || data.wants_january != null || data.wantsJanuary != null;
    if (!named) return { quarterly: 1, january: 1, explicit: false };
    return {
        quarterly: flagOn(data.wants_quarterly ?? data.wantsQuarterly) ? 1 : 0,
        january: flagOn(data.wants_january ?? data.wantsJanuary) ? 1 : 0,
        explicit: true
    };
}

function oneClickToken(request, data) {
    const token = String(new URL(request.url).searchParams.get('token') || '').trim().toLowerCase();
    if (!TOKEN_RE.test(token)) return null;
    const type = (request.headers.get('content-type') || '').toLowerCase();
    if (!type.includes('application/x-www-form-urlencoded')) return null;
    const flag = data['List-Unsubscribe'] || data['list-unsubscribe'];
    return flag === 'One-Click' ? token : null;
}

async function deleteByToken(db, token) {
    const row = await db.prepare('SELECT email FROM signups WHERE unsubscribe_token = ?').bind(token).first();
    if (row && row.email) {
        await suppressAddress(db, row.email, 'unsubscribe');
        await deleteSubscriber(db, row.email);
    }
}

async function clientHash(request) {
    const ip = request.headers.get('cf-connecting-ip')
        || (request.headers.get('x-forwarded-for') || '').split(',')[0].trim()
        || 'unknown';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`firecalc-signup-v1:${ip}`));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function tooMany(db, request) {
    const now = Date.now();
    await db.prepare('DELETE FROM signup_rate WHERE window_start < ?').bind(now - 2 * 86400000).run();
    const hash = await clientHash(request);
    const hourIndex = Math.floor(now / 3600000);
    const dayIndex = Math.floor(now / 86400000);
    const checks = [
        [`h:${hash}:${hourIndex}`, hourIndex * 3600000, HOUR_LIMIT],
        [`d:${hash}:${dayIndex}`, dayIndex * 86400000, DAY_LIMIT]
    ];
    for (const [bucket, windowStart, limit] of checks) {
        await db.prepare(`INSERT INTO signup_rate (bucket, window_start, hits) VALUES (?, ?, 1)
            ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1`).bind(bucket, windowStart).run();
        const row = await db.prepare('SELECT hits FROM signup_rate WHERE bucket = ?').bind(bucket).first();
        if (row && row.hits > limit) return true;
    }
    return false;
}

function newToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function handleSignup(request, env) {
    if (request.method !== 'POST') return json(request, 405, { ok: false, error: 'Method not allowed.', back: '/' });
    if (!originAllowed(request)) return json(request, 403, { ok: false, error: 'This form only accepts requests from FIREcalc.', back: '/' });
    const db = database(env);
    if (!db) return json(request, 503, { ok: false, error: UNAVAILABLE, back: '/' });

    const parsed = await readBody(request);
    if (parsed.error) return json(request, parsed.status, { ok: false, error: parsed.error, back: '/' });
    const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
    const back = backPath(data);

    try {
        await ensureSchema(db);
        if (await tooMany(db, request)) {
            return json(request, 429, { ok: false, error: 'Too many signup attempts. Try again later.', back });
        }
        if (honeypotTripped(data)) return json(request, 200, { ok: true, message: SAVED_MESSAGE, back });

        const email = normalizeEmail(data.email);
        if (!email) return json(request, 400, { ok: false, error: 'Enter a valid email address.', back });
        if (!consentGiven(data)) return json(request, 400, { ok: false, error: 'Check the box to confirm you want this saved.', back });
        const source = String(data.source || '');
        if (!SOURCES.has(source)) return json(request, 400, { ok: false, error: 'This form could not be saved.', back });
        const plan = normalizePlanUrl(data.planUrl || data.plan_url);
        if (plan.error) return json(request, 400, { ok: false, error: plan.error, back });
        const prefs = emailPrefs(data);
        if (prefs.explicit && !prefs.quarterly && !prefs.january) {
            return json(request, 400, { ok: false, error: 'Choose at least one email: the quarterly check-in or the January checkpoint.', back });
        }
        const held = await suppressionReason(db, email);
        if (held && held !== 'unsubscribe') {
            return json(request, 400, { ok: false, error: 'That address is not accepted for these emails.', back });
        }
        if (held === 'unsubscribe') await clearUnsubscribe(db, email);

        const now = new Date().toISOString();
        await db.prepare(`INSERT INTO signups
            (email, created_at, updated_at, consent, consent_text, plan_url, source, unsubscribe_token, wants_quarterly, wants_january, consent_version)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                updated_at = excluded.updated_at,
                consent = 1,
                consent_text = excluded.consent_text,
                plan_url = excluded.plan_url,
                source = excluded.source,
                wants_quarterly = excluded.wants_quarterly,
                wants_january = excluded.wants_january,
                consent_version = excluded.consent_version`).bind(
            email, now, now, CONSENT_TEXT, plan.url, source, newToken(), prefs.quarterly, prefs.january, CONSENT_VERSION
        ).run();
        return json(request, 200, { ok: true, message: SAVED_MESSAGE, back });
    } catch (err) {
        console.error('signup failed');
        return json(request, 500, { ok: false, error: 'Could not save that signup. Try again later.', back });
    }
}

function unsubscribePage(request) {
    const url = new URL(request.url);
    const token = String(url.searchParams.get('token') || '').trim().toLowerCase();
    const host = request.headers.get('host') || 'firecalc.ai';
    const local = host.startsWith('127.0.0.1') || host.startsWith('localhost');
    const dest = new URL(`${local ? 'http' : 'https'}://${host}/unsubscribe`);
    if (TOKEN_RE.test(token)) dest.searchParams.set('token', token);
    return Response.redirect(dest.toString(), 302);
}

function empty(status) {
    return new Response(null, {
        status,
        headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    });
}

export async function handleUnsubscribe(request, env) {
    if (request.method === 'GET') return unsubscribePage(request);
    if (request.method !== 'POST') return json(request, 405, { ok: false, error: 'Method not allowed.', back: '/unsubscribe' });
    const db = database(env);
    if (!db) return json(request, 503, { ok: false, error: UNAVAILABLE, back: '/unsubscribe' });

    const parsed = await readBody(request);
    if (parsed.error) return json(request, parsed.status, { ok: false, error: parsed.error, back: '/unsubscribe' });
    const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
    const click = oneClickToken(request, data);
    if (!click && !originAllowed(request)) {
        return json(request, 403, { ok: false, error: 'This form only accepts requests from FIREcalc.', back: '/unsubscribe' });
    }
    const back = backPath(data) === '/' ? '/unsubscribe' : backPath(data);

    try {
        await ensureSchema(db);
        if (click) {
            await deleteByToken(db, click);
            return empty(204);
        }
        if (await tooMany(db, request)) {
            return json(request, 429, { ok: false, error: 'Too many signup attempts. Try again later.', back });
        }
        if (honeypotTripped(data)) return json(request, 200, { ok: true, message: DELETED_MESSAGE, back });

        const token = String(data.token || '').trim().toLowerCase();
        const email = normalizeEmail(data.email);
        if (!email && !TOKEN_RE.test(token)) {
            return json(request, 400, { ok: false, error: 'Enter the email address to delete, or use the deletion link.', back });
        }
        if (TOKEN_RE.test(token)) await deleteByToken(db, token);
        else {
            await suppressAddress(db, email, 'unsubscribe');
            await deleteSubscriber(db, email);
        }
        return json(request, 200, { ok: true, message: DELETED_MESSAGE, back });
    } catch (err) {
        console.error('unsubscribe failed');
        return json(request, 500, { ok: false, error: 'Could not delete that signup. Try again later.', back });
    }
}
