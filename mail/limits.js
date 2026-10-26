import file from '../data/annual-limits.json' with { type: 'json' };

export const LIMITS_FILE = file;

const LABELS = {
    deferral401k: '401(k) / 403(b) / 457 employee deferral',
    catchUp50: 'Catch-up, age 50+',
    catchUp60: 'Super catch-up, ages 60–63',
    ira: 'IRA contribution',
    hsaSelf: 'HSA, self-only',
    hsaFamily: 'HSA, family',
    hsaCatchUp55: 'HSA catch-up, age 55+',
    ssCola: 'Social Security COLA',
    ssWageBase: 'Social Security wage base'
};

export function limitLabel(key) {
    return LABELS[key] || key;
}

export function yearLimits(year, source = file) {
    const row = source.years[String(year)] || null;
    const required = source.required || [];
    if (!row) {
        return { year, present: false, complete: false, missing: required.slice(), row: null, todo: null };
    }
    const missing = required.filter(key => row[key] == null || row[key] === '');
    return {
        year,
        present: true,
        complete: missing.length === 0,
        missing,
        row,
        todo: row.todo || null,
        units: source.units || {}
    };
}

export function previousYearLimits(year, source = file) {
    return yearLimits(Number(year) - 1, source);
}

export function formatLimit(key, value, units = file.units) {
    if (value == null || value === '') return null;
    if ((units[key] || 'usd') === 'percent') {
        const n = Number(value);
        const text = Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
        return `${text}%`;
    }
    return money(value);
}

export function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return `$${Math.round(n).toLocaleString('en-US')}`;
}
