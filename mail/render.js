import { formatLimit, limitLabel, money, previousYearLimits, yearLimits } from './limits.js';
import { POSTAL_PLACEHOLDER } from './schedule.js';

const F = "font-family:Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
const D = "font-family:Georgia,'Times New Roman',serif;";

function esc(value) {
    return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function pct(value, digits = 1) {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${(value * 100).toFixed(digits)}%`;
}

function yearsLabel(years, age) {
    if (years == null) return 'Not within 50 years';
    const y = `${years} ${years === 1 ? 'year' : 'years'}`;
    return age == null ? y : `${y} (age ${age})`;
}

function shell({ kicker, title, preheader, inner, why, postal, token }) {
    const unsub = `https://firecalc.ai/unsubscribe?token=${encodeURIComponent(token)}`;
    const address = postal && postal !== POSTAL_PLACEHOLDER ? esc(postal) : 'POSTAL ADDRESS NEEDED — Adrian fills this in before real mail goes out';
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(title)}</title>
<style>@media only screen and (max-width:600px){.stack{display:block!important;width:100%!important;}.px{padding-left:20px!important;padding-right:20px!important;}}</style></head>
<body style="margin:0;padding:0;background:#FAF8F4;"><div style="display:none;max-height:0;overflow:hidden;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F4;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="padding:8px 4px 14px;${F}"><span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:#0F7B6C;color:#fff;text-align:center;line-height:28px;font-weight:700;font-size:15px;vertical-align:middle;">F</span><span style="${D}font-size:21px;font-weight:600;color:#1C2433;vertical-align:middle;margin-left:8px;">FIREcalc</span><span style="float:right;font-size:13px;color:#636B7A;line-height:28px;">${esc(kicker)}</span></td></tr>
<tr><td style="background:#FFFFFF;border:1px solid #E7E2D9;border-radius:24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${inner}</table></td></tr>
<tr><td style="padding:22px 20px 8px;${F}font-size:12px;line-height:1.6;color:#636B7A;text-align:center;">${why}<br><a href="${esc(unsub)}" style="color:#0F7B6C;font-weight:600;">Unsubscribe</a> · <a href="https://firecalc.ai/privacy-policy.html" style="color:#636B7A;">Privacy</a><br><br>Results use the FIREcalc calculator: US stock and 10-year Treasury returns for 1975–2024. They are an illustration, not a forecast. <strong>Not financial advice.</strong><br><br>${address}<br>firecalc.ai</td></tr>
</table></td></tr></table></body></html>`;
}

function sec(html, pad = '22px 36px 4px') {
    return `<tr><td class="px" style="padding:${pad};${F}">${html}</td></tr>`;
}

function h2(text) {
    return `<h2 style="${D}font-size:19px;color:#1C2433;margin:0 0 10px;font-weight:600;">${esc(text)}</h2>`;
}

function p(html, size = 15) {
    return `<p style="font-size:${size}px;line-height:1.6;color:#384254;margin:0 0 8px;">${html}</p>`;
}

function note(html) {
    return `<p style="font-size:12px;color:#636B7A;margin:8px 0 0;line-height:1.5;">${html}</p>`;
}

function button(href, label, sub) {
    return `<tr><td class="px" align="center" style="padding:24px 36px 6px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#0F7B6C" style="border-radius:999px;"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:15px 34px;${F}font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">${esc(label)} &rarr;</a></td></tr></table><p style="${F}font-size:13px;color:#636B7A;margin:10px 0 0;">${esc(sub)}</p></td></tr>`;
}

function bar(pctA, pctB) {
    const a = Math.max(0, Math.min(100, pctA));
    let cells = `<td width="${a.toFixed(1)}%" style="background:#0F7B6C;height:14px;font-size:0;line-height:0;">&nbsp;</td>`;
    let rest = 100 - a;
    if (pctB != null && pctB > a) {
        const mid = Math.min(100, pctB) - a;
        cells += `<td width="${mid.toFixed(1)}%" style="background:#7FC4B8;height:14px;font-size:0;line-height:0;">&nbsp;</td>`;
        rest = 100 - a - mid;
    }
    cells += `<td width="${Math.max(0, rest).toFixed(1)}%" style="background:#EFEBE3;height:14px;font-size:0;line-height:0;">&nbsp;</td>`;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:999px;overflow:hidden;"><tr>${cells}</tr></table>`;
}

function table(rows, h1, h2) {
    const th = `style="padding:8px 6px;${F}font-size:12px;color:#5B6576;text-transform:uppercase;letter-spacing:.05em;font-weight:600;border-bottom:1px solid #E7E2D9;"`;
    let html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td ${th}></td><td align="right" ${th}>${esc(h1)}</td>`;
    if (h2) html += `<td align="right" ${th}>${esc(h2)}</td>`;
    html += '</tr>';
    for (const [label, a, b] of rows) {
        html += `<tr><td style="padding:9px 6px;border-bottom:1px solid #EFEBE4;${F}font-size:14px;color:#5B6576;">${esc(label)}</td><td align="right" style="padding:9px 6px;border-bottom:1px solid #EFEBE4;${F}font-size:14px;color:#384254;">${a}</td>`;
        if (h2) html += `<td align="right" style="padding:9px 6px;border-bottom:1px solid #EFEBE4;${F}font-size:14px;color:#0B6358;font-weight:700;">${b}</td>`;
        html += '</tr>';
    }
    return html + '</table>';
}

function methodNote(plan) {
    const mode = plan.returnMode === 'historical'
        ? `${plan.pathCount} historical start${plan.kind === 'retirement' ? ' windows' : ' years'} in 1975–2024`
        : `${Number(plan.pathCount).toLocaleString('en-US')} shuffled paths, seed ${plan.seed}`;
    const bits = [mode.endsWith('.') ? mode : `${mode}.`];
    if (plan.capped) bits.push('The link asked for more than 1,000 paths. This email uses 1,000.');
    if (plan.seedNote) bits.push(plan.seedNote);
    bits.push('The sample does not include 1966 or 1973–74.');
    return bits.join(' ');
}

function savingsRows(plan) {
    return [
        ['Invested', money(plan.savings)],
        ['Goal, today’s dollars', money(plan.target)],
        ['Progress', pct(plan.progress)],
        ['Median years to the goal', yearsLabel(plan.median, plan.medianAge)],
        ['Faster 10%', plan.p10 == null ? '—' : `by ${plan.p10} years`],
        ['Slower 10%', plan.p90 == null ? '—' : `at least ${plan.p90} years`],
        ['Paths that reached the goal', `${Number(plan.reached).toLocaleString('en-US')} of ${Number(plan.pathCount).toLocaleString('en-US')}`]
    ];
}

export function listHeaders(token) {
    const url = `https://firecalc.ai/api/unsubscribe?token=${encodeURIComponent(token)}`;
    return {
        'List-Unsubscribe': `<${url}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'List-Id': '<firecalc-plan.firecalc.ai>'
    };
}

export function renderQuarterly({ plan, planUrl, token, postal, prior, period }) {
    const progressNow = Math.max(0, plan.progress * 100);
    const progressThen = prior && prior.progress != null ? Math.max(0, prior.progress * 100) : null;
    let inner = sec(`<h1 style="${D}font-size:28px;line-height:1.2;color:#1C2433;margin:0 0 12px;font-weight:600;">Got 30 seconds?</h1>${p('It’s been a quarter. Your balance, pay, or spending may have moved. Open the saved plan, change the one or two numbers that did, and look again.')}`, '30px 36px 4px');
    if (plan.kind === 'accumulation') {
        const goal = money(plan.target);
        inner += sec(h2(`Progress to your ${goal} goal`) +
            `<p style="${F}font-size:13px;color:#384254;padding-bottom:6px;"><strong style="color:#0B6358;">${pct(plan.progress)}</strong> of the goal is saved (${money(plan.savings)}).</p>` +
            bar(progressThen != null ? Math.min(progressThen, progressNow) : progressNow, progressThen != null && progressNow > progressThen ? progressNow : null) +
            note(progressThen == null
                ? 'The bar is the saved balance divided by the goal, both in the dollars on the link.'
                : 'Dark is the last email. Teal is the plan saved now.'));
        const rows = savingsRows(plan).map(([label, value]) => [label, value]);
        if (prior && prior.median != null) {
            inner += sec(h2('Since the last email') + table([
                ['Invested', money(prior.savings), money(plan.savings)],
                ['Progress', pct(prior.progress), pct(plan.progress)],
                ['Median years', yearsLabel(prior.median, prior.medianAge), yearsLabel(plan.median, plan.medianAge)]
            ], 'Last email', 'Saved now'));
        } else {
            inner += sec(h2('Where the saved plan stands') + table(rows, 'Saved plan'));
        }
        inner += sec(note(methodNote(plan)));
    } else {
        inner += sec(h2('Your saved retirement plan') + p(retirementLead(plan)) + note(methodNote(plan) + (plan.pack ? ` The link also opens the ${plan.pack} stress pack. This percentage is the full set of paths, not that one pack.` : '')));
    }
    inner += button(planUrl, 'Update my numbers', 'Opens your saved plan, prefilled. Change what moved.');
    inner += sec(note('The calculator on the site still runs in your browser. This email was filled in from the share link you saved.'), '4px 36px 28px');
    const html = shell({
        kicker: `Quarterly check-in · ${period}`,
        title: 'Update your FIREcalc numbers',
        preheader: plan.kind === 'accumulation'
            ? `Your saved plan is ${pct(plan.progress)} of the way to ${money(plan.target)}.`
            : `Your saved retirement plan still had money on ${plan.successes} of ${plan.pathCount} paths.`,
        inner,
        why: 'You’re getting this quarterly check-in because you asked FIREcalc to email your saved plan.',
        postal,
        token
    });
    const text = textQuarterly({ plan, planUrl, token, postal, period });
    return { subject: 'Got 30 seconds to update your FIREcalc plan?', html, text };
}

function retirementLead(plan) {
    const of = `${plan.successes} of ${Number(plan.pathCount).toLocaleString('en-US')}`;
    const window = plan.historical ? 'historical windows' : 'shuffled paths';
    let ss = 'Social Security is off in this result.';
    if (plan.includeSS) ss = `Social Security is on in this result ($${Math.round(plan.ssMonthlyBenefit).toLocaleString('en-US')}/month at claim age ${plan.ssClaimingAge}).`;
    return `${money(plan.savings)} saved, spending ${money(plan.spending)} a year from age ${plan.age}, for ${plan.horizon} years. ${of} ${window} still had a balance at the end of every year. ${ss}`;
}

function textQuarterly({ plan, planUrl, token, postal, period }) {
    const lines = [
        `Quarterly check-in (${period})`,
        '',
        'Got 30 seconds?',
        'Open the saved plan and change the numbers that moved.',
        ''
    ];
    if (plan.kind === 'accumulation') {
        lines.push(`Progress: ${pct(plan.progress)} (${money(plan.savings)} of ${money(plan.target)}).`);
        lines.push(`Median: ${yearsLabel(plan.median, plan.medianAge)}.`);
        lines.push(`Faster 10% by ${plan.p10 == null ? '—' : plan.p10} years. Slower 10% at least ${plan.p90 == null ? '—' : plan.p90} years.`);
        lines.push(`${plan.reached} of ${plan.pathCount} paths reached the goal.`);
    } else {
        lines.push(retirementLead(plan).replace(/<[^>]+>/g, ''));
    }
    lines.push('', methodNote(plan), '', `Update my numbers: ${planUrl}`, '', footerText(token, postal));
    return lines.join('\n');
}

function limitCell(key, value, units) {
    const formatted = formatLimit(key, value, units);
    if (formatted) return esc(formatted);
    return '<span style="display:inline-block;background:#FFF5EA;color:#9A5214;border:1px dashed #EE8F3A;border-radius:6px;padding:1px 6px;font-size:12px;font-weight:600;">PLACEHOLDER</span>';
}

function limitsTable(current, prior) {
    const th = `style="padding:8px 6px;${F}font-size:12px;color:#5B6576;text-transform:uppercase;letter-spacing:.05em;font-weight:600;border-bottom:1px solid #E7E2D9;"`;
    const keys = ['deferral401k', 'catchUp50', 'catchUp60', 'ira', 'hsaSelf', 'hsaFamily', 'hsaCatchUp55', 'ssCola', 'ssWageBase'];
    let html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td ${th}>Limit</td><td align="right" ${th}>${prior.year}</td><td align="right" ${th}>${current.year}</td></tr>`;
    for (const key of keys) {
        const prev = prior.row ? prior.row[key] : null;
        const next = current.row ? current.row[key] : null;
        html += `<tr><td style="padding:9px 6px;border-bottom:1px solid #EFEBE4;${F}font-size:14px;color:#384254;">${esc(limitLabel(key))}</td><td align="right" style="padding:9px 6px;border-bottom:1px solid #EFEBE4;${F}font-size:14px;color:#5B6576;white-space:nowrap;">${limitCell(key, prev, prior.units || current.units)}</td><td align="right" style="padding:9px 6px;border-bottom:1px solid #EFEBE4;${F}font-size:14px;">${limitCell(key, next, current.units)}</td></tr>`;
    }
    return html + '</table>';
}

export function renderJanuary({ plan, planUrl, token, postal, year, prior, whatIf, limitsSource }) {
    const current = yearLimits(year, limitsSource);
    const prev = previousYearLimits(year, limitsSource);
    const sendable = current.complete;
    let inner = sec(`<h1 style="${D}font-size:28px;line-height:1.2;color:#1C2433;margin:0 0 12px;font-weight:600;">Your ${year - 1} checkpoint</h1>${p(`A new year is a good time to check the plan you saved. Here is where that link stands, and what is published for ${year}.`)}`, '30px 36px 4px');
    if (plan.kind === 'accumulation') {
        inner += sec(h2('Your saved plan') +
            `<p style="${F}font-size:13px;color:#384254;padding-bottom:6px;"><strong style="color:#0B6358;">${pct(plan.progress)}</strong> of ${money(plan.target)} (${money(plan.savings)}).</p>` +
            bar(Math.max(0, plan.progress * 100)) +
            '<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>' +
            (prior && prior.median != null
                ? table([
                    ['Invested', money(prior.savings), money(plan.savings)],
                    ['Median years', yearsLabel(prior.median, prior.medianAge), yearsLabel(plan.median, plan.medianAge)]
                ], 'Last snapshot', 'Saved now')
                : table(savingsRows(plan), 'Saved plan')) +
            note(prior ? 'The last snapshot is the plan from the previous email, not a guess about this year’s balance.' : 'There isn’t a snapshot from a year ago yet. This is the plan on the link today. ' + methodNote(plan)));
    } else {
        inner += sec(h2('Your saved retirement plan') + p(retirementLead(plan)) + note(methodNote(plan)));
    }
    inner += sec(h2(`What changed for ${year}`) + limitsTable(current, prev) +
        note(sendable
            ? (prev.complete
                ? 'Every figure in this table is filled from the reviewed limits file, with a source URL on each one.'
                : 'The current year is filled from the reviewed limits file. An earlier year shows PLACEHOLDER when that year is not in the file.')
            : `This January email is held until ${esc((current.missing || []).map(limitLabel).join(', '))} ${current.missing && current.missing.length === 1 ? 'is' : 'are'} filled in. ${esc(current.todo || '')}`));
    if (whatIf) {
        inner += sec(h2('One change worth a look') +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EAF6F3;border-radius:14px;"><tr><td style="padding:16px 18px;${F}">` +
            `<div style="font-size:12px;color:#0F7B6C;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:6px;">If the new savings went to the deferral limit</div>` +
            p(`The saved plan adds ${money(whatIf.contribution)} a year, income minus spending. The ${year} employee deferral limit is ${money(whatIf.limit)}. Raising the contribution to that limit is ${money(whatIf.gap)} more a year. The same calculator, with spending lower by that gap, is the right-hand column. The tax break on a pre-tax deferral is not in the model, so this understates that case.`, 14) +
            table([
                ['Median years', yearsLabel(whatIf.before.median, whatIf.before.medianAge), yearsLabel(whatIf.after.median, whatIf.after.medianAge)],
                ['Paths that reach the goal', `${whatIf.before.reached} of ${whatIf.before.pathCount}`, `${whatIf.after.reached} of ${whatIf.after.pathCount}`]
            ], 'Saved plan', 'At the deferral limit') +
            `</td></tr></table>`);
    } else if (plan.kind === 'accumulation' && current.row && current.row.deferral401k == null) {
        inner += sec(note(`The 401(k) comparison waits on the official ${year} deferral limit. It is not estimated here.`));
    }
    if (current.row && current.row.ssCola != null) {
        inner += sec(p(`<strong>Social Security:</strong> the ${formatLimit('ssCola', current.row.ssCola)} COLA is the published benefit adjustment. FIREcalc already measures Social Security in today’s dollars inside a retirement plan. Change the benefit on the link only if your statement changed.`, 14));
    }
    inner += button(planUrl, `Update my plan for ${year}`, 'Opens your saved plan. Enter the balance and contribution you have now.');
    inner += sec(note('The calculator on the site still runs in your browser. This email was filled in from the share link you saved.'), '4px 36px 28px');
    const html = shell({
        kicker: `Yearly checkpoint · ${year}`,
        title: `Your ${year} FIREcalc checkpoint`,
        preheader: sendable
            ? `Your saved plan, and the published ${year} limits.`
            : `Held: the ${year} retirement limits are not all published yet.`,
        inner,
        why: 'You’re getting this January checkpoint because you asked FIREcalc to email your saved plan. It replaces the January quarterly note.',
        postal,
        token
    });
    const text = [
        `January checkpoint ${year}`,
        '',
        plan.kind === 'accumulation'
            ? `Saved plan: ${pct(plan.progress)} (${money(plan.savings)} of ${money(plan.target)}). Median ${yearsLabel(plan.median, plan.medianAge)}.`
            : retirementLead(plan),
        '',
        `Limits for ${year}: ${sendable ? 'complete' : 'INCOMPLETE — this send is held.'}`,
        current.todo || '',
        '',
        `Update my plan: ${planUrl}`,
        '',
        footerText(token, postal)
    ].filter(Boolean).join('\n');
    return {
        subject: sendable ? `Your ${year} FIREcalc checkpoint` : `[held] ${year} FIREcalc checkpoint is waiting on official limits`,
        html,
        text,
        sendable,
        missing: current.missing
    };
}

function footerText(token, postal) {
    const address = postal && postal !== POSTAL_PLACEHOLDER ? postal : 'POSTAL ADDRESS NEEDED';
    return [
        'You’re getting this because you asked FIREcalc to email your saved plan.',
        `Unsubscribe: https://firecalc.ai/unsubscribe?token=${token}`,
        'Illustration, not a forecast. Not financial advice.',
        address,
        'firecalc.ai'
    ].join('\n');
}
