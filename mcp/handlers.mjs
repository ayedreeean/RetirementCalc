// MCP tool handlers. They shape inputs the way app.js does, then call the
// shared engine. They do not contain a second copy of the trial loop.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engine, repoRootPath } from './engine.mjs';

const Sim = engine.FirecalcSim;
const IO = engine.FirecalcIO;
const Packs = engine.FirecalcPacks;
const history = engine.FIRECALC_HISTORICAL;

export const ORIGIN = 'https://firecalc.ai';
export const DISCLAIMER = 'Illustration, not advice. This replays or reshuffles the 1975–2024 US large-cap and 10-year Treasury sample. It is not a forecast and not a recommendation.';

// Form defaults from index.html. Dollar amounts are never defaulted: a share
// link must not invent a portfolio, a withdrawal, or a Social Security benefit
// that changes the result.
export const SITE_DEFAULTS = {
    retirementAge: 65,
    horizonYears: 30,
    stockAllocationPercentRetirement: 60,
    stockAllocationPercentSavings: 70,
    taxRatePercent: 15,
    adjustForInflation: true,
    returnMode: 'shuffled',
    simulationCount: 1000,
    seed: 246813,
    currentAge: 30,
    incomeGrowthPercent: 2,
    ssClaimingAge: 67,
    spouseSSClaimingAge: 67,
    ssMonthlyBenefitOnLinkWhenOff: 2000,
    spouseSSMonthlyBenefitOnLinkWhenOff: 1500,
    pensionStartAge: 65,
    monthlyPension: 0,
    monthlyOtherIncome: 0,
    otherIncomeDuration: 0,
    taxMode: 'simple',
    taxFilingStatus: 'mfj',
    preTaxPercent: 60,
    rothPercent: 20,
    taxablePercent: 20,
    optimizeOrder: true,
    stateTaxPercent: 0,
    maxInput: 999999999,
    maxAge: 90
};

const DATA_FIRST = history[0].year;
const DATA_LAST = history[history.length - 1].year;

export class InputError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InputError';
    }
}

function rejectUnknown(args, allowed) {
    const extra = Object.keys(args || {}).filter(k => !allowed.has(k));
    if (extra.length) throw new InputError(`Unknown field: ${extra.join(', ')}.`);
}

function finiteNumber(value, name, { min, max, integer } = {}) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new InputError(`${name} must be a finite number.`);
    }
    if (integer && !Number.isInteger(value)) throw new InputError(`${name} must be an integer.`);
    if (min != null && value < min) throw new InputError(`${name} must be at least ${min}.`);
    if (max != null && value > max) throw new InputError(`${name} must be at most ${max}.`);
    return value;
}

function optNumber(args, key, fallback, bounds, applied) {
    if (args[key] == null) {
        applied.push(key);
        return fallback;
    }
    return finiteNumber(args[key], key, bounds);
}

function optBool(args, key, fallback, applied) {
    if (args[key] == null) {
        applied.push(key);
        return fallback;
    }
    if (typeof args[key] !== 'boolean') throw new InputError(`${key} must be true or false.`);
    return args[key];
}

function money(value, name) {
    return finiteNumber(value, name, { min: 0, max: SITE_DEFAULTS.maxInput });
}

function requireMoney(args, key) {
    if (args[key] == null) throw new InputError(`${key} is required. This tool does not invent dollar amounts.`);
    return money(args[key], key);
}

function returnModeOf(args, applied) {
    if (args.returnMode == null) {
        applied.push('returnMode');
        return SITE_DEFAULTS.returnMode;
    }
    if (args.returnMode !== 'shuffled' && args.returnMode !== 'historical') {
        throw new InputError('returnMode must be "shuffled" or "historical".');
    }
    return args.returnMode;
}

function claimingAge(args, key, fallback, applied) {
    const age = optNumber(args, key, fallback, { integer: true }, applied);
    if (IO.SS_AGE_FACTORS[age] == null) {
        throw new InputError(`${key} must be one of ${Object.keys(IO.SS_AGE_FACTORS).join(', ')}.`);
    }
    return age;
}

const sampleAssumptions = () => ({
    dataWindow: `${DATA_FIRST}–${DATA_LAST}`,
    rows: history.length,
    assets: 'S&P 500 total return (dividends included) and that year’s 10-year US Treasury total return. CPI is on the same row. Treasuries can be negative. This is not the Bloomberg US Aggregate.',
    notInSample: '1966 and 1973–74 are before the table. There is no pack for those years.',
    engine: 'FirecalcSim (market-data.js), FirecalcIO (firecalc-io.js), FirecalcPacks (stress-packs.js), calculateWithdrawalTax (tax-engine.js)',
    disclaimer: DISCLAIMER
});

function taxSettingsOf(resolved) {
    if (resolved.taxMode === 'simple') {
        return { taxMode: 'simple', flatRate: resolved.taxRatePercent / 100 };
    }
    return {
        taxMode: 'detailed',
        filingStatus: resolved.taxFilingStatus,
        preTaxPct: resolved.preTaxPercent,
        rothPct: resolved.rothPercent,
        taxablePct: resolved.taxablePercent,
        optimizeOrder: resolved.optimizeOrder,
        stateTaxRate: resolved.stateTaxPercent
    };
}

function preTaxFnFor(resolved) {
    const settings = taxSettingsOf(resolved);
    return (spend, income) => engine.calculateWithdrawalTax(spend, income, settings).preTaxWithdrawal;
}

function resolveTax(args, applied) {
    const taxMode = args.taxMode == null ? (applied.push('taxMode'), SITE_DEFAULTS.taxMode) : args.taxMode;
    if (taxMode !== 'simple' && taxMode !== 'detailed') {
        throw new InputError('taxMode must be "simple" or "detailed".');
    }
    const taxRatePercent = optNumber(args, 'taxRatePercent', SITE_DEFAULTS.taxRatePercent, { min: 0, max: 99 }, applied);
    const detailed = taxMode === 'detailed';
    const filingFallback = SITE_DEFAULTS.taxFilingStatus;
    let taxFilingStatus = filingFallback;
    if (args.taxFilingStatus == null) {
        if (detailed) applied.push('taxFilingStatus');
    } else {
        taxFilingStatus = args.taxFilingStatus;
    }
    if (taxFilingStatus !== 'mfj' && taxFilingStatus !== 'single') {
        throw new InputError('taxFilingStatus must be "mfj" or "single".');
    }
    const preTaxPercent = args.preTaxPercent == null
        ? (detailed && applied.push('preTaxPercent'), SITE_DEFAULTS.preTaxPercent)
        : finiteNumber(args.preTaxPercent, 'preTaxPercent', { min: 0, max: 100 });
    const rothPercent = args.rothPercent == null
        ? (detailed && applied.push('rothPercent'), SITE_DEFAULTS.rothPercent)
        : finiteNumber(args.rothPercent, 'rothPercent', { min: 0, max: 100 });
    const taxablePercent = args.taxablePercent == null
        ? (detailed && applied.push('taxablePercent'), SITE_DEFAULTS.taxablePercent)
        : finiteNumber(args.taxablePercent, 'taxablePercent', { min: 0, max: 100 });
    const optimizeOrder = args.optimizeOrder == null
        ? (detailed && applied.push('optimizeOrder'), SITE_DEFAULTS.optimizeOrder)
        : args.optimizeOrder;
    if (typeof optimizeOrder !== 'boolean') throw new InputError('optimizeOrder must be true or false.');
    const stateTaxPercent = args.stateTaxPercent == null
        ? (detailed && applied.push('stateTaxPercent'), SITE_DEFAULTS.stateTaxPercent)
        : finiteNumber(args.stateTaxPercent, 'stateTaxPercent', { min: 0, max: 15 });
    if (detailed) {
        const mix = preTaxPercent + rothPercent + taxablePercent;
        if (Math.abs(mix - 100) > 0.001) {
            throw new InputError(`preTaxPercent, rothPercent, and taxablePercent must sum to 100 (got ${mix}).`);
        }
    }
    return { taxMode, taxRatePercent, taxFilingStatus, preTaxPercent, rothPercent, taxablePercent, optimizeOrder, stateTaxPercent };
}

function resolveRetirement(args, { allowPack = false } = {}) {
    const allowed = new Set([
        'retirementAge', 'retirementSavings', 'annualWithdrawal', 'horizonYears',
        'stockAllocationPercent', 'taxRatePercent', 'adjustForInflation', 'returnMode',
        'simulationCount', 'seed', 'includeSS', 'ssMonthlyBenefit', 'ssClaimingAge',
        'includeSpouseSS', 'spouseSSMonthlyBenefit', 'spouseSSClaimingAge',
        'includeOtherIncome', 'monthlyPension', 'pensionStartAge', 'monthlyOtherIncome',
        'otherIncomeDuration', 'taxMode', 'taxFilingStatus', 'preTaxPercent', 'rothPercent',
        'taxablePercent', 'optimizeOrder', 'stateTaxPercent'
    ]);
    if (allowPack) allowed.add('pack');
    rejectUnknown(args, allowed);

    const applied = [];
    const retirementSavings = requireMoney(args, 'retirementSavings');
    const annualWithdrawal = requireMoney(args, 'annualWithdrawal');
    const retirementAge = optNumber(args, 'retirementAge', SITE_DEFAULTS.retirementAge, { integer: true, min: 30, max: SITE_DEFAULTS.maxAge }, applied);
    const horizonYears = optNumber(args, 'horizonYears', SITE_DEFAULTS.horizonYears, { integer: true, min: 5, max: 50 }, applied);
    const stockAllocationPercent = optNumber(args, 'stockAllocationPercent', SITE_DEFAULTS.stockAllocationPercentRetirement, { min: 0, max: 100 }, applied);
    const adjustForInflation = optBool(args, 'adjustForInflation', SITE_DEFAULTS.adjustForInflation, applied);
    const returnMode = returnModeOf(args, applied);
    const simulationCount = optNumber(args, 'simulationCount', SITE_DEFAULTS.simulationCount, { integer: true, min: 1, max: 5000 }, applied);
    const seed = optNumber(args, 'seed', SITE_DEFAULTS.seed, { integer: true, min: 1, max: 2147483647 }, applied);
    const includeSS = optBool(args, 'includeSS', false, applied);
    const includeSpouseSS = optBool(args, 'includeSpouseSS', false, applied);
    const includeOtherIncome = optBool(args, 'includeOtherIncome', false, applied);

    let ssMonthlyBenefit;
    if (includeSS) {
        if (args.ssMonthlyBenefit == null) {
            throw new InputError('ssMonthlyBenefit is required when includeSS is true. This tool does not invent a benefit.');
        }
        ssMonthlyBenefit = money(args.ssMonthlyBenefit, 'ssMonthlyBenefit');
    } else if (args.ssMonthlyBenefit == null) {
        applied.push('ssMonthlyBenefit');
        ssMonthlyBenefit = SITE_DEFAULTS.ssMonthlyBenefitOnLinkWhenOff;
    } else {
        ssMonthlyBenefit = money(args.ssMonthlyBenefit, 'ssMonthlyBenefit');
    }

    let spouseSSMonthlyBenefit;
    if (includeSpouseSS) {
        if (args.spouseSSMonthlyBenefit == null) {
            throw new InputError('spouseSSMonthlyBenefit is required when includeSpouseSS is true. This tool does not invent a benefit.');
        }
        spouseSSMonthlyBenefit = money(args.spouseSSMonthlyBenefit, 'spouseSSMonthlyBenefit');
    } else if (args.spouseSSMonthlyBenefit == null) {
        applied.push('spouseSSMonthlyBenefit');
        spouseSSMonthlyBenefit = SITE_DEFAULTS.spouseSSMonthlyBenefitOnLinkWhenOff;
    } else {
        spouseSSMonthlyBenefit = money(args.spouseSSMonthlyBenefit, 'spouseSSMonthlyBenefit');
    }

    const ssClaimingAge = claimingAge(args, 'ssClaimingAge', SITE_DEFAULTS.ssClaimingAge, applied);
    const spouseSSClaimingAge = claimingAge(args, 'spouseSSClaimingAge', SITE_DEFAULTS.spouseSSClaimingAge, applied);
    const monthlyPension = optNumber(args, 'monthlyPension', SITE_DEFAULTS.monthlyPension, { min: 0, max: SITE_DEFAULTS.maxInput }, applied);
    const pensionStartAge = optNumber(args, 'pensionStartAge', SITE_DEFAULTS.pensionStartAge, { integer: true, min: 40, max: SITE_DEFAULTS.maxAge }, applied);
    const monthlyOtherIncome = optNumber(args, 'monthlyOtherIncome', SITE_DEFAULTS.monthlyOtherIncome, { min: 0, max: SITE_DEFAULTS.maxInput }, applied);
    const otherIncomeDuration = optNumber(args, 'otherIncomeDuration', SITE_DEFAULTS.otherIncomeDuration, { integer: true, min: 0, max: 50 }, applied);
    const tax = resolveTax(args, applied);

    let pack = null;
    if (allowPack && args.pack != null) {
        if (typeof args.pack !== 'string') throw new InputError('pack must be a string.');
        pack = requirePack(args.pack);
    }

    const trialInput = {
        retirementAge,
        retirementSavings,
        annualWithdrawal,
        adjustForInflation,
        taxRate: tax.taxRatePercent / 100,
        stockAllocation: stockAllocationPercent / 100,
        simulationCount,
        lifeExpectancy: horizonYears,
        returnMode,
        includeSS,
        ssMonthlyBenefit,
        ssClaimingAge,
        includeSpouseSS,
        spouseSSMonthlyBenefit,
        spouseSSClaimingAge,
        includeOtherIncome,
        monthlyPension,
        pensionStartAge,
        monthlyOtherIncome,
        otherIncomeDuration,
        ssAnnualBase: ssMonthlyBenefit * (IO.SS_AGE_FACTORS[ssClaimingAge] || 1) * 12,
        spouseSSAnnualBase: spouseSSMonthlyBenefit * (IO.SS_AGE_FACTORS[spouseSSClaimingAge] || 1) * 12,
        annualPension: monthlyPension * 12,
        annualOtherIncome: monthlyOtherIncome * 12
    };

    return {
        applied,
        pack,
        trialInput,
        retirementAge,
        retirementSavings,
        annualWithdrawal,
        horizonYears,
        stockAllocationPercent,
        adjustForInflation,
        returnMode,
        simulationCount,
        seed,
        includeSS,
        ssMonthlyBenefit,
        ssClaimingAge,
        includeSpouseSS,
        spouseSSMonthlyBenefit,
        spouseSSClaimingAge,
        includeOtherIncome,
        monthlyPension,
        pensionStartAge,
        monthlyOtherIncome,
        otherIncomeDuration,
        ...tax
    };
}

function shareConfig(resolved) {
    return {
        retirementAge: resolved.retirementAge,
        retirementSavings: resolved.retirementSavings,
        annualWithdrawal: resolved.annualWithdrawal,
        stockAllocationPercent: resolved.stockAllocationPercent,
        adjustForInflation: resolved.adjustForInflation,
        taxRatePercent: resolved.taxRatePercent,
        taxMode: resolved.taxMode,
        taxFilingStatus: resolved.taxFilingStatus,
        preTaxPercent: resolved.preTaxPercent,
        rothPercent: resolved.rothPercent,
        taxablePercent: resolved.taxablePercent,
        optimizeOrder: resolved.optimizeOrder,
        stateTaxPercent: resolved.stateTaxPercent,
        horizonYears: resolved.horizonYears,
        simulationCount: resolved.simulationCount,
        returnMode: resolved.returnMode,
        includeSS: resolved.includeSS,
        ssMonthlyBenefit: resolved.ssMonthlyBenefit,
        ssClaimingAge: resolved.ssClaimingAge,
        includeSpouseSS: resolved.includeSpouseSS,
        spouseSSMonthlyBenefit: resolved.spouseSSMonthlyBenefit,
        spouseSSClaimingAge: resolved.spouseSSClaimingAge,
        includeOtherIncome: resolved.includeOtherIncome,
        monthlyPension: resolved.monthlyPension,
        pensionStartAge: resolved.pensionStartAge,
        monthlyOtherIncome: resolved.monthlyOtherIncome,
        otherIncomeDuration: resolved.otherIncomeDuration,
        seed: resolved.seed,
        pack: resolved.pack ? resolved.pack.id : undefined
    };
}

function retirementAssumptions(resolved, extra) {
    const notes = [];
    if (resolved.returnMode === 'historical') {
        notes.push('Historical cycles use only complete windows inside the sample. The seed is stored on the link and does not change those windows.');
    } else {
        notes.push('Shuffled years draw each year independently from the sample. That is not a historical sequence and not a normal-distribution Monte Carlo. The seed repeats the draws.');
    }
    if (resolved.includeSS) {
        notes.push(`Social Security is on: ${resolved.ssMonthlyBenefit} per month at full retirement age 67, claimed at ${resolved.ssClaimingAge}. That income is inside the success rate.`);
    } else {
        notes.push('Social Security is off. ssMonthlyBenefit is stored on the share link and is not used.');
    }
    if (resolved.includeSpouseSS) {
        notes.push(`Spouse Social Security is on: ${resolved.spouseSSMonthlyBenefit} per month at 67, claimed at ${resolved.spouseSSClaimingAge}.`);
    }
    if (resolved.includeOtherIncome && (resolved.monthlyPension > 0 || resolved.monthlyOtherIncome > 0)) {
        notes.push('Pension or other income is on. A pension stays flat in nominal dollars.');
    }
    if (resolved.taxMode === 'detailed') {
        notes.push('Taxes use 2025 federal brackets via calculateWithdrawalTax. optimizeOrder does not change the result, because separate account balances are not tracked.');
    } else {
        notes.push(`Taxes are a flat ${resolved.taxRatePercent}% gross-up: pre-tax draw = spending / (1 − rate).`);
    }
    if (!resolved.adjustForInflation) notes.push('Spending stays fixed in future dollars.');
    return {
        ...sampleAssumptions(),
        ...extra,
        defaultsApplied: resolved.applied,
        retirementAge: resolved.retirementAge,
        retirementSavings: resolved.retirementSavings,
        annualWithdrawal: resolved.annualWithdrawal,
        horizonYears: resolved.horizonYears,
        stockAllocationPercent: resolved.stockAllocationPercent,
        adjustForInflation: resolved.adjustForInflation,
        returnMode: resolved.returnMode,
        simulationCount: resolved.simulationCount,
        simulationCountUsed: resolved.returnMode === 'historical' ? false : true,
        seed: resolved.seed,
        includeSS: resolved.includeSS,
        ssMonthlyBenefit: resolved.ssMonthlyBenefit,
        ssClaimingAge: resolved.ssClaimingAge,
        includeSpouseSS: resolved.includeSpouseSS,
        spouseSSMonthlyBenefit: resolved.spouseSSMonthlyBenefit,
        spouseSSClaimingAge: resolved.spouseSSClaimingAge,
        includeOtherIncome: resolved.includeOtherIncome,
        monthlyPension: resolved.monthlyPension,
        pensionStartAge: resolved.pensionStartAge,
        monthlyOtherIncome: resolved.monthlyOtherIncome,
        otherIncomeDuration: resolved.otherIncomeDuration,
        taxMode: resolved.taxMode,
        taxRatePercent: resolved.taxRatePercent,
        taxFilingStatus: resolved.taxFilingStatus,
        preTaxPercent: resolved.preTaxPercent,
        rothPercent: resolved.rothPercent,
        taxablePercent: resolved.taxablePercent,
        optimizeOrder: resolved.optimizeOrder,
        stateTaxPercent: resolved.stateTaxPercent,
        pack: resolved.pack ? resolved.pack.id : null,
        notes
    };
}

// Same display rule as app.js formatSuccess: do not print 100% when a path failed.
function formatSuccess(rate, successes, n) {
    const r = Math.round(rate);
    if (r === 100 && successes < n) return `${Math.min(99.9, Math.floor(rate * 10) / 10).toFixed(1)}%`;
    if (r === 0 && successes > 0) return `${Math.max(0.1, Math.ceil(rate * 10) / 10).toFixed(1)}%`;
    return `${r}%`;
}

function runRetirementSims(resolved) {
    const sequences = Sim.buildSequences(
        history,
        resolved.returnMode,
        resolved.horizonYears,
        resolved.simulationCount,
        true,
        Sim.seededRandom(resolved.seed)
    );
    if (!sequences.length) {
        throw new InputError(`The ${DATA_FIRST}–${DATA_LAST} sample has no complete ${resolved.horizonYears}-year window. Shorten the horizon or use shuffled years.`);
    }
    const preTaxFn = preTaxFnFor(resolved);
    const sims = sequences.map(sequence => {
        const trial = Sim.runRetirementTrial(resolved.trialInput, sequence, preTaxFn);
        if (resolved.returnMode !== 'historical') trial.startYear = null;
        return trial;
    });
    return { sequences, sims, preTaxFn, summary: IO.summarizeRetirement(sims, resolved.trialInput) };
}

function retirementSuccess(args) {
    const resolved = resolveRetirement(args || {});
    const { summary, preTaxFn } = runRetirementSims(resolved);
    const firstYearPreTaxDraw = preTaxFn(resolved.annualWithdrawal, { socialSecurity: 0, pension: 0, otherOrdinary: 0 });
    const real = summary.pctl.real.p50;
    const mid = Math.floor(resolved.horizonYears / 2);
    const url = IO.retirementShareUrl(shareConfig(resolved), ORIGIN);
    return {
        disclaimer: DISCLAIMER,
        modeUsed: resolved.returnMode,
        scenarioCount: summary.n,
        firecalc_url: url,
        assumptions: retirementAssumptions(resolved, {
            successDefinition: 'Still above zero at the end of every year of the horizon. Return is applied before the withdrawal.'
        }),
        successes: summary.successes,
        successRate: summary.successRate,
        successRateDisplay: formatSuccess(summary.successRate, summary.successes, summary.n),
        medianEndingBalance: summary.medianEndingBalance,
        medianEndingRealBalance: summary.medianEndingReal,
        medianWithdrawals: summary.medianWithdrawals,
        averageAnnualReturn: summary.avgReturn,
        worstCaseYears: summary.worstCaseYears,
        earliestDepletionYears: summary.earliestDepletion,
        socialSecurityInsideSuccessRate: !!(resolved.includeSS && resolved.ssMonthlyBenefit > 0),
        otherIncomeInsideSuccessRate: !!(resolved.includeOtherIncome && (resolved.monthlyPension > 0 || resolved.monthlyOtherIncome > 0)) || !!(resolved.includeSpouseSS && resolved.spouseSSMonthlyBenefit > 0),
        firstYearPreTaxDraw,
        coveragePct: summary.coveragePct,
        balanceRealP50: {
            start: real[0],
            mid: real[mid],
            end: real[real.length - 1]
        },
        toughestStartYear: summary.toughest ? summary.toughest.startYear : null,
        toughestRanOut: summary.toughest ? summary.toughest.ranOutOfMoney : null
    };
}

function resolveSavings(args) {
    rejectUnknown(args, new Set([
        'currentAge', 'currentSavings', 'income', 'expenses', 'targetAmount',
        'stockAllocationPercent', 'incomeGrowthPercent', 'returnMode', 'simulationCount', 'seed'
    ]));
    const applied = [];
    const currentSavings = requireMoney(args, 'currentSavings');
    const income = requireMoney(args, 'income');
    const expenses = requireMoney(args, 'expenses');
    const targetAmount = requireMoney(args, 'targetAmount');
    const currentAge = optNumber(args, 'currentAge', SITE_DEFAULTS.currentAge, { integer: true, min: 18, max: SITE_DEFAULTS.maxAge }, applied);
    const stockAllocationPercent = optNumber(args, 'stockAllocationPercent', SITE_DEFAULTS.stockAllocationPercentSavings, { min: 0, max: 100 }, applied);
    const incomeGrowthPercent = optNumber(args, 'incomeGrowthPercent', SITE_DEFAULTS.incomeGrowthPercent, { min: 0, max: 10 }, applied);
    const returnMode = returnModeOf(args, applied);
    const simulationCount = optNumber(args, 'simulationCount', SITE_DEFAULTS.simulationCount, { integer: true, min: 1, max: 5000 }, applied);
    const seed = optNumber(args, 'seed', SITE_DEFAULTS.seed, { integer: true, min: 1, max: 2147483647 }, applied);
    return {
        applied, currentAge, currentSavings, income, expenses, targetAmount,
        stockAllocationPercent, incomeGrowthPercent, returnMode, simulationCount, seed,
        trialInput: {
            currentAge,
            currentSavings,
            income,
            expenses,
            targetAmount,
            stockAllocation: stockAllocationPercent / 100,
            incomeGrowth: incomeGrowthPercent / 100,
            maxYears: IO.MAX_ACCUMULATION_YEARS
        }
    };
}

function savingsAssumptions(resolved) {
    const notes = [
        'The goal is today’s purchasing power: nominal balance divided by cumulative CPI since the start.',
        'The contribution is income minus spending, and never below zero. Income and spending rise with that year’s inflation. Real raises are incomeGrowthPercent on top of inflation.',
        resolved.returnMode === 'historical'
            ? 'Historical mode uses every start year from the first row until the goal or until the sample ends, so a late start is a short window.'
            : 'Shuffled years are independent draws. The search stops at 50 years.'
    ];
    return {
        ...sampleAssumptions(),
        defaultsApplied: resolved.applied,
        currentAge: resolved.currentAge,
        currentSavings: resolved.currentSavings,
        income: resolved.income,
        expenses: resolved.expenses,
        targetAmount: resolved.targetAmount,
        stockAllocationPercent: resolved.stockAllocationPercent,
        incomeGrowthPercent: resolved.incomeGrowthPercent,
        returnMode: resolved.returnMode,
        simulationCount: resolved.simulationCount,
        simulationCountUsed: resolved.returnMode === 'historical' ? false : true,
        seed: resolved.seed,
        maxYears: IO.MAX_ACCUMULATION_YEARS,
        notes
    };
}

function yearsToTarget(args) {
    const resolved = resolveSavings(args || {});
    const sequences = Sim.buildSequences(
        history,
        resolved.returnMode,
        IO.MAX_ACCUMULATION_YEARS,
        resolved.simulationCount,
        false,
        Sim.seededRandom(resolved.seed)
    );
    const sims = sequences.map(sequence => {
        const trial = Sim.runAccumulationTrial(resolved.trialInput, sequence);
        if (resolved.returnMode !== 'historical') trial.startYear = null;
        return trial;
    });
    const summary = IO.summarizeSavings(sims, IO.MAX_ACCUMULATION_YEARS);
    const url = IO.savingsShareUrl({
        currentAge: resolved.currentAge,
        currentSavings: resolved.currentSavings,
        income: resolved.income,
        expenses: resolved.expenses,
        targetAmount: resolved.targetAmount,
        stockAllocationPercent: resolved.stockAllocationPercent,
        incomeGrowthPercent: resolved.incomeGrowthPercent,
        simulationCount: resolved.simulationCount,
        returnMode: resolved.returnMode,
        seed: resolved.seed
    }, ORIGIN);
    const notReached = resolved.returnMode === 'historical' ? 'Not reached' : 'Not within 50 years';
    return {
        disclaimer: DISCLAIMER,
        modeUsed: resolved.returnMode,
        scenarioCount: summary.n,
        firecalc_url: url,
        assumptions: savingsAssumptions(resolved),
        medianYears: summary.median,
        p10Years: summary.p10,
        p90Years: summary.p90,
        medianYearsLabel: summary.median == null ? notReached : String(summary.median),
        reachedCount: summary.reached,
        reachedPct: summary.reachedPct,
        medianFinalRealBalance: summary.medianSim ? summary.medianSim.finalRealBalance : null
    };
}

function requirePack(id) {
    if (typeof id !== 'string' || !id) throw new InputError('pack must be a pack id string.');
    const pack = Packs.getPack(id, history);
    if (!pack) {
        const known = Packs.availablePacks(history).map(p => p.id).join(', ');
        throw new InputError(`Unknown stress pack "${id}". Known packs: ${known}.`);
    }
    return pack;
}

function packCard(result, retirementAge) {
    const verdict = Packs.verdictText(result);
    const window = result.window;
    return {
        packId: result.pack.id,
        name: result.pack.name,
        villainLabel: result.pack.villainLabel,
        verdict: result.verdict,
        survived: result.survived,
        headline: verdict.headline,
        cardTag: verdict.cardTag,
        cardSub: verdict.cardSub,
        yearsUsed: window.years,
        startYear: window.startYear,
        endYear: window.endYear,
        clippedBySample: window.clippedBySample,
        yearsDisclosure: Packs.yearsDisclosure(result, retirementAge),
        endMultiple: result.endMultiple,
        lowMultiple: result.low ? result.low.multiple : null,
        lowYear: result.low ? result.low.year : null,
        ranOutYear: result.ranOutYear,
        yearsLasted: result.yearsLasted,
        spendRate: result.spendRate,
        stockAllocationPercent: result.stockAllocation * 100,
        otherIncome: result.otherIncome,
        villain: {
            from: result.villain.from,
            to: result.villain.to,
            stocks: result.villain.stocks,
            bonds: result.villain.bonds,
            inflation: result.villain.inflation
        },
        pathMultiples: result.path
    };
}

function runStressPack(args) {
    const input = { ...(args || {}) };
    const all = input.all === true;
    if (input.all != null && typeof input.all !== 'boolean') throw new InputError('all must be true or false.');
    delete input.all;
    const packId = input.pack;
    delete input.pack;
    if (all && packId != null) throw new InputError('Pass either pack or all, not both.');
    if (!all && packId == null) throw new InputError('pack is required unless all is true.');

    const resolved = resolveRetirement(input, { allowPack: false });
    const preTaxFn = preTaxFnFor(resolved);

    if (all) {
        const gauntlet = Packs.runGauntlet(resolved.trialInput, { preTaxFn, data: history, sim: Sim });
        const cards = gauntlet.results.map(result => packCard(result, resolved.retirementAge));
        return {
            disclaimer: DISCLAIMER,
            modeUsed: 'historical',
            scenarioCount: gauntlet.total,
            firecalc_url: IO.retirementShareUrl(shareConfig(resolved), ORIGIN),
            assumptions: retirementAssumptions(resolved, {
                thisResult: 'One real path per named pack. Not a success rate.',
                shareLinkMainResult: 'firecalc_url opens the plan without a pack id, so the calculator can show every pack. Its main success rate still uses returnMode.'
            }),
            survived: gauntlet.survived,
            total: gauntlet.total,
            toughestPackId: gauntlet.toughest ? gauntlet.toughest.pack.id : null,
            cards
        };
    }

    const pack = requirePack(packId);
    const result = Packs.runPack(pack, resolved.trialInput, { preTaxFn, data: history, sim: Sim });
    if (!result) throw new InputError(`Pack "${pack.id}" could not be run on the ${DATA_FIRST}–${DATA_LAST} table.`);
    const url = IO.retirementShareUrl(shareConfig({ ...resolved, pack }), ORIGIN);
    return {
        disclaimer: DISCLAIMER,
        modeUsed: 'historical',
        scenarioCount: 1,
        firecalc_url: url,
        assumptions: retirementAssumptions({ ...resolved, pack }, {
            thisResult: 'One historical pack path, in the order the years happened. Not a success rate.',
            shareLinkMainResult: 'firecalc_url opens this plan with the pack selected. The calculator’s main success rate still uses returnMode and is a different statistic.'
        }),
        card: packCard(result, resolved.retirementAge),
        shareCardSvg: Packs.shareCardSvg(result)
    };
}

const LINK_KINDS = new Set(['retirement', 'accumulation', 'challenge']);

function buildFirecalcLink(args) {
    const input = args || {};
    if (!LINK_KINDS.has(input.kind)) {
        throw new InputError('kind must be "retirement", "accumulation", or "challenge".');
    }
    if (input.kind === 'challenge') {
        const extra = Object.keys(input).filter(key => key !== 'kind' && key !== 'pack');
        if (extra.length) throw new InputError('A challenge link carries only the pack id. Omit plan numbers.');
        if (input.pack == null) throw new InputError('pack is required for a challenge link.');
        const pack = requirePack(input.pack);
        const url = IO.challengeUrl(pack.id, ORIGIN);
        return {
            disclaimer: DISCLAIMER,
            modeUsed: null,
            scenarioCount: null,
            firecalc_url: url,
            assumptions: {
                ...sampleAssumptions(),
                defaultsApplied: [],
                kind: 'challenge',
                pack: pack.id,
                carriesPlanNumbers: false,
                notes: ['A challenge link names the pack and nothing else, so it contains no portfolio or spending figures.']
            }
        };
    }
    if (input.kind === 'accumulation') {
        const { kind, ...rest } = input;
        if (rest.pack != null) throw new InputError('pack is only valid on a retirement or challenge link.');
        const resolved = resolveSavings(rest);
        const scenarioCount = resolved.returnMode === 'historical'
            ? Sim.buildSequences(history, 'historical', IO.MAX_ACCUMULATION_YEARS, 1, false).length
            : resolved.simulationCount;
        const url = IO.savingsShareUrl({
            currentAge: resolved.currentAge,
            currentSavings: resolved.currentSavings,
            income: resolved.income,
            expenses: resolved.expenses,
            targetAmount: resolved.targetAmount,
            stockAllocationPercent: resolved.stockAllocationPercent,
            incomeGrowthPercent: resolved.incomeGrowthPercent,
            simulationCount: resolved.simulationCount,
            returnMode: resolved.returnMode,
            seed: resolved.seed
        }, ORIGIN);
        return {
            disclaimer: DISCLAIMER,
            modeUsed: resolved.returnMode,
            scenarioCount,
            firecalc_url: url,
            assumptions: savingsAssumptions(resolved)
        };
    }
    const { kind, ...rest } = input;
    const resolved = resolveRetirement(rest, { allowPack: true });
    const windows = resolved.returnMode === 'historical'
        ? Sim.buildSequences(history, 'historical', resolved.horizonYears, 1, true)
        : null;
    if (windows && !windows.length) {
        throw new InputError(`The ${DATA_FIRST}–${DATA_LAST} sample has no complete ${resolved.horizonYears}-year window.`);
    }
    const url = IO.retirementShareUrl(shareConfig(resolved), ORIGIN);
    return {
        disclaimer: DISCLAIMER,
        modeUsed: resolved.returnMode,
        scenarioCount: windows ? windows.length : resolved.simulationCount,
        firecalc_url: url,
        assumptions: retirementAssumptions(resolved, {
            carriesPlanNumbers: true
        })
    };
}

function methodologyText() {
    const packs = Packs.availablePacks(history).map(p => `${p.id}: ${p.name}, starts ${p.startYear}`).join('\n');
    return [
        'FIREcalc methodology (short). Full text: firecalc://llms-full.txt and https://firecalc.ai/llms-full.txt.',
        '',
        `Data window: ${DATA_FIRST}–${DATA_LAST} (${history.length} rows).`,
        'Stocks: S&P 500 total return. Non-stock sleeve: 10-year Treasury total return. Inflation: CPI on the same row.',
        'Does not include 1966 or 1973–74.',
        'Shuffled years: each year is an independent draw from the table. Historical cycles: the years that followed a start year. Retirement keeps complete windows only.',
        'Retirement success: portfolio still above zero at the end of every year. Return is applied before the withdrawal.',
        'Savings goal: today’s purchasing power. Search stops at 50 years.',
        'Social Security is off unless the caller turns it on.',
        'Named stress packs, one real path each:',
        packs,
        '',
        DISCLAIMER,
        'The local MCP runs this math on the user\'s computer. There is no public compute API.'
    ].join('\n');
}

function describeMethodology(args) {
    rejectUnknown(args || {}, new Set());
    const packs = Packs.availablePacks(history).map(p => ({
        id: p.id,
        name: p.name,
        startYear: p.startYear,
        villainYears: p.villainYears
    }));
    return {
        disclaimer: DISCLAIMER,
        modeUsed: null,
        scenarioCount: null,
        firecalc_url: `${ORIGIN}/llms-full.txt`,
        assumptions: {
            ...sampleAssumptions(),
            defaultsApplied: [],
            localOnly: true,
            hostedCompute: false,
            successDefinition: 'Portfolio still above zero at the end of every year of the horizon.',
            savingsGoal: 'Today’s purchasing power. Contributions are income minus spending, never below zero. The search stops at 50 years.',
            socialSecurity: 'Off unless includeSS is true. A benefit is required when it is on.',
            limits: [
                'No fees, glide path, or separate cash bucket.',
                'No returns before 1975 and no markets outside this table.',
                'No early-withdrawal penalties, RMDs, NIIT, IRMAA, or ACA premiums.',
                'Brackets are not inflation-indexed. A pension stays nominal.',
                'No safe-withdrawal-rate solver and no Social Security claiming sweep in this MCP.',
                'app.js still assembles inputs for the page. This adapter mirrors that assembly and calls the same trial functions.'
            ],
            packs
        },
        fullTextResource: 'firecalc://llms-full.txt',
        summary: methodologyText()
    };
}

const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
};

const retirementSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['retirementSavings', 'annualWithdrawal'],
    properties: {
        retirementSavings: { type: 'number', minimum: 0, description: 'Portfolio at retirement, in dollars. Required. Not defaulted.' },
        annualWithdrawal: { type: 'number', minimum: 0, description: 'Annual after-tax spending, in dollars. Required. Not defaulted.' },
        retirementAge: { type: 'integer', minimum: 30, maximum: 90, description: 'Default 65.' },
        horizonYears: { type: 'integer', minimum: 5, maximum: 50, description: 'Years after retirement. Default 30. Historical mode keeps only complete windows.' },
        stockAllocationPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Percent in the S&P 500. 60 means 60%, not 0.60. The rest is that year’s 10-year Treasury. Default 60.' },
        adjustForInflation: { type: 'boolean', description: 'Raise spending with CPI from the second year. Default true.' },
        returnMode: { type: 'string', enum: ['shuffled', 'historical'], description: 'Default shuffled. Shuffled years are independent draws from 1975–2024, not a normal distribution.' },
        simulationCount: { type: 'integer', minimum: 1, maximum: 5000, description: 'Shuffled path count. Default 1000. Ignored for historical cycles, which use every complete window.' },
        seed: { type: 'integer', minimum: 1, description: 'Shuffled-path seed. Default 246813. Historical cycles ignore it. The share link still carries it.' },
        taxMode: { type: 'string', enum: ['simple', 'detailed'], description: 'Default simple (flat taxRatePercent). Detailed uses 2025 brackets.' },
        taxRatePercent: { type: 'number', minimum: 0, maximum: 99, description: 'Flat tax percent. Default 15. Used when taxMode is simple.' },
        taxFilingStatus: { type: 'string', enum: ['mfj', 'single'], description: 'Detailed mode. Default mfj.' },
        preTaxPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Detailed mode account mix. Default 60. The three mix fields must sum to 100.' },
        rothPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Detailed mode. Default 20.' },
        taxablePercent: { type: 'number', minimum: 0, maximum: 100, description: 'Detailed mode. Default 20. Half of taxable withdrawals are treated as long-term gains.' },
        optimizeOrder: { type: 'boolean', description: 'Detailed mode. Default true. Does not change results, because separate balances are not tracked.' },
        stateTaxPercent: { type: 'number', minimum: 0, maximum: 15, description: 'Detailed mode flat state rate. Default 0.' },
        includeSS: { type: 'boolean', description: 'Default false. When true, ssMonthlyBenefit is required.' },
        ssMonthlyBenefit: { type: 'number', minimum: 0, description: 'Monthly benefit at age 67, before the claiming-age factor. Required when includeSS is true.' },
        ssClaimingAge: { type: 'integer', description: '62–70. Default 67. Full retirement age in this model is 67.' },
        includeSpouseSS: { type: 'boolean', description: 'Default false. When true, spouseSSMonthlyBenefit is required.' },
        spouseSSMonthlyBenefit: { type: 'number', minimum: 0, description: 'Required when includeSpouseSS is true.' },
        spouseSSClaimingAge: { type: 'integer', description: '62–70. Default 67.' },
        includeOtherIncome: { type: 'boolean', description: 'Default false.' },
        monthlyPension: { type: 'number', minimum: 0, description: 'Nominal dollars per month. Not inflation-adjusted. Default 0.' },
        pensionStartAge: { type: 'integer', description: 'Default 65.' },
        monthlyOtherIncome: { type: 'number', minimum: 0, description: 'Default 0.' },
        otherIncomeDuration: { type: 'integer', minimum: 0, maximum: 50, description: 'Years. 0 means the whole horizon. Default 0.' }
    }
};

const savingsSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['currentSavings', 'income', 'expenses', 'targetAmount'],
    properties: {
        currentSavings: { type: 'number', minimum: 0, description: 'Invested today, in dollars. Required.' },
        income: { type: 'number', minimum: 0, description: 'Annual after-tax income, in dollars. Required.' },
        expenses: { type: 'number', minimum: 0, description: 'Annual spending, in dollars. Required.' },
        targetAmount: { type: 'number', minimum: 0, description: 'Goal in today’s dollars. Required.' },
        currentAge: { type: 'integer', minimum: 18, maximum: 90, description: 'Default 30.' },
        stockAllocationPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Percent in the S&P 500. Default 70.' },
        incomeGrowthPercent: { type: 'number', minimum: 0, maximum: 10, description: 'Real raises above inflation, in percent. Default 2.' },
        returnMode: { type: 'string', enum: ['shuffled', 'historical'], description: 'Default shuffled.' },
        simulationCount: { type: 'integer', minimum: 1, maximum: 5000, description: 'Shuffled path count. Default 1000. Historical mode uses every start year instead.' },
        seed: { type: 'integer', minimum: 1, description: 'Default 246813.' }
    }
};

export const TOOLS = [
    {
        name: 'retirement_success',
        description: 'Run the FIREcalc retirement trial locally: shuffled years or historical cycles, with taxes, Social Security, and other income. Success means the portfolio is above zero at the end of every year. Uses FirecalcSim.runRetirementTrial. Does not contact a server. Returns the assumptions actually used, the path count, and a firecalc.ai share URL. Illustration, not advice.',
        inputSchema: retirementSchema,
        annotations: readOnly,
        handler: retirementSuccess
    },
    {
        name: 'years_to_target',
        description: 'Run the FIREcalc savings trial locally. Reports median, 10th, and 90th percentile years to a goal measured in today’s purchasing power. Uses FirecalcSim.runAccumulationTrial. Dollar inputs are required. Returns assumptions, the path count, and a firecalc.ai share URL. Illustration, not advice.',
        inputSchema: savingsSchema,
        annotations: readOnly,
        handler: yearsToTarget
    },
    {
        name: 'run_stress_pack',
        description: 'Replay one named historical stress pack, or all six, through the same retirement trial. Packs: stagflation, rate-wall-81, bond-rout-94, dotcom, gfc, rate-shock-22. A pack is one real path inside 1975–2024, not a success rate. The card uses ratios and rates, not dollar amounts. Unknown pack ids are refused.',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['retirementSavings', 'annualWithdrawal'],
            properties: {
                ...retirementSchema.properties,
                pack: { type: 'string', description: 'Pack id. Omit only when all is true.' },
                all: { type: 'boolean', description: 'Run every available pack. Do not also pass pack.' }
            }
        },
        annotations: readOnly,
        handler: runStressPack
    },
    {
        name: 'build_firecalc_link',
        description: 'Encode a plan as an https://firecalc.ai share URL using the same query keys as the site (FirecalcIO). kind "challenge" plus a pack id returns a link with no plan numbers. Does not run the simulation. Does not invent dollar amounts: portfolio and spending are required unless kind is challenge.',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['kind'],
            properties: {
                kind: { type: 'string', enum: ['retirement', 'accumulation', 'challenge'] },
                pack: { type: 'string', description: 'Retirement or challenge links only.' },
                ...retirementSchema.properties,
                currentAge: savingsSchema.properties.currentAge,
                currentSavings: savingsSchema.properties.currentSavings,
                income: savingsSchema.properties.income,
                expenses: savingsSchema.properties.expenses,
                targetAmount: savingsSchema.properties.targetAmount,
                incomeGrowthPercent: savingsSchema.properties.incomeGrowthPercent,
                stockAllocationPercent: {
                    type: 'number',
                    minimum: 0,
                    maximum: 100,
                    description: 'Percent in the S&P 500. Default 60 for a retirement link, 70 for a savings link.'
                }
            }
        },
        annotations: readOnly,
        handler: buildFirecalcLink
    },
    {
        name: 'describe_methodology',
        description: 'Describe the FIREcalc data window, success definition, stress packs, and limits. No simulation. The long note is the firecalc://llms-full.txt resource. Illustration, not advice.',
        inputSchema: { type: 'object', additionalProperties: false, properties: {} },
        annotations: readOnly,
        handler: describeMethodology
    }
];

export function listTools() {
    return TOOLS.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations }));
}

export function callTool(name, args) {
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) throw new InputError(`Unknown tool "${name}".`);
    if (args == null) args = {};
    if (typeof args !== 'object' || Array.isArray(args)) throw new InputError('Tool arguments must be an object.');
    // The engine objects live in a vm realm. Clone through JSON so callers
    // receive plain data, and so a non-finite number cannot become null.
    return JSON.parse(JSON.stringify(tool.handler(args), (key, value) => {
        if (typeof value === 'number' && !Number.isFinite(value)) {
            throw new InputError(`Result field "${key}" was not a finite number.`);
        }
        return value;
    }));
}

export function listResources() {
    return [
        {
            uri: 'firecalc://methodology',
            name: 'FIREcalc methodology (short)',
            description: 'Data window, success definition, stress packs, and limits. Local MCP. Not advice.',
            mimeType: 'text/plain'
        },
        {
            uri: 'firecalc://llms-full.txt',
            name: 'FIREcalc methodology (full)',
            description: 'The same long methodology note published at https://firecalc.ai/llms-full.txt.',
            mimeType: 'text/plain'
        }
    ];
}

export function readResource(uri) {
    if (uri === 'firecalc://methodology') {
        return { uri, mimeType: 'text/plain', text: methodologyText() };
    }
    if (uri === 'firecalc://llms-full.txt') {
        return {
            uri,
            mimeType: 'text/plain',
            text: readFileSync(join(repoRootPath, 'llms-full.txt'), 'utf8')
        };
    }
    throw new InputError(`Unknown resource "${uri}".`);
}
