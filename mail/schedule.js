const QUARTER_MONTHS = new Set([0, 3, 6, 9]);

export function firstWeekday(year, monthIndex) {
    const day = new Date(Date.UTC(year, monthIndex, 1));
    while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
    return day.getUTCDate();
}

export function inSendWindow(date) {
    const month = date.getUTCMonth();
    if (!QUARTER_MONTHS.has(month)) return false;
    const dom = date.getUTCDate();
    if (dom > 7) return false;
    return dom >= firstWeekday(date.getUTCFullYear(), month);
}

export function quarterKey(date) {
    const month = date.getUTCMonth();
    const q = month < 3 ? 'Q1' : month < 6 ? 'Q2' : month < 9 ? 'Q3' : 'Q4';
    return `${date.getUTCFullYear()}-${q}`;
}

// January's yearly checkpoint replaces that quarter's nudge when the person
// asked for it. Anyone who asked only for the quarterly note still gets one
// in January.
export function mailFor(date, prefs, { force = false } = {}) {
    if (!force && !inSendWindow(date)) return null;
    const month = date.getUTCMonth();
    if (!force && !QUARTER_MONTHS.has(month)) return null;
    const year = date.getUTCFullYear();
    const wantsJanuary = !!prefs.january;
    const wantsQuarterly = !!prefs.quarterly;
    if (month === 0 && wantsJanuary) return { kind: 'january', period: String(year), year };
    if (wantsQuarterly) return { kind: 'quarterly', period: quarterKey(date), year };
    return null;
}

export const POSTAL_PLACEHOLDER = 'POSTAL ADDRESS NEEDED';

export function postalReady(value) {
    const text = String(value || '').trim();
    return text.length >= 8 && text !== POSTAL_PLACEHOLDER;
}

export function sendingEnabled(env) {
    return !!(env && env.DRY_RUN === 'false');
}
