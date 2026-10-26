// Email Sending lifecycle events. Cloudflare already suppresses hard bounces
// and complaints on its side. This records the same decision in our hashed
// list so a later signup cannot put the address back into a cron batch.
// Soft bounces are ignored. The queue subscription itself is not deployed;
// see workers/firecalc-mail/README.md.

import { deleteSubscriber } from './schema.js';
import { suppressAddress } from './suppress.js';

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export function deliverySuppressionReason(event) {
    if (!event || typeof event !== 'object') return null;
    const type = String(event.type || '');
    if (type === 'cf.email.sending.message.complained' || type.endsWith('.message.complained')) return 'complaint';
    const hard = event.payload && event.payload.bounce && event.payload.bounce.type === 'hard';
    if (hard && (type === 'cf.email.sending.message.bounced' || type.endsWith('.message.bounced'))) return 'hard_bounce';
    return null;
}

export function deliveryRecipient(event) {
    const raw = event && event.payload && event.payload.recipient;
    const email = String(raw || '').trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
    return email;
}

export async function applyDeliveryEvent(db, event) {
    const reason = deliverySuppressionReason(event);
    const email = deliveryRecipient(event);
    if (!reason || !email) return null;
    await suppressAddress(db, email, reason);
    await deleteSubscriber(db, email);
    return reason;
}
