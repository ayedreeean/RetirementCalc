// Share links and stress-pack ids for FIREcalc.
// This module imports firecalc-io.js for the URL codec only. It does not import
// market-data.js, stress-packs.js, tax-engine.js, or engine.mjs, and it never
// calls FirecalcSim. Summary helpers that live in firecalc-io.js are not called.
import '../firecalc-io.js';

const IO = globalThis.FirecalcIO;

export const ORIGIN = 'https://firecalc.ai';
export const DISCLAIMER = 'Illustration, not advice. This replays or reshuffles the 1975–2024 US large-cap and 10-year Treasury sample. It is not a forecast and not a recommendation.';

// Kept equal to the named packs in stress-packs.js. A test locks the match.
// Metadata only: no returns, no trial, no share-card SVG.
export const PACK_CATALOG = [
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

// Form defaults from index.html. Dollar amounts that change a plan are never
// defaulted. When Social Security is off, the share link still carries the
// form's unused benefit fields, and assumptions say they are not used.
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

const DATA_WINDOW = '1975–2024';
const DATA_ROWS = 50;

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

export function knownPack(id) {
    if (typeof id !== 'string' || !id) throw new InputError('pack must be a pack id string.');
    const pack = PACK_CATALOG.find(p => p.id === id);
    if (!pack) {
        const known = PACK_CATALOG.map(p => p.id).join(', ');
        throw new InputError(`Unknown stress pack "${id}". Known packs: ${known}.`);
    }
    return pack;
}

function sampleAssumptions() {
    return {
        dataWindow: DATA_WINDOW,
        rows: DATA_ROWS,
        assets: 'S&P 500 total return (dividends included) and that year’s 10-year US Treasury total return. CPI is on the same row. Treasuries can be negative. This is not the Bloomberg US Aggregate.',
        notInSample: '1966 and 1973–74 are before the table. There is no pack for those years.',
        engine: 'FirecalcSim (market-data.js), FirecalcIO (firecalc-io.js), FirecalcPacks (stress-packs.js), calculateWithdrawalTax (tax-engine.js)',
        disclaimer: DISCLAIMER
    };
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

export function resolveRetirement(args, { allowPack = false } = {}) {
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
        pack = knownPack(args.pack);
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

export function shareConfig(resolved) {
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

export function retirementAssumptions(resolved, extra) {
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

export function resolveSavings(args) {
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

export function savingsAssumptions(resolved) {
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

const LINK_KINDS = new Set(['retirement', 'accumulation', 'challenge']);

function hostedAssumptions(assumptions) {
    const notes = (assumptions.notes || []).concat(
        'No simulation ran on the server. Open the link in a browser to run the plan.'
    );
    return {
        ...assumptions,
        engine: 'FirecalcIO share links only. This server does not run FirecalcSim, stress-pack trials, or success rates.',
        hostedCompute: false,
        localOnly: false,
        runsTrials: false,
        notes
    };
}

export function buildShareLink(args, options = {}) {
    const surface = options.surface === 'hosted' ? 'hosted' : 'local';
    const input = args || {};
    if (!LINK_KINDS.has(input.kind)) {
        throw new InputError('kind must be "retirement", "accumulation", or "challenge".');
    }
    let result;
    if (input.kind === 'challenge') {
        const extra = Object.keys(input).filter(key => key !== 'kind' && key !== 'pack');
        if (extra.length) throw new InputError('A challenge link carries only the pack id. Omit plan numbers.');
        if (input.pack == null) throw new InputError('pack is required for a challenge link.');
        const pack = knownPack(input.pack);
        const url = IO.challengeUrl(pack.id, ORIGIN);
        result = {
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
    } else if (input.kind === 'accumulation') {
        const { kind, ...rest } = input;
        if (rest.pack != null) throw new InputError('pack is only valid on a retirement or challenge link.');
        const resolved = resolveSavings(rest);
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
        result = {
            disclaimer: DISCLAIMER,
            modeUsed: resolved.returnMode,
            scenarioCount: null,
            firecalc_url: url,
            assumptions: savingsAssumptions(resolved)
        };
    } else {
        const { kind, ...rest } = input;
        const resolved = resolveRetirement(rest, { allowPack: true });
        const url = IO.retirementShareUrl(shareConfig(resolved), ORIGIN);
        result = {
            disclaimer: DISCLAIMER,
            modeUsed: resolved.returnMode,
            scenarioCount: null,
            firecalc_url: url,
            assumptions: retirementAssumptions(resolved, { carriesPlanNumbers: true })
        };
    }
    if (surface === 'hosted') {
        result.compute = false;
        result.assumptions = hostedAssumptions(result.assumptions);
    }
    return result;
}

export function listStressPacks() {
    return {
        compute: false,
        disclaimer: DISCLAIMER,
        sample: DATA_WINDOW,
        notOffered: 'There is no pack for 1966 or 1973–74, which are before the table. There is none for Black Monday or the COVID crash: stocks returned +5.6% in 1987 and +18.4% in 2020 in this annual table, so those drops do not appear as down years.',
        packs: PACK_CATALOG.map(pack => ({
            id: pack.id,
            name: pack.name,
            villainLabel: pack.villainLabel,
            startYear: pack.startYear,
            villainYears: pack.villainYears,
            copy: pack.copy,
            note: pack.note || null,
            challengeUrl: IO.challengeUrl(pack.id, ORIGIN)
        })),
        note: 'A challenge link names the pack and nothing else. The browser runs it with the visitor’s own saved inputs. This server did not run the pack.'
    };
}

export function describeMethodologyHosted() {
    const packs = PACK_CATALOG.map(pack => ({
        id: pack.id,
        name: pack.name,
        startYear: pack.startYear,
        villainYears: pack.villainYears,
        challengeUrl: IO.challengeUrl(pack.id, ORIGIN)
    }));
    const summary = [
        'FIREcalc methodology (short). Full text: https://firecalc.ai/llms-full.txt.',
        '',
        'This hosted server builds share links and challenge links. It does not run a savings trial, a retirement trial, or a stress pack.',
        '',
        `Data window: ${DATA_WINDOW} (${DATA_ROWS} rows).`,
        'Stocks: S&P 500 total return. Non-stock sleeve: 10-year Treasury total return. Inflation: CPI on the same row.',
        'Does not include 1966 or 1973–74.',
        'Shuffled years: each year is an independent draw from the table. Historical cycles: the years that followed a start year. Retirement keeps complete windows only.',
        'Retirement success: portfolio still above zero at the end of every year. Return is applied before the withdrawal. This server does not compute that rate.',
        'Savings goal: today’s purchasing power. Search stops at 50 years. This server does not compute the years.',
        'Social Security is off unless the caller turns it on. When it is off, a share link may still carry the form’s unused benefit field.',
        'Named stress packs are challenge links, not results:',
        packs.map(pack => `${pack.id}: ${pack.name}, starts ${pack.startYear}, ${pack.challengeUrl}`).join('\n'),
        '',
        DISCLAIMER,
        'There is no public compute API. The local MCP, on the person’s own computer, is a different program and can run the engine there.'
    ].join('\n');
    return {
        compute: false,
        disclaimer: DISCLAIMER,
        modeUsed: null,
        scenarioCount: null,
        firecalc_url: `${ORIGIN}/llms-full.txt`,
        assumptions: {
            ...sampleAssumptions(),
            engine: 'FirecalcIO share links only. This server does not run FirecalcSim.',
            defaultsApplied: [],
            hostedCompute: false,
            localOnly: false,
            runsTrials: false,
            successDefinition: 'Portfolio still above zero at the end of every year of the horizon. This server does not compute it.',
            savingsGoal: 'Today’s purchasing power. Contributions are income minus spending, never below zero. The search stops at 50 years. This server does not compute the years.',
            socialSecurity: 'Off unless includeSS is true. A benefit is required when it is on. This server does not invent one.',
            limits: [
                'No fees, glide path, or separate cash bucket.',
                'No returns before 1975 and no markets outside this table.',
                'No early-withdrawal penalties, RMDs, NIIT, IRMAA, or ACA premiums.',
                'Brackets are not inflation-indexed. A pension stays nominal.',
                'This hosted server does not solve for a withdrawal, run a claiming sweep, or return a success rate.'
            ],
            packs
        },
        summary
    };
}

export function validateShareParams(args) {
    const input = args || {};
    rejectUnknown(input, new Set(['url']));
    if (typeof input.url !== 'string' || !input.url.trim()) throw new InputError('url is required.');
    let parsed;
    try {
        parsed = IO.parseShareParams(input.url);
    } catch {
        throw new InputError('url could not be read as a firecalc.ai share link.');
    }
    const requested = parsed.packRequested;
    const known = requested == null ? null : PACK_CATALOG.some(pack => pack.id === requested);
    return {
        compute: false,
        disclaimer: DISCLAIMER,
        empty: parsed.empty,
        kind: parsed.kind,
        pack: parsed.pack,
        packRequested: requested,
        packKnown: known,
        packOnly: IO.isPackOnly(input.url),
        seed: parsed.seed,
        values: parsed.values,
        checks: parsed.checks,
        tax: parsed.tax,
        note: 'This reads the query string only. It does not run the plan and it does not fill in missing dollars.'
    };
}

export const DATA_WINDOW_LABEL = DATA_WINDOW;
export const DATA_ROW_COUNT = DATA_ROWS;
