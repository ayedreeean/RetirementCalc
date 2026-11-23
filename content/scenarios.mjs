// Worked-example inputs for the guide pages.
// Trial math stays in market-data.js. This module only calls it.
import { engine } from '../mcp/engine.mjs';

const { FirecalcSim: Sim, FirecalcIO: IO, FirecalcPacks: Packs } = engine;

export const SEED = 246813;

export function money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
}

export function runSavings(cfg) {
    const sequences = Sim.buildSequences(null, cfg.returnMode, 50, cfg.simulationCount || 1000, false, Sim.seededRandom(SEED));
    const sims = sequences.map(seq => Sim.runAccumulationTrial({
        currentAge: cfg.currentAge,
        currentSavings: cfg.currentSavings,
        income: cfg.income,
        expenses: cfg.expenses,
        targetAmount: cfg.targetAmount,
        stockAllocation: cfg.stockAllocationPercent / 100,
        incomeGrowth: cfg.incomeGrowthPercent / 100,
        maxYears: 50
    }, seq));
    const sum = IO.summarizeSavings(sims, 50);
    return {
        median: sum.median,
        p10: sum.p10,
        p90: sum.p90,
        reached: sum.reached,
        n: sum.n,
        ageMedian: cfg.currentAge + sum.median,
        ageP10: cfg.currentAge + sum.p10,
        ageP90: sum.p90 == null ? null : cfg.currentAge + sum.p90
    };
}

export function runRetirement(cfg) {
    const full = cfg.returnMode === 'historical';
    const sequences = Sim.buildSequences(null, cfg.returnMode, cfg.horizonYears, cfg.simulationCount || 1000, full, Sim.seededRandom(SEED));
    const factor = (age) => IO.SS_AGE_FACTORS[age] || 1;
    const claim = cfg.ssClaimingAge || 67;
    const spouseClaim = cfg.spouseSSClaimingAge || 67;
    const inp = {
        retirementAge: cfg.retirementAge,
        retirementSavings: cfg.retirementSavings,
        annualWithdrawal: cfg.annualWithdrawal,
        adjustForInflation: cfg.adjustForInflation !== false,
        taxRate: (cfg.taxRatePercent || 0) / 100,
        stockAllocation: cfg.stockAllocationPercent / 100,
        lifeExpectancy: cfg.horizonYears,
        returnMode: cfg.returnMode,
        includeSS: !!cfg.includeSS,
        ssClaimingAge: claim,
        ssAnnualBase: cfg.includeSS ? (cfg.ssMonthlyBenefit || 0) * factor(claim) * 12 : 0,
        includeSpouseSS: !!cfg.includeSpouseSS,
        spouseSSClaimingAge: spouseClaim,
        spouseSSAnnualBase: cfg.includeSpouseSS ? (cfg.spouseSSMonthlyBenefit || 0) * factor(spouseClaim) * 12 : 0,
        includeOtherIncome: !!cfg.includeOtherIncome,
        annualPension: cfg.includeOtherIncome ? (cfg.monthlyPension || 0) * 12 : 0,
        annualOtherIncome: cfg.includeOtherIncome ? (cfg.monthlyOtherIncome || 0) * 12 : 0,
        pensionStartAge: cfg.pensionStartAge || 65,
        otherIncomeDuration: cfg.otherIncomeDuration || 0
    };
    const sims = sequences.map(seq => Sim.runRetirementTrial(inp, seq));
    const sum = IO.summarizeRetirement(sims, inp);
    const windows = sims.map(sim => {
        let low = cfg.retirementSavings;
        let lowYear = sim.startYear;
        for (const year of sim.yearlyData) {
            const real = year.balance / year.cpi;
            if (real < low) { low = real; lowYear = year.calendarYear; }
        }
        return {
            start: sim.startYear,
            end: sim.yearlyData.length ? sim.yearlyData[sim.yearlyData.length - 1].calendarYear : sim.startYear,
            out: sim.ranOutOfMoney,
            years: sim.yearsLasted,
            endReal: sim.finalRealBalance,
            lowPct: Math.round(low / cfg.retirementSavings * 100),
            lowYear
        };
    }).sort((a, b) => a.start - b.start);
    return {
        successes: sum.successes,
        n: sum.n,
        earliest: sum.earliestDepletion,
        windows
    };
}

export function runPacks(cfg) {
    const input = {
        retirementAge: cfg.retirementAge,
        retirementSavings: cfg.retirementSavings,
        annualWithdrawal: cfg.annualWithdrawal,
        adjustForInflation: true,
        taxRate: (cfg.taxRatePercent || 0) / 100,
        stockAllocation: cfg.stockAllocationPercent / 100,
        lifeExpectancy: cfg.horizonYears,
        includeSS: false,
        includeSpouseSS: false,
        includeOtherIncome: false,
        ssAnnualBase: 0,
        spouseSSAnnualBase: 0,
        ssClaimingAge: 67,
        spouseSSClaimingAge: 67,
        pensionStartAge: 65,
        annualPension: 0,
        annualOtherIncome: 0,
        otherIncomeDuration: 0
    };
    return Packs.availablePacks().map(pack => {
        const result = Packs.runPack(pack, input);
        return {
            id: result.pack.id,
            name: result.pack.name,
            start: result.window.startYear,
            end: result.window.endYear,
            years: result.window.years,
            survived: result.survived,
            verdict: result.verdict,
            lowPct: Math.round(result.low.multiple * 100),
            lowYear: result.low.year,
            endPct: Math.round(result.endMultiple * 100)
        };
    });
}

export function sharePath(kind, cfg) {
    const url = kind === 'retirement'
        ? IO.retirementShareUrl({ ...cfg, seed: SEED, simulationCount: cfg.simulationCount || 1000 }, 'https://firecalc.ai')
        : IO.savingsShareUrl({ ...cfg, seed: SEED, simulationCount: cfg.simulationCount || 1000 }, 'https://firecalc.ai');
    return url.replace('https://firecalc.ai', '');
}

const baseRetirement = {
    taxRatePercent: 0,
    adjustForInflation: true,
    includeSS: false,
    includeSpouseSS: false,
    includeOtherIncome: false,
    ssMonthlyBenefit: 2000,
    ssClaimingAge: 67,
    spouseSSMonthlyBenefit: 1500,
    spouseSSClaimingAge: 67,
    monthlyPension: 0,
    pensionStartAge: 65,
    monthlyOtherIncome: 0,
    otherIncomeDuration: 0,
    simulationCount: 1000
};

export const PLANS = {
    leanSave: { currentAge: 33, currentSavings: 45000, income: 68000, expenses: 40000, targetAmount: 800000, stockAllocationPercent: 80, incomeGrowthPercent: 1, simulationCount: 1000, returnMode: 'shuffled' },
    leanSaveHist: { currentAge: 33, currentSavings: 45000, income: 68000, expenses: 40000, targetAmount: 800000, stockAllocationPercent: 80, incomeGrowthPercent: 1, simulationCount: 1000, returnMode: 'historical' },
    leanRet: { ...baseRetirement, retirementAge: 45, retirementSavings: 800000, annualWithdrawal: 32000, stockAllocationPercent: 70, horizonYears: 45, returnMode: 'historical' },
    leanRetShuf: { ...baseRetirement, retirementAge: 45, retirementSavings: 800000, annualWithdrawal: 32000, stockAllocationPercent: 70, horizonYears: 45, returnMode: 'shuffled' },
    leanRet35: { ...baseRetirement, retirementAge: 45, retirementSavings: 800000, annualWithdrawal: 28000, stockAllocationPercent: 70, horizonYears: 45, returnMode: 'shuffled' },

    fatSave: { currentAge: 42, currentSavings: 1500000, income: 320000, expenses: 180000, targetAmount: 4500000, stockAllocationPercent: 70, incomeGrowthPercent: 1, simulationCount: 1000, returnMode: 'shuffled' },
    fatSaveHist: { currentAge: 42, currentSavings: 1500000, income: 320000, expenses: 180000, targetAmount: 4500000, stockAllocationPercent: 70, incomeGrowthPercent: 1, simulationCount: 1000, returnMode: 'historical' },
    fatRet: { ...baseRetirement, retirementAge: 51, retirementSavings: 4500000, annualWithdrawal: 180000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'historical' },
    fatRetShuf: { ...baseRetirement, retirementAge: 51, retirementSavings: 4500000, annualWithdrawal: 180000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'shuffled' },

    barOff: { ...baseRetirement, retirementAge: 45, retirementSavings: 700000, annualWithdrawal: 48000, stockAllocationPercent: 60, horizonYears: 45, returnMode: 'historical' },
    barOffShuf: { ...baseRetirement, retirementAge: 45, retirementSavings: 700000, annualWithdrawal: 48000, stockAllocationPercent: 60, horizonYears: 45, returnMode: 'shuffled' },
    barOn: { ...baseRetirement, retirementAge: 45, retirementSavings: 700000, annualWithdrawal: 48000, stockAllocationPercent: 60, horizonYears: 45, returnMode: 'historical', includeOtherIncome: true, monthlyOtherIncome: 1500, otherIncomeDuration: 15 },
    barOnShuf: { ...baseRetirement, retirementAge: 45, retirementSavings: 700000, annualWithdrawal: 48000, stockAllocationPercent: 60, horizonYears: 45, returnMode: 'shuffled', includeOtherIncome: true, monthlyOtherIncome: 1500, otherIncomeDuration: 15 },

    r40Save: { currentAge: 30, currentSavings: 180000, income: 125000, expenses: 62000, targetAmount: 1550000, stockAllocationPercent: 80, incomeGrowthPercent: 2, simulationCount: 1000, returnMode: 'shuffled' },
    r40SaveHist: { currentAge: 30, currentSavings: 180000, income: 125000, expenses: 62000, targetAmount: 1550000, stockAllocationPercent: 80, incomeGrowthPercent: 2, simulationCount: 1000, returnMode: 'historical' },
    r40Ret: { ...baseRetirement, retirementAge: 40, retirementSavings: 1550000, annualWithdrawal: 62000, stockAllocationPercent: 75, horizonYears: 50, returnMode: 'historical' },
    r40RetShuf: { ...baseRetirement, retirementAge: 40, retirementSavings: 1550000, annualWithdrawal: 62000, stockAllocationPercent: 75, horizonYears: 50, returnMode: 'shuffled' },
    r40Ret35: { ...baseRetirement, retirementAge: 40, retirementSavings: 1771429, annualWithdrawal: 62000, stockAllocationPercent: 75, horizonYears: 50, returnMode: 'shuffled' },

    r45Save: { currentAge: 34, currentSavings: 280000, income: 140000, expenses: 70000, targetAmount: 1750000, stockAllocationPercent: 75, incomeGrowthPercent: 1, simulationCount: 1000, returnMode: 'shuffled' },
    r45SaveHist: { currentAge: 34, currentSavings: 280000, income: 140000, expenses: 70000, targetAmount: 1750000, stockAllocationPercent: 75, incomeGrowthPercent: 1, simulationCount: 1000, returnMode: 'historical' },
    r45Ret: { ...baseRetirement, retirementAge: 45, retirementSavings: 1750000, annualWithdrawal: 70000, stockAllocationPercent: 70, horizonYears: 45, returnMode: 'historical' },
    r45RetShuf: { ...baseRetirement, retirementAge: 45, retirementSavings: 1750000, annualWithdrawal: 70000, stockAllocationPercent: 70, horizonYears: 45, returnMode: 'shuffled' },

    r50Save: { currentAge: 40, currentSavings: 520000, income: 150000, expenses: 80000, targetAmount: 2000000, stockAllocationPercent: 70, incomeGrowthPercent: 1, simulationCount: 1000, returnMode: 'shuffled' },
    r50SaveHist: { currentAge: 40, currentSavings: 520000, income: 150000, expenses: 80000, targetAmount: 2000000, stockAllocationPercent: 70, incomeGrowthPercent: 1, simulationCount: 1000, returnMode: 'historical' },
    r50Ret: { ...baseRetirement, retirementAge: 50, retirementSavings: 2000000, annualWithdrawal: 80000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'historical' },
    r50RetShuf: { ...baseRetirement, retirementAge: 50, retirementSavings: 2000000, annualWithdrawal: 80000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'shuffled' },
    r50Ret35: { ...baseRetirement, retirementAge: 50, retirementSavings: 2000000, annualWithdrawal: 70000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'shuffled' },

    swr30: { ...baseRetirement, retirementAge: 65, retirementSavings: 1000000, annualWithdrawal: 40000, stockAllocationPercent: 60, horizonYears: 30, returnMode: 'historical' },
    seq: { ...baseRetirement, retirementAge: 50, retirementSavings: 1000000, annualWithdrawal: 40000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'historical' },
    seqShuf: { ...baseRetirement, retirementAge: 50, retirementSavings: 1000000, annualWithdrawal: 40000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'shuffled' },

    tax0: { ...baseRetirement, retirementAge: 45, retirementSavings: 1000000, annualWithdrawal: 40000, stockAllocationPercent: 60, taxRatePercent: 0, horizonYears: 40, returnMode: 'shuffled' },
    tax12: { ...baseRetirement, retirementAge: 45, retirementSavings: 1000000, annualWithdrawal: 40000, stockAllocationPercent: 60, taxRatePercent: 12, horizonYears: 40, returnMode: 'shuffled' },
    tax22: { ...baseRetirement, retirementAge: 45, retirementSavings: 1000000, annualWithdrawal: 40000, stockAllocationPercent: 60, taxRatePercent: 22, horizonYears: 40, returnMode: 'shuffled' },
    tax0Hist: { ...baseRetirement, retirementAge: 45, retirementSavings: 1000000, annualWithdrawal: 40000, stockAllocationPercent: 60, taxRatePercent: 0, horizonYears: 40, returnMode: 'historical' },
    tax12Hist: { ...baseRetirement, retirementAge: 45, retirementSavings: 1000000, annualWithdrawal: 40000, stockAllocationPercent: 60, taxRatePercent: 12, horizonYears: 40, returnMode: 'historical' },
    tax22Hist: { ...baseRetirement, retirementAge: 45, retirementSavings: 1000000, annualWithdrawal: 40000, stockAllocationPercent: 60, taxRatePercent: 22, horizonYears: 40, returnMode: 'historical' },

    kidsSave: { currentAge: 36, currentSavings: 240000, income: 165000, expenses: 118000, targetAmount: 2200000, stockAllocationPercent: 70, incomeGrowthPercent: 1, simulationCount: 1000, returnMode: 'shuffled' },
    kidsSaveHist: { currentAge: 36, currentSavings: 240000, income: 165000, expenses: 118000, targetAmount: 2200000, stockAllocationPercent: 70, incomeGrowthPercent: 1, simulationCount: 1000, returnMode: 'historical' },
    kids70: { ...baseRetirement, retirementAge: 50, retirementSavings: 2200000, annualWithdrawal: 70000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'shuffled', ssMonthlyBenefit: 2100, spouseSSMonthlyBenefit: 1400 },
    kids95: { ...baseRetirement, retirementAge: 50, retirementSavings: 2200000, annualWithdrawal: 95000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'shuffled', ssMonthlyBenefit: 2100, spouseSSMonthlyBenefit: 1400 },
    kids95ss: { ...baseRetirement, retirementAge: 50, retirementSavings: 2200000, annualWithdrawal: 95000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'shuffled', includeSS: true, includeSpouseSS: true, ssMonthlyBenefit: 2100, ssClaimingAge: 67, spouseSSMonthlyBenefit: 1400, spouseSSClaimingAge: 67 },
    kids95Hist: { ...baseRetirement, retirementAge: 50, retirementSavings: 2200000, annualWithdrawal: 95000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'historical', ssMonthlyBenefit: 2100, spouseSSMonthlyBenefit: 1400 },

    fnSave: { currentAge: 36, currentSavings: 160000, income: 115000, expenses: 67000, targetAmount: 1200000, stockAllocationPercent: 75, incomeGrowthPercent: 2, simulationCount: 1000, returnMode: 'shuffled' },
    fnSaveHist: { currentAge: 36, currentSavings: 160000, income: 115000, expenses: 67000, targetAmount: 1200000, stockAllocationPercent: 75, incomeGrowthPercent: 2, simulationCount: 1000, returnMode: 'historical' },
    fnRet: { ...baseRetirement, retirementAge: 50, retirementSavings: 1200000, annualWithdrawal: 48000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'historical' },
    fnRetShuf: { ...baseRetirement, retirementAge: 50, retirementSavings: 1200000, annualWithdrawal: 48000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'shuffled' },
    fn35: { ...baseRetirement, retirementAge: 50, retirementSavings: 1371429, annualWithdrawal: 48000, stockAllocationPercent: 60, horizonYears: 40, returnMode: 'shuffled' },

    ssOff: { ...baseRetirement, retirementAge: 55, retirementSavings: 900000, annualWithdrawal: 52000, stockAllocationPercent: 55, horizonYears: 35, returnMode: 'shuffled', ssMonthlyBenefit: 2000 },
    ss62: { ...baseRetirement, retirementAge: 55, retirementSavings: 900000, annualWithdrawal: 52000, stockAllocationPercent: 55, horizonYears: 35, returnMode: 'shuffled', includeSS: true, ssMonthlyBenefit: 2000, ssClaimingAge: 62 },
    ss67: { ...baseRetirement, retirementAge: 55, retirementSavings: 900000, annualWithdrawal: 52000, stockAllocationPercent: 55, horizonYears: 35, returnMode: 'shuffled', includeSS: true, ssMonthlyBenefit: 2000, ssClaimingAge: 67 },
    ss70: { ...baseRetirement, retirementAge: 55, retirementSavings: 900000, annualWithdrawal: 52000, stockAllocationPercent: 55, horizonYears: 35, returnMode: 'shuffled', includeSS: true, ssMonthlyBenefit: 2000, ssClaimingAge: 70 },
    ssOffHist: { ...baseRetirement, retirementAge: 55, retirementSavings: 900000, annualWithdrawal: 52000, stockAllocationPercent: 55, horizonYears: 35, returnMode: 'historical', ssMonthlyBenefit: 2000 },

    crash: { ...baseRetirement, retirementAge: 55, retirementSavings: 1200000, annualWithdrawal: 48000, stockAllocationPercent: 60, horizonYears: 30, returnMode: 'historical' },
    crashShuf: { ...baseRetirement, retirementAge: 55, retirementSavings: 1200000, annualWithdrawal: 48000, stockAllocationPercent: 60, horizonYears: 30, returnMode: 'shuffled' },

    coast: { currentAge: 40, currentSavings: 450000, income: 85000, expenses: 85000, targetAmount: 1500000, stockAllocationPercent: 80, incomeGrowthPercent: 0, simulationCount: 1000, returnMode: 'shuffled' },
    coastHist: { currentAge: 40, currentSavings: 450000, income: 85000, expenses: 85000, targetAmount: 1500000, stockAllocationPercent: 80, incomeGrowthPercent: 0, simulationCount: 1000, returnMode: 'historical' }
};

export function claimingBenefit(monthlyAt67, age) {
    return Math.round(monthlyAt67 * (IO.SS_AGE_FACTORS[age] || 1));
}

export function portfolioMix(year, stockShare) {
    const row = engine.FIRECALC_HISTORICAL.find(item => item.year === year);
    if (!row) throw new Error('missing year ' + year);
    const mix = row.marketReturn * stockShare + row.bondReturn * (1 - stockShare);
    return { stocks: row.marketReturn, bonds: row.bondReturn, inflation: row.inflation, mix };
}

export function swrPlan(withdrawal, horizon, mode) {
    return {
        ...baseRetirement,
        retirementAge: horizon === 30 ? 65 : 50,
        retirementSavings: 1000000,
        annualWithdrawal: withdrawal,
        stockAllocationPercent: 60,
        horizonYears: horizon,
        returnMode: mode
    };
}
