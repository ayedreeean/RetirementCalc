// DOM-free share links and summary stats for FIREcalc.
// The trial math stays in market-data.js (FirecalcSim). This file does not
// read the page, and it does not run on a server in production.
// The calculator (app.js) calls these helpers so a share URL built here
// matches a share URL copied from the site.
(function (root) {
    const MAX_ACCUMULATION_YEARS = 50;

    // Same claiming factors as app.js (full retirement age 67).
    const SS_AGE_FACTORS = {
        62: 0.70, 63: 0.75, 64: 0.80, 65: 0.8667,
        66: 0.9333, 67: 1.00, 68: 1.08, 69: 1.16, 70: 1.24
    };

    const SAVINGS_FIELDS = [
        'currentAge', 'currentSavings', 'income', 'expenses', 'targetAmount',
        'stockAllocation', 'incomeGrowth', 'savingsSimulationCount', 'savingsReturnMode'
    ];
    const RETIREMENT_FIELDS = [
        'retirementAge', 'retirementSavings', 'annualWithdrawal', 'retirementStockAllocation',
        'taxRate', 'retirementLifeExpectancy', 'simulationCount', 'retirementReturnMode',
        'ssMonthlyBenefit', 'ssClaimingAge', 'spouseSSMonthlyBenefit', 'spouseSSClaimingAge',
        'monthlyPension', 'pensionStartAge', 'monthlyOtherIncome', 'otherIncomeDuration'
    ];
    const RETIREMENT_CHECKS = [
        'withdrawalAdjustment', 'includeSS', 'includeSpouseSS', 'includeOtherIncome'
    ];
    const TAX_FIELDS = [
        'taxMode', 'taxFilingStatus', 'taxPreTaxPct', 'taxRothPct', 'taxTaxablePct',
        'taxOptimizeOrder', 'taxStateRate'
    ];
    // Stress pack ids are checked against the pack list (stress-packs.js) before use.
    const PACK_ID_RE = /^[a-z0-9-]{1,32}$/;
    const PACK_ONLY_KEYS = ['pack', 'tab'];

    function validPackId(id) {
        return typeof id === 'string' && PACK_ID_RE.test(id) ? id : null;
    }

    function quantileSorted(arr, q) {
        if (!arr.length) return null;
        return arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
    }

    function byYearsToTarget(a, b) {
        if (a.yearsToTarget == null && b.yearsToTarget == null) return 0;
        if (a.yearsToTarget == null) return 1;
        if (b.yearsToTarget == null) return -1;
        return a.yearsToTarget - b.yearsToTarget;
    }

    function summarizeSavings(sims, maxYears) {
        const horizon = maxYears == null ? MAX_ACCUMULATION_YEARS : maxYears;
        const sorted = [...sims].sort(byYearsToTarget);
        const n = sorted.length;
        const medianSim = sorted[Math.floor(n * 0.5)];
        const p10Sim = sorted[Math.floor(n * 0.1)];
        const p90Sim = sorted[Math.min(n - 1, Math.floor(n * 0.9))];
        const counts = new Array(horizon + 1).fill(0);
        let reached = 0;
        sims.forEach(s => {
            if (s.yearsToTarget != null) { reached++; counts[Math.min(horizon, s.yearsToTarget)]++; }
        });
        const cdf = [];
        let run = 0;
        for (let y = 0; y <= horizon; y++) { run += counts[y]; cdf.push(run / n * 100); }
        return {
            sorted, n, medianSim,
            median: medianSim.yearsToTarget,
            p10: p10Sim.yearsToTarget,
            p90: p90Sim.yearsToTarget,
            reached, reachedPct: reached / n * 100,
            counts, cdf
        };
    }

    function summarizeRetirement(sims, inp) {
        const n = sims.length;
        const L = inp.lifeExpectancy;
        const successes = sims.filter(s => !s.ranOutOfMoney).length;
        const successRate = successes / n * 100;

        const pctl = { real: { p10: [], p25: [], p50: [], p75: [], p90: [] }, nominal: { p10: [], p25: [], p50: [], p75: [], p90: [] } };
        const survival = [];
        const nomBuf = new Float64Array(n);
        const realBuf = new Float64Array(n);
        for (let k = 0; k <= L; k++) {
            let alive = 0;
            for (let s = 0; s < n; s++) {
                const sim = sims[s];
                if (k === 0) { nomBuf[s] = inp.retirementSavings; realBuf[s] = inp.retirementSavings; }
                else {
                    const yd = sim.yearlyData[k - 1];
                    nomBuf[s] = yd ? yd.balance : 0;
                    realBuf[s] = yd ? yd.balance / yd.cpi : 0;
                }
                if (!sim.ranOutOfMoney || sim.yearsLasted > k) alive++;
            }
            survival.push(alive / n * 100);
            const ns = Float64Array.from(nomBuf).sort();
            const rs = Float64Array.from(realBuf).sort();
            [['p10', .1], ['p25', .25], ['p50', .5], ['p75', .75], ['p90', .9]].forEach(([key, q]) => {
                pctl.nominal[key].push(quantileSorted(ns, q));
                pctl.real[key].push(quantileSorted(rs, q));
            });
        }

        const endingBalances = sims.map(s => s.finalBalance).sort((a, b) => a - b);
        const medianEndingBalance = endingBalances[Math.floor(n * 0.5)];
        const endingReal = sims.map(s => s.finalRealBalance).sort((a, b) => a - b);
        const medianEndingReal = endingReal[Math.floor(n * 0.5)];

        let totalReturn = 0, returnCount = 0;
        sims.forEach(sim => sim.yearlyData.forEach(y => { totalReturn += y.return; returnCount++; }));
        const avgReturn = returnCount > 0 ? totalReturn / returnCount : 0;

        const sortedByWithdrawals = [...sims].sort((a, b) => a.totalWithdrawn - b.totalWithdrawn);
        const medianWithdrawals = sortedByWithdrawals[Math.floor(n * 0.5)].totalWithdrawn;

        const yearsLasted = sims.filter(s => s.ranOutOfMoney).map(s => s.yearsLasted).sort((a, b) => a - b);
        const worstCaseYears = yearsLasted.length > 0 ? yearsLasted[Math.floor(yearsLasted.length * 0.1)] : null;
        const earliestDepletion = yearsLasted.length ? yearsLasted[0] : null;

        const hasIncome = sims.some(s => s.totalIncomeReceived > 0);
        let coveragePct = null;
        if (hasIncome) {
            const medianSim = sortedByWithdrawals[Math.floor(n * 0.5)];
            const totalExpensesPT = medianSim.yearlyData.reduce((s, y) => s + y.withdrawal + y.totalIncome, 0);
            coveragePct = totalExpensesPT > 0 ? (medianSim.totalIncomeReceived / totalExpensesPT * 100) : 0;
        }

        let toughest = null;
        if (inp.returnMode === 'historical') {
            toughest = [...sims].sort((a, b) => {
                if (a.ranOutOfMoney !== b.ranOutOfMoney) return a.ranOutOfMoney ? -1 : 1;
                if (a.ranOutOfMoney) return a.yearsLasted - b.yearsLasted;
                return a.finalRealBalance - b.finalRealBalance;
            })[0];
        }

        const sortedByBalance = [...sims].sort((a, b) => a.finalBalance - b.finalBalance);
        const medianSim = sortedByBalance[Math.floor(n / 2)];

        return {
            n, L, successes, successRate, pctl, survival,
            medianEndingBalance, medianEndingReal, avgReturn, medianWithdrawals,
            worstCaseYears, earliestDepletion, hasIncome, coveragePct, toughest, medianSim
        };
    }

    function asParams(input) {
        if (input instanceof URLSearchParams) return input;
        const text = String(input || '').trim();
        if (/^https?:\/\//i.test(text)) return new URL(text).searchParams;
        return new URLSearchParams(text.replace(/^\?/, ''));
    }

    function buildShareParams(spec) {
        const params = new URLSearchParams();
        const values = spec.values || {};
        const checks = spec.checks || {};
        const append = (key, value) => params.append(key, value == null ? '' : String(value));
        if (spec.tab === 'retirement') {
            append('tab', 'retirement');
            ['retirementAge', 'retirementSavings', 'annualWithdrawal', 'retirementStockAllocation'].forEach(id => append(id, values[id]));
            append('withdrawalAdjustment', checks.withdrawalAdjustment);
            append('taxRate', values.taxRate);
            (spec.taxEntries || []).forEach(pair => params.append(pair[0], pair[1]));
            ['retirementLifeExpectancy', 'simulationCount', 'retirementReturnMode'].forEach(id => append(id, values[id]));
            append('includeSS', checks.includeSS);
            append('ssMonthlyBenefit', values.ssMonthlyBenefit);
            append('ssClaimingAge', values.ssClaimingAge);
            append('includeSpouseSS', checks.includeSpouseSS);
            append('spouseSSMonthlyBenefit', values.spouseSSMonthlyBenefit);
            append('spouseSSClaimingAge', values.spouseSSClaimingAge);
            append('includeOtherIncome', checks.includeOtherIncome);
            append('monthlyPension', values.monthlyPension);
            append('pensionStartAge', values.pensionStartAge);
            append('monthlyOtherIncome', values.monthlyOtherIncome);
            append('otherIncomeDuration', values.otherIncomeDuration);
            append('seed', spec.seed);
            if (validPackId(spec.pack)) append('pack', spec.pack);
        } else {
            append('tab', 'accumulation');
            SAVINGS_FIELDS.forEach(id => append(id, values[id]));
            append('seed', spec.seed);
        }
        return params;
    }

    function shareUrl(spec) {
        const origin = String(spec.origin || 'https://firecalc.ai').replace(/\/$/, '');
        const path = spec.pathname || '/';
        return `${origin}${path}?${buildShareParams(spec).toString()}`;
    }

    function parseShareParams(input) {
        const params = asParams(input);
        const keys = [...params.keys()];
        if (!keys.length) return { empty: true, kind: null, values: {}, checks: {}, tax: {}, seed: null, pack: null, packRequested: null };
        let kind = null;
        if (params.get('tab') === 'retirement') kind = 'retirement';
        else if (params.has('tab') || params.has('currentAge')) kind = 'accumulation';
        else if (params.has('pack')) kind = 'retirement';
        const values = {};
        const fields = kind === 'retirement' ? RETIREMENT_FIELDS : kind === 'accumulation' ? SAVINGS_FIELDS : [];
        fields.forEach(id => { if (params.has(id)) values[id] = params.get(id); });
        const checks = {};
        if (kind === 'retirement') {
            RETIREMENT_CHECKS.forEach(id => { if (params.has(id)) checks[id] = params.get(id) === 'true'; });
        }
        const tax = {};
        TAX_FIELDS.forEach(id => { if (params.has(id)) tax[id] = params.get(id); });
        const seedNum = parseInt(params.get('seed'), 10);
        const packRequested = params.has('pack') ? params.get('pack') : null;
        return {
            empty: false, kind, values, checks, tax, seed: seedNum > 0 ? seedNum : null,
            pack: kind === 'retirement' ? validPackId(packRequested) : null,
            packRequested: packRequested
        };
    }

    // A challenge link names a pack and nothing else, so it carries no one's numbers.
    function challengeUrl(packId, origin) {
        const id = validPackId(packId);
        if (!id) return null;
        const base = String(origin || 'https://firecalc.ai').replace(/\/$/, '');
        return `${base}/?pack=${id}`;
    }

    function isPackOnly(input) {
        const params = asParams(input);
        const keys = [...params.keys()];
        return keys.includes('pack') && keys.every(k => PACK_ONLY_KEYS.includes(k)) && params.get('tab') !== 'accumulation';
    }

    function savingsShareUrl(config, origin) {
        const c = config || {};
        return shareUrl({
            origin: origin,
            tab: 'accumulation',
            seed: c.seed,
            values: {
                currentAge: c.currentAge,
                currentSavings: c.currentSavings,
                income: c.income,
                expenses: c.expenses,
                targetAmount: c.targetAmount,
                stockAllocation: c.stockAllocationPercent,
                incomeGrowth: c.incomeGrowthPercent,
                savingsSimulationCount: c.simulationCount,
                savingsReturnMode: c.returnMode
            }
        });
    }

    function retirementShareUrl(config, origin) {
        const c = config || {};
        const taxMode = c.taxMode || 'simple';
        const taxEntries = [['taxMode', taxMode]];
        if (taxMode === 'detailed') {
            taxEntries.push(
                ['taxFilingStatus', c.taxFilingStatus || 'mfj'],
                ['taxPreTaxPct', c.preTaxPercent == null ? 60 : c.preTaxPercent],
                ['taxRothPct', c.rothPercent == null ? 20 : c.rothPercent],
                ['taxTaxablePct', c.taxablePercent == null ? 20 : c.taxablePercent],
                ['taxOptimizeOrder', c.optimizeOrder !== false],
                ['taxStateRate', c.stateTaxPercent == null ? 0 : c.stateTaxPercent]
            );
        }
        return shareUrl({
            origin: origin,
            tab: 'retirement',
            seed: c.seed,
            pack: c.pack,
            taxEntries: taxEntries,
            checks: {
                withdrawalAdjustment: !!c.adjustForInflation,
                includeSS: !!c.includeSS,
                includeSpouseSS: !!c.includeSpouseSS,
                includeOtherIncome: !!c.includeOtherIncome
            },
            values: {
                retirementAge: c.retirementAge,
                retirementSavings: c.retirementSavings,
                annualWithdrawal: c.annualWithdrawal,
                retirementStockAllocation: c.stockAllocationPercent,
                taxRate: c.taxRatePercent,
                retirementLifeExpectancy: c.horizonYears,
                simulationCount: c.simulationCount,
                retirementReturnMode: c.returnMode,
                ssMonthlyBenefit: c.ssMonthlyBenefit,
                ssClaimingAge: c.ssClaimingAge,
                spouseSSMonthlyBenefit: c.spouseSSMonthlyBenefit,
                spouseSSClaimingAge: c.spouseSSClaimingAge,
                monthlyPension: c.monthlyPension,
                pensionStartAge: c.pensionStartAge,
                monthlyOtherIncome: c.monthlyOtherIncome,
                otherIncomeDuration: c.otherIncomeDuration
            }
        });
    }

    root.FirecalcIO = {
        MAX_ACCUMULATION_YEARS: MAX_ACCUMULATION_YEARS,
        SS_AGE_FACTORS: SS_AGE_FACTORS,
        SAVINGS_FIELDS: SAVINGS_FIELDS,
        RETIREMENT_FIELDS: RETIREMENT_FIELDS,
        RETIREMENT_CHECKS: RETIREMENT_CHECKS,
        TAX_FIELDS: TAX_FIELDS,
        PACK_ID_RE: PACK_ID_RE,
        validPackId: validPackId,
        challengeUrl: challengeUrl,
        isPackOnly: isPackOnly,
        quantileSorted: quantileSorted,
        summarizeSavings: summarizeSavings,
        summarizeRetirement: summarizeRetirement,
        buildShareParams: buildShareParams,
        shareUrl: shareUrl,
        parseShareParams: parseShareParams,
        savingsShareUrl: savingsShareUrl,
        retirementShareUrl: retirementShareUrl
    };
})(typeof window !== 'undefined' ? window : globalThis);
