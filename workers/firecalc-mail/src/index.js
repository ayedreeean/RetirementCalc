// Scheduled sender for the opt-in plan list. The public site does not import
// this file. There is no unauthenticated route that runs the calculator.

import { outboundMessage, previewOne, runCampaign } from '../../../mail/campaign.js';
import { applyDeliveryEvent } from '../../../mail/delivery.js';
import { ensureMailSchema } from '../../../mail/schema.js';
import { postalAddress, postalReady, replyAddress, sendingEnabled } from '../../../mail/schedule.js';

const BODY_LIMIT = 8000;

function json(status, body) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff'
        }
    });
}

async function tokenOk(request, env) {
    const expected = env.ADMIN_TOKEN;
    if (!expected) return 'missing';
    const header = request.headers.get('authorization') || '';
    const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!provided) return 'bad';
    const enc = new TextEncoder();
    const [left, right] = await Promise.all([
        crypto.subtle.digest('SHA-256', enc.encode(String(provided))),
        crypto.subtle.digest('SHA-256', enc.encode(String(expected)))
    ]);
    const a = new Uint8Array(left);
    const b = new Uint8Array(right);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0 ? 'ok' : 'bad';
}

async function readJson(request) {
    let text;
    try { text = await request.text(); }
    catch { return { error: true }; }
    if (text.length > BODY_LIMIT) return { error: true };
    if (!text) return { data: {} };
    try { return { data: JSON.parse(text) }; }
    catch { return { error: true }; }
}

function batchSize(env) {
    const n = parseInt(env && env.MAIL_BATCH, 10);
    if (!Number.isFinite(n) || n < 1) return undefined;
    return Math.min(n, 100);
}

function oneAddress(value) {
    const email = String(value || '').trim().toLowerCase();
    if (!email || email.length > 254 || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return null;
    return email;
}

export default {
    async scheduled(event, env, ctx) {
        ctx.waitUntil((async () => {
            try {
                if (!env.FIRECALC_SIGNUPS) {
                    console.error(JSON.stringify({ event: 'mail-cron', error: 'missing database' }));
                    return;
                }
                const summary = await runCampaign(env.FIRECALC_SIGNUPS, env, {
                    now: new Date(event.scheduledTime),
                    batch: batchSize(env)
                });
                console.log(JSON.stringify({ event: 'mail-cron', ...summary }));
            } catch (err) {
                console.error(JSON.stringify({ event: 'mail-cron', error: 'campaign failed' }));
            }
        })());
    },

    async fetch(request, env) {
        const url = new URL(request.url);
        if (request.method === 'GET' && url.pathname === '/health') {
            return json(200, {
                ok: true,
                service: 'firecalc-mail',
                dryRun: !sendingEnabled(env)
            });
        }
        if (request.method !== 'POST' || !url.pathname.startsWith('/admin/')) {
            return json(404, { ok: false, error: 'Not found.' });
        }
        const auth = await tokenOk(request, env);
        if (auth === 'missing') return json(503, { ok: false, error: 'Admin token is not configured.' });
        if (auth !== 'ok') return json(401, { ok: false, error: 'Unauthorized.' });

        const body = await readJson(request);
        if (body.error) return json(400, { ok: false, error: 'The request could not be read.' });
        const data = body.data && typeof body.data === 'object' ? body.data : {};

        if (url.pathname === '/admin/dry-run') {
            const built = previewOne({
                planUrl: data.planUrl || data.plan_url,
                kind: data.kind === 'january' ? 'january' : 'quarterly',
                year: Number(data.year) || new Date().getUTCFullYear(),
                postal: data.postal || postalAddress(env),
                replyTo: replyAddress(env),
                token: data.token,
                prior: data.prior || null
            });
            if (!built.ok) return json(400, { ok: false, error: built.detail || 'That plan could not be read.' });
            return json(200, {
                ok: true,
                subject: built.message.subject,
                html: built.message.html,
                text: built.message.text,
                sendable: built.message.sendable !== false,
                status: built.status
            });
        }

        if (url.pathname === '/admin/test-send') {
            const to = oneAddress(data.to);
            if (!to) return json(400, { ok: false, error: 'Enter one email address.' });
            if (!data.planUrl && !data.plan_url) return json(400, { ok: false, error: 'A plan link is required.' });
            if (!postalReady(postalAddress(env))) {
                console.error(JSON.stringify({ event: 'mail-blocked', detail: 'POSTAL_ADDRESS' }));
                return json(409, { ok: false, error: 'POSTAL_ADDRESS', blocked: ['POSTAL_ADDRESS'] });
            }
            const kind = data.kind === 'january' ? 'january' : 'quarterly';
            const built = previewOne({
                planUrl: data.planUrl || data.plan_url,
                kind,
                year: Number(data.year) || new Date().getUTCFullYear(),
                postal: postalAddress(env),
                replyTo: replyAddress(env),
                token: data.token
            });
            if (!built.ok) return json(400, { ok: false, error: built.detail || 'That plan could not be read.' });
            if (!env.EMAIL || typeof env.EMAIL.send !== 'function') {
                return json(503, { ok: false, error: 'Email binding is not configured.' });
            }
            try {
                await env.EMAIL.send(outboundMessage(env, built, to));
            } catch (err) {
                const code = err && err.code ? String(err.code) : 'send failed';
                console.error(JSON.stringify({ event: 'mail-test-failed', code }));
                return json(502, { ok: false, error: code });
            }
            return json(200, {
                ok: true,
                sent: true,
                kind,
                subject: built.message.subject,
                sendable: built.message.sendable !== false
            });
        }

        if (url.pathname === '/admin/run') {
            if (!env.FIRECALC_SIGNUPS) return json(503, { ok: false, error: 'Database is not configured.' });
            const wantLive = data.live === true;
            const live = wantLive && sendingEnabled(env);
            const summary = await runCampaign(env.FIRECALC_SIGNUPS, env, {
                now: data.now ? new Date(data.now) : new Date(),
                live,
                force: data.force === true,
                kind: data.kind === 'january' || data.kind === 'quarterly' ? data.kind : undefined,
                batch: batchSize(env)
            });
            return json(200, { ok: true, live, ...summary });
        }

        return json(404, { ok: false, error: 'Not found.' });
    },

    async queue(batch, env) {
        if (!env.FIRECALC_SIGNUPS) return;
        await ensureMailSchema(env.FIRECALC_SIGNUPS);
        for (const message of batch.messages) {
            try {
                const reason = await applyDeliveryEvent(env.FIRECALC_SIGNUPS, message.body);
                console.log(JSON.stringify({ event: 'mail-delivery', applied: !!reason, reason }));
                message.ack();
            } catch (err) {
                console.error(JSON.stringify({ event: 'mail-delivery', error: 'apply failed' }));
                message.retry();
            }
        }
    }
};
