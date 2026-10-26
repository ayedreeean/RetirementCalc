import { getEngine } from './engine.js';
import { money } from './limits.js';

const PATH_CAP = 1000;

function num(value, fallback = NaN) {
    if (value == null || value === '') return fallback;
    const n = parseFloat(String(value).replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : fallback;
}

function int(value, fallback) {
    const n = parseInt(String(value ?? ''), 10);
    return Number.isFinite(n) ? n : fallback;
}

function checked(checks, id, fallback) {
    if (!checks || !Object.prototype.hasOwnProperty.call(checks, id)) return fallback;
    return !!checks[id];
}

function taxSettings(parsed) {
    const tax = parsed.tax || {};
    if ((tax.taxMode || 'simple') !== 'detailed') {
        return { taxMode: 'simple', flatRate: num(parsed.values.taxRate, 0) / 100 };
    }
    return {
        taxMode: 'detailed',
        filingStatus: tax.taxFilingStatus || 'mfj',
        preTaxPct: num(tax.taxPreTaxPct, 60),
        rothPct: num(tax.taxRothPct, 20),
        taxablePct: num(tax.taxTaxablePct, 20),
        optimizeOrder: tax.taxOptimizeOrder !== 'false',
        stateTaxRate: num(tax.taxStateRate, 0)
    };
}

function preTaxFn(settings, calculateWithdrawalTax) {
    if (!settings || settings.taxMode === 'simple') return null;
    return (spend, income) => calculateWithdrawalTax(spend, income, settings).preTaxWithdrawal;
}

export function evaluatePlan(planUrl) {
    const { Sim, IO, data, calculateWithdrawalTax } = getEngine();
    const parsed = IO.parseShareParams(planUrl);
    if (!parsed || parsed.empty || !parsed.kind) {
        return { ok: false, reason: 'That share link does not contain a plan.' };
    }
    const seed = parsed.seed || 246813;
    const seedNote = parsed.seed ? null : 'The link had no seed, so this email used seed 246813.';
    if (parsed.kind === 'accumulation') return evaluateSavings(parsed, { Sim, IO, data, seed, seedNote });
    return evaluateRetirement(parsed, { Sim, IO, data, seed, seedNote, calculateWithdrawalTax });
}

function evaluateSavings(parsed, ctx) {
    const v = parsed.values;
    const asked = int(v.savingsSimulationCount, 1000);
    const simulationCount = Math.min(PATH_CAP, Math.max(1, asked));
    const input = {
        currentAge: int(v.currentAge, NaN),
        currentSavings: num(v.currentSavings),
        income: num(v.income),
        expenses: num(v.expenses),
        targetAmount: num(v.targetAmount),
        stockAllocation: num(v.stockAllocation) / 100,
        incomeGrowth: num(v.incomeGrowth, 0) / 100,
        returnMode: v.savingsReturnMode || 'shuffled',
        simulationCount,
        maxYears: 50
    };
    if ([input.currentAge, input.currentSavings, input.income, input.expenses, input.targetAmount, input.stockAllocation].some(n => !Number.isFinite(n))) {
        return { ok: false, reason: 'The savings link is missing a number the calculator needs.' };
    }
    if (input.targetAmount <= 0) return { ok: false, reason: 'The savings goal is missing.' };
    const rng = ctx.Sim.seededRandom(ctx.seed);
    const sequences = ctx.Sim.buildSequences(ctx.data, input.returnMode, 50, simulationCount, false, rng);
    const sims = sequences.map(seq => ctx.Sim.runAccumulationTrial(input, seq));
    const summary = ctx.IO.summarizeSavings(sims, 50);
    const reachedYears = sims.map(s => s.yearsToTarget).filter(y => y != null);
    const meanYears = reachedYears.length ? reachedYears.reduce((a, b) => a + b, 0) / reachedYears.length : null;
    const progress = input.currentSavings / input.targetAmount;
    const medianAge = summary.median == null ? null : input.currentAge + summary.median;
    const chanceByMedian = summary.median == null ? null : summary.cdf[Math.min(50, summary.median)];
    return {
        ok: true,
        kind: 'accumulation',
        seed: ctx.seed,
        seedNote: ctx.seedNote,
        capped: asked > PATH_CAP,
        pathCount: summary.n,
        returnMode: input.returnMode,
        age: input.currentAge,
        savings: input.currentSavings,
        income: input.income,
        expenses: input.expenses,
        target: input.targetAmount,
        contribution: Math.max(0, input.income - input.expenses),
        progress,
        median: summary.median,
        p10: summary.p10,
        p90: summary.p90,
        meanYears,
        reached: summary.reached,
        reachedPct: summary.reachedPct,
        medianAge,
        chanceByMedian,
        pack: null
    };
}

function evaluateRetirement(parsed, ctx) {
    const v = parsed.values;
    const checks = parsed.checks || {};
    if (!v.retirementSavings && !v.annualWithdrawal && !v.retirementAge) {
        return { ok: false, reason: 'That link does not include a retirement plan.' };
    }
    const asked = int(v.simulationCount, 1000);
    const simulationCount = Math.min(PATH_CAP, Math.max(1, asked));
    const includeSS = checked(checks, 'includeSS', false);
    const includeSpouseSS = checked(checks, 'includeSpouseSS', false);
    const includeOtherIncome = checked(checks, 'includeOtherIncome', false);
    const ssClaimingAge = int(v.ssClaimingAge, 67);
    const spouseSSClaimingAge = int(v.spouseSSClaimingAge, 67);
    const factor = age => ctx.IO.SS_AGE_FACTORS[age] || 1;
    const input = {
        retirementAge: int(v.retirementAge, NaN),
        retirementSavings: num(v.retirementSavings),
        annualWithdrawal: num(v.annualWithdrawal),
        adjustForInflation: checked(checks, 'withdrawalAdjustment', true),
        taxRate: num(v.taxRate, 0) / 100,
        stockAllocation: num(v.retirementStockAllocation, NaN) / 100,
        lifeExpectancy: int(v.retirementLifeExpectancy, NaN),
        returnMode: v.retirementReturnMode || 'shuffled',
        includeSS,
        ssClaimingAge,
        ssAnnualBase: includeSS ? num(v.ssMonthlyBenefit, 0) * factor(ssClaimingAge) * 12 : 0,
        includeSpouseSS,
        spouseSSClaimingAge,
        spouseSSAnnualBase: includeSpouseSS ? num(v.spouseSSMonthlyBenefit, 0) * factor(spouseSSClaimingAge) * 12 : 0,
        includeOtherIncome,
        annualPension: includeOtherIncome ? num(v.monthlyPension, 0) * 12 : 0,
        annualOtherIncome: includeOtherIncome ? num(v.monthlyOtherIncome, 0) * 12 : 0,
        pensionStartAge: int(v.pensionStartAge, 65),
        otherIncomeDuration: int(v.otherIncomeDuration, 0),
        ssMonthlyBenefit: num(v.ssMonthlyBenefit, 0),
        spouseSSMonthlyBenefit: num(v.spouseSSMonthlyBenefit, 0)
    };
    if ([input.retirementAge, input.retirementSavings, input.annualWithdrawal, input.stockAllocation, input.lifeExpectancy].some(n => !Number.isFinite(n))) {
        return { ok: false, reason: 'The retirement link is missing a number the calculator needs.' };
    }
    const settings = taxSettings(parsed);
    const rng = ctx.Sim.seededRandom(ctx.seed);
    const full = input.returnMode === 'historical';
    const sequences = ctx.Sim.buildSequences(ctx.data, input.returnMode, input.lifeExpectancy, simulationCount, full, rng);
    if (!sequences.length) {
        return { ok: false, reason: 'The 1975–2024 sample has no complete window for that retirement length.' };
    }
    const taxFn = preTaxFn(settings, ctx.calculateWithdrawalTax);
    const sims = sequences.map(seq => ctx.Sim.runRetirementTrial(input, seq, taxFn));
    const summary = ctx.IO.summarizeRetirement(sims, input);
    return {
        ok: true,
        kind: 'retirement',
        seed: ctx.seed,
        seedNote: ctx.seedNote,
        capped: asked > PATH_CAP && input.returnMode !== 'historical',
        pathCount: summary.n,
        successes: summary.successes,
        successRate: summary.successRate,
        returnMode: input.returnMode,
        age: input.retirementAge,
        savings: input.retirementSavings,
        spending: input.annualWithdrawal,
        horizon: input.lifeExpectancy,
        includeSS,
        ssMonthlyBenefit: input.ssMonthlyBenefit,
        ssClaimingAge,
        includeSpouseSS,
        spouseSSMonthlyBenefit: input.spouseSSMonthlyBenefit,
        pack: parsed.pack || null,
        historical: input.returnMode === 'historical'
    };
}

export function snapshotFrom(plan) {
    if (!plan || !plan.ok) return null;
    return {
        kind: plan.kind,
        savedAt: new Date().toISOString(),
        savings: plan.savings,
        target: plan.target || null,
        spending: plan.spending || null,
        age: plan.age,
        progress: plan.progress == null ? null : plan.progress,
        median: plan.median == null ? null : plan.median,
        medianAge: plan.medianAge == null ? null : plan.medianAge,
        successRate: plan.successRate == null ? null : plan.successRate,
        successes: plan.successes == null ? null : plan.successes,
        pathCount: plan.pathCount
    };
}

export function formatPlanMoney(value) {
    return money(value);
}

// A sketch: treat the extra deferral as lower spending. Taxes are not modeled,
// so the result understates a pre-tax contribution.
export function deferralWhatIf(planUrl, limit) {
    const before = evaluatePlan(planUrl);
    if (!before.ok || before.kind !== 'accumulation' || limit == null) return null;
    if (!(before.contribution < Number(limit))) return null;
    const gap = Number(limit) - before.contribution;
    const next = new URL(planUrl);
    next.searchParams.set('expenses', String(Math.max(0, Math.round(before.expenses - gap))));
    const after = evaluatePlan(next.toString());
    if (!after.ok) return null;
    return { contribution: before.contribution, limit: Number(limit), gap, before, after };
}
