// Named historical stress packs for FIREcalc. DOM-free.
// A pack replays one real stretch of the embedded table through the same
// retirement trial the calculator uses (FirecalcSim.runRetirementTrial).
// It never invents a return: every year comes from FIRECALC_HISTORICAL,
// and a pack whose years fall outside that table is refused.
(function (root) {
    const PACKS = [
        {
            id: 'stagflation',
            name: 'Stagflation squeeze',
            villainLabel: 'Inflation',
            startYear: 1977,
            villainYears: [1977, 1981],
            copy: 'Retire into double-digit inflation. Over five years, prices rise faster than stocks or Treasuries.',
            note: 'The table starts in 1975, so this is the late-1970s stretch only. It is not 1966 or 1973–74.'
        },
        {
            id: 'rate-wall-81',
            name: 'Rate wall of ’81',
            villainLabel: 'Rates',
            startYear: 1981,
            villainYears: [1981, 1981],
            copy: 'Year one: stocks fall while inflation is still in double digits.'
        },
        {
            id: 'bond-rout-94',
            name: 'Bond rout of ’94',
            villainLabel: 'Bonds',
            startYear: 1994,
            villainYears: [1994, 1994],
            copy: 'Treasuries lose money and stocks go nowhere in your first year. Bond-heavy mixes feel it most.'
        },
        {
            id: 'dotcom',
            name: 'Dot-com hangover',
            villainLabel: 'Bubble burst',
            startYear: 2000,
            villainYears: [2000, 2002],
            copy: 'Three straight down years for stocks, starting the year you retire.'
        },
        {
            id: 'gfc',
            name: 'GFC crash',
            villainLabel: 'Crash',
            startYear: 2008,
            villainYears: [2008, 2008],
            copy: 'Retire into the worst stock year in the table.'
        },
        {
            id: 'rate-shock-22',
            name: '2022 rate shock',
            villainLabel: 'Stocks + bonds',
            startYear: 2022,
            villainYears: [2022, 2022],
            copy: 'Stocks and Treasuries fall together while inflation runs hot. The table ends in 2024, so this pack is short.'
        }
    ];

    const PACK_ID_RE = /^[a-z0-9-]{1,32}$/;

    function series(data) {
        return data || root.FIRECALC_HISTORICAL || [];
    }

    function sampleBounds(data) {
        const s = series(data);
        if (!s.length) return null;
        return { first: s[0].year, last: s[s.length - 1].year };
    }

    function isInSample(pack, data) {
        const b = sampleBounds(data);
        if (!b || !pack || !Array.isArray(pack.villainYears)) return false;
        const start = pack.startYear, v0 = pack.villainYears[0], v1 = pack.villainYears[1];
        if (![start, v0, v1].every(Number.isInteger)) return false;
        return start >= b.first && v0 >= start && v1 >= v0 && v1 <= b.last;
    }

    function availablePacks(data) {
        return PACKS.filter(p => isInSample(p, data));
    }

    function getPack(id, data) {
        if (typeof id !== 'string' || !PACK_ID_RE.test(id)) return null;
        const pack = PACKS.find(p => p.id === id);
        return pack && isInSample(pack, data) ? pack : null;
    }

    // Years run = the plan's horizon, never shorter than the villain stretch,
    // and never past the last row of the table.
    function packWindow(pack, horizonYears, data) {
        const s = series(data);
        if (!isInSample(pack, s)) return null;
        const b = sampleBounds(s);
        const requested = Math.max(1, horizonYears | 0);
        const minYears = pack.villainYears[1] - pack.startYear + 1;
        const available = b.last - pack.startYear + 1;
        const years = Math.min(available, Math.max(minYears, requested));
        const startIdx = s.findIndex(r => r.year === pack.startYear);
        const sequence = s.slice(startIdx, startIdx + years);
        for (let i = 0; i < sequence.length; i++) {
            if (sequence[i].year !== pack.startYear + i) return null;
        }
        return {
            startYear: pack.startYear,
            endYear: pack.startYear + years - 1,
            years: years,
            requested: requested,
            clippedBySample: requested > available,
            sequence: sequence
        };
    }

    function cumulative(rows, key) {
        return rows.reduce((acc, r) => acc * (1 + r[key]), 1) - 1;
    }

    function villainStats(pack, data) {
        const s = series(data);
        const rows = s.filter(r => r.year >= pack.villainYears[0] && r.year <= pack.villainYears[1]);
        return {
            from: pack.villainYears[0],
            to: pack.villainYears[1],
            stocks: cumulative(rows, 'marketReturn'),
            bonds: cumulative(rows, 'bondReturn'),
            inflation: cumulative(rows, 'inflation')
        };
    }

    function runPack(pack, input, opts) {
        opts = opts || {};
        const sim = opts.sim || root.FirecalcSim;
        const data = series(opts.data);
        const w = packWindow(pack, input.lifeExpectancy, data);
        if (!w || !sim) return null;
        const trialInput = Object.assign({}, input, { lifeExpectancy: w.years, returnMode: 'historical' });
        const trial = sim.runRetirementTrial(trialInput, w.sequence, opts.preTaxFn);
        const start = input.retirementSavings;
        const reals = trial.yearlyData.map(y => y.balance / y.cpi);
        let lowIdx = 0;
        for (let i = 1; i < reals.length; i++) if (reals[i] < reals[lowIdx]) lowIdx = i;
        const ratio = v => (start > 0 ? v / start : null);
        const last = trial.yearlyData[trial.yearlyData.length - 1];
        let verdict;
        if (trial.ranOutOfMoney) verdict = 'out';
        else if (start > 0 && trial.finalRealBalance >= start) verdict = 'ahead';
        else verdict = 'smaller';
        return {
            pack: pack,
            window: w,
            trial: trial,
            verdict: verdict,
            survived: !trial.ranOutOfMoney,
            startBalance: start,
            endReal: trial.finalRealBalance,
            endMultiple: ratio(trial.finalRealBalance),
            low: reals.length ? { real: reals[lowIdx], multiple: ratio(reals[lowIdx]), year: trial.yearlyData[lowIdx].calendarYear } : null,
            ranOutYear: trial.ranOutOfMoney && last ? last.calendarYear : null,
            ranOutAge: trial.ranOutOfMoney ? input.retirementAge + trial.yearsLasted : null,
            yearsLasted: trial.yearsLasted,
            path: [1].concat(reals.map(v => (start > 0 ? v / start : 0))),
            spendRate: start > 0 ? input.annualWithdrawal / start : null,
            stockAllocation: input.stockAllocation,
            otherIncome: !!(input.includeSS || input.includeSpouseSS || input.includeOtherIncome),
            villain: villainStats(pack, data)
        };
    }

    function runGauntlet(input, opts) {
        opts = opts || {};
        const results = availablePacks(opts.data).map(p => runPack(p, input, opts)).filter(Boolean);
        const survived = results.filter(r => r.survived).length;
        let toughest = null;
        results.forEach(r => {
            if (!toughest) { toughest = r; return; }
            if (r.survived !== toughest.survived) { if (!r.survived) toughest = r; return; }
            if (!r.survived) { if (r.yearsLasted < toughest.yearsLasted) toughest = r; return; }
            const a = r.low ? r.low.multiple : 0, b = toughest.low ? toughest.low.multiple : 0;
            if (a < b) toughest = r;
        });
        return { results: results, survived: survived, total: results.length, toughest: toughest };
    }

    function signedPct(x, digits) {
        const d = digits == null ? 1 : digits;
        const v = Math.abs(x * 100).toFixed(d);
        return `${x < 0 && Number(v) !== 0 ? '−' : '+'}${v}%`;
    }

    function fmtMultiple(m) {
        if (m == null || !isFinite(m)) return '–';
        return `${m >= 10 ? m.toFixed(0) : m.toFixed(2)}×`;
    }

    function yearsLabel(w) {
        return w.startYear === w.endYear ? String(w.startYear) : `${w.startYear}–${w.endYear}`;
    }

    function villainYearsLabel(pack) {
        const v = pack.villainYears;
        return v[0] === v[1] ? String(v[0]) : `${v[0]}–${v[1]}`;
    }

    function verdictText(result) {
        if (result.verdict === 'out') return { tag: 'Knocked out', headline: `Ran out in ${result.ranOutYear}`, sub: `Lasted ${result.yearsLasted} of ${result.window.years} years, to age ${result.ranOutAge}.` };
        if (result.verdict === 'ahead') return { tag: 'Survived', headline: 'Survived', sub: 'Ended with more purchasing power than it started with.' };
        return { tag: 'Survived, smaller', headline: 'Survived', sub: 'Money lasted, but ended with less purchasing power than it started with.' };
    }

    // Every pack states the exact years it ran, and why it may be shorter than the plan.
    function yearsDisclosure(result, retirementAge) {
        const w = result.window;
        let text = `Years used: ${yearsLabel(w)} (${w.years} ${w.years === 1 ? 'year' : 'years'}), in the order they happened.`;
        if (w.clippedBySample) {
            text += ` Your plan is ${w.requested} years. The table ends in 2024, so this pack tests ${w.years}.`;
        } else if (w.years > w.requested) {
            text += ` That is longer than your ${w.requested}-year plan, so the whole villain stretch is included.`;
        }
        if (retirementAge != null) text += ` Retirement starts at age ${retirementAge} in ${w.startYear}.`;
        return text;
    }

    function notOfferedNote(data) {
        const s = series(data);
        const row = y => s.find(r => r.year === y);
        const b = sampleBounds(s);
        let text = `No pack for 1966 or 1973–74: those years are before the ${b ? b.first : 1975} start of the table.`;
        const r87 = row(1987), r20 = row(2020);
        if (r87 && r20) {
            text += ` No pack for Black Monday or the COVID crash either. In this annual table, stocks returned ${signedPct(r87.marketReturn)} in 1987 and ${signedPct(r20.marketReturn)} in 2020, so those drops do not show up as down years.`;
        }
        return text;
    }

    function escapeXml(text) {
        return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    const CARD_COLORS = {
        ahead: { ink: '#0B6358', wash: '#EAF6F3', line: '#0F7B6C' },
        smaller: { ink: '#9A5214', wash: '#FFF5EA', line: '#EE8F3A' },
        out: { ink: '#A53A2C', wash: '#FDF0ED', line: '#D0503F' }
    };

    // 1200×630 (Open Graph size). Shows ratios and rates, not dollar amounts.
    function shareCardSvg(result, opts) {
        opts = opts || {};
        const W = 1200, H = 630;
        const pack = result.pack, w = result.window;
        const v = verdictText(result);
        const col = CARD_COLORS[result.verdict] || CARD_COLORS.smaller;
        const link = opts.linkText || `firecalc.ai/?pack=${pack.id}`;
        const sans = 'Inter, Helvetica Neue, Helvetica, Arial, sans-serif';
        const serif = 'Fraunces, Georgia, Times New Roman, serif';
        const e = escapeXml;

        const px = 662, py = 286, pw = 456, ph = 186;
        const pts = result.path;
        const n = Math.max(1, pts.length - 1);
        const yMax = Math.max(1.25, Math.max.apply(null, pts) * 1.1);
        const X = i => px + (i / n) * pw;
        const Y = val => py + ph - (Math.max(0, val) / yMax) * ph;
        const line = pts.map((val, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(val).toFixed(1)}`).join(' ');
        const area = `${line} L${X(n).toFixed(1)} ${(py + ph).toFixed(1)} L${X(0).toFixed(1)} ${(py + ph).toFixed(1)} Z`;
        const bx0 = X(pack.villainYears[0] - w.startYear), bx1 = X(Math.min(n, pack.villainYears[1] - w.startYear + 1));
        const startY = Y(1);
        const lastX = X(n), lastY = Y(pts[n]);
        const outMark = result.verdict === 'out'
            ? `<path d="M${lastX - 9} ${lastY - 9} L${lastX + 9} ${lastY + 9} M${lastX + 9} ${lastY - 9} L${lastX - 9} ${lastY + 9}" stroke="#D0503F" stroke-width="4" stroke-linecap="round"/>`
            : `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="7" fill="#fff" stroke="${col.line}" stroke-width="4"/>`;

        const plan = [
            result.spendRate != null ? `${(result.spendRate * 100).toFixed(1)}% spending` : null,
            `${Math.round(result.stockAllocation * 100)}% stocks`,
            result.otherIncome ? 'SS / other income on' : 'portfolio only'
        ].filter(Boolean).join(' · ');
        const stats = result.verdict === 'out'
            ? [['Lasted', `${result.yearsLasted} of ${w.years} years`], ['Ran out at', `age ${result.ranOutAge}`], ['Plan', plan]]
            : [['Ended at', `${fmtMultiple(result.endMultiple)} its start, in today’s dollars`], ['Low point', result.low ? `${fmtMultiple(result.low.multiple)} at the end of ${result.low.year}` : '–'], ['Plan', plan]];
        const statRows = stats.map((s, i) => `<text x="64" y="${440 + i * 32}" font-family="${sans}" font-size="20" fill="#384254"><tspan font-weight="600" fill="#5B6576">${e(s[0])}</tspan><tspan dx="10">${e(s[1])}</tspan></text>`).join('');
        const tagW = Math.round(e(v.tag).length * 9.6 + 34);

        return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(`${pack.name}, ${yearsLabel(w)}: ${v.headline}`)}">
<defs>
<radialGradient id="fcGlowA" cx="0.06" cy="0" r="0.6"><stop offset="0" stop-color="#FCD3A0" stop-opacity=".55"/><stop offset="1" stop-color="#FCD3A0" stop-opacity="0"/></radialGradient>
<radialGradient id="fcGlowB" cx="0.96" cy="0" r="0.55"><stop offset="0" stop-color="#BEDEF6" stop-opacity=".6"/><stop offset="1" stop-color="#BEDEF6" stop-opacity="0"/></radialGradient>
<radialGradient id="fcGlowC" cx="0.5" cy="1.1" r="0.6"><stop offset="0" stop-color="#CFEAE4" stop-opacity=".6"/><stop offset="1" stop-color="#CFEAE4" stop-opacity="0"/></radialGradient>
<linearGradient id="fcSun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBC77A"/><stop offset="1" stop-color="#EE8F3A"/></linearGradient>
<linearGradient id="fcArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col.line}" stop-opacity=".22"/><stop offset="1" stop-color="${col.line}" stop-opacity=".02"/></linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="#FAF8F4"/>
<rect width="${W}" height="${H}" fill="url(#fcGlowA)"/>
<rect width="${W}" height="${H}" fill="url(#fcGlowB)"/>
<rect width="${W}" height="${H}" fill="url(#fcGlowC)"/>
<g transform="translate(64 52)"><rect width="40" height="40" rx="11" fill="#0F7B6C"/><circle cx="20" cy="24.4" r="9.4" fill="url(#fcSun)"/><rect x="3.8" y="24.4" width="32.4" height="12.5" fill="#0F7B6C"/><path d="M6.9 30.6l6.9-3.5 5.7 2.2 7-6.7 6.6-3.3" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>
<text x="116" y="82" font-family="${serif}" font-size="28" font-weight="600" fill="#1C2433">FIREcalc</text>
<rect x="836" y="54" width="300" height="36" rx="18" fill="#FFFFFF" stroke="#E7E2D9"/>
<text x="986" y="78" text-anchor="middle" font-family="${sans}" font-size="15" font-weight="700" letter-spacing="1.6" fill="#5B6576">HISTORICAL STRESS PACK</text>
<text x="64" y="172" font-family="${serif}" font-size="60" font-weight="560" fill="#1C2433">${e(pack.name)}</text>
<text x="64" y="214" font-family="${sans}" font-size="22" fill="#5B6576">${e(`Villain: ${pack.villainLabel.toLowerCase()} · ${yearsLabel(w)}, ${w.years} ${w.years === 1 ? 'year' : 'years'} of real US returns`)}</text>
<rect x="64" y="250" width="${tagW}" height="34" rx="17" fill="${col.wash}"/>
<circle cx="84" cy="267" r="5" fill="${col.line}"/>
<text x="98" y="273" font-family="${sans}" font-size="16" font-weight="700" fill="${col.ink}">${e(v.tag)}</text>
<text x="64" y="350" font-family="${sans}" font-size="56" font-weight="700" letter-spacing="-1.5" fill="#1C2433">${e(v.headline)}</text>
<text x="64" y="390" font-family="${sans}" font-size="20" fill="#384254">${e(v.sub)}</text>
${statRows}
<rect x="640" y="240" width="496" height="268" rx="22" fill="#FFFFFF" stroke="#EFEBE4"/>
<text x="662" y="270" font-family="${sans}" font-size="14" font-weight="700" letter-spacing="1.2" fill="#636B7A">BALANCE VS. START, TODAY’S DOLLARS</text>
<rect x="${bx0.toFixed(1)}" y="${py}" width="${Math.max(4, bx1 - bx0).toFixed(1)}" height="${ph}" fill="#FCE3C8" opacity=".55"/>
<text x="${(bx0 + 6).toFixed(1)}" y="${py + 16}" font-family="${sans}" font-size="13" font-weight="700" fill="#9A5214">${e(villainYearsLabel(pack))}</text>
<line x1="${px}" y1="${startY.toFixed(1)}" x2="${px + pw}" y2="${startY.toFixed(1)}" stroke="#9AA3B2" stroke-width="2" stroke-dasharray="6 6"/>
<text x="${px + pw}" y="${(startY - 8).toFixed(1)}" text-anchor="end" font-family="${sans}" font-size="13" font-weight="600" fill="#5B6576">Start 1.00×</text>
<line x1="${px}" y1="${py + ph}" x2="${px + pw}" y2="${py + ph}" stroke="#1C2433" stroke-opacity=".12" stroke-width="1.5"/>
<path d="${area}" fill="url(#fcArea)"/>
<path d="${line}" fill="none" stroke="${col.line}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
${outMark}
<text x="${px}" y="${py + ph + 24}" font-family="${sans}" font-size="14" fill="#636B7A">${w.startYear}</text>
<text x="${px + pw}" y="${py + ph + 24}" text-anchor="end" font-family="${sans}" font-size="14" fill="#636B7A">${w.endYear}</text>
<line x1="64" y1="540" x2="1136" y2="540" stroke="#E7E2D9" stroke-width="1.5"/>
<text x="64" y="572" font-family="${sans}" font-size="16" fill="#5B6576">Illustration, not advice. One real path from annual US data, 1975–2024:</text>
<text x="64" y="596" font-family="${sans}" font-size="16" fill="#5B6576">S&amp;P 500 and 10-yr Treasury total returns, with CPI. Not a forecast.</text>
<text x="1136" y="570" text-anchor="end" font-family="${sans}" font-size="15" fill="#5B6576">Run your own plan</text>
<text x="1136" y="598" text-anchor="end" font-family="${sans}" font-size="22" font-weight="700" fill="#0B6358">${e(link)}</text>
</svg>`;
    }

    root.FirecalcPacks = {
        PACKS: PACKS,
        PACK_ID_RE: PACK_ID_RE,
        sampleBounds: sampleBounds,
        isInSample: isInSample,
        availablePacks: availablePacks,
        getPack: getPack,
        packWindow: packWindow,
        villainStats: villainStats,
        runPack: runPack,
        runGauntlet: runGauntlet,
        signedPct: signedPct,
        fmtMultiple: fmtMultiple,
        yearsLabel: yearsLabel,
        villainYearsLabel: villainYearsLabel,
        verdictText: verdictText,
        yearsDisclosure: yearsDisclosure,
        notOfferedNote: notOfferedNote,
        escapeXml: escapeXml,
        shareCardSvg: shareCardSvg
    };
})(typeof window !== 'undefined' ? window : globalThis);
