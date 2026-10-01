import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { engine } from './engine.mjs';
import { callTool, InputError, readResource } from './handlers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const Sim = engine.FirecalcSim;
const IO = engine.FirecalcIO;
const Packs = engine.FirecalcPacks;
const history = engine.FIRECALC_HISTORICAL;

const classic = {
    retirementSavings: 1000000,
    annualWithdrawal: 40000,
    retirementAge: 65,
    horizonYears: 30,
    stockAllocationPercent: 50,
    taxRatePercent: 0,
    adjustForInflation: true,
    returnMode: 'historical',
    includeSS: false,
    taxMode: 'simple'
};

function directRetirement(input, sequences, preTaxFn) {
    const sims = sequences.map(seq => Sim.runRetirementTrial(input, seq, preTaxFn));
    return IO.summarizeRetirement(sims, input);
}

test('retirement_success matches FirecalcSim on the classic historical plan', () => {
    const out = callTool('retirement_success', classic);
    assert.equal(out.modeUsed, 'historical');
    assert.equal(out.scenarioCount, 21);
    assert.equal(out.assumptions.dataWindow, '1975–2024');
    assert.equal(out.assumptions.includeSS, false);
    assert.equal(out.assumptions.taxRatePercent, 0);
    assert.match(out.firecalc_url, /^https:\/\/firecalc\.ai\/\?/);
    assert.match(out.disclaimer, /not advice/i);

    const sequences = Sim.buildSequences(history, 'historical', 30, 1000, true);
    const trialInput = {
        retirementSavings: 1000000,
        annualWithdrawal: 40000,
        stockAllocation: 0.5,
        taxRate: 0,
        adjustForInflation: true,
        retirementAge: 65,
        lifeExpectancy: 30,
        returnMode: 'historical',
        includeSS: false,
        ssMonthlyBenefit: out.assumptions.ssMonthlyBenefit,
        ssClaimingAge: 67,
        ssAnnualBase: out.assumptions.ssMonthlyBenefit * IO.SS_AGE_FACTORS[67] * 12,
        includeSpouseSS: false,
        spouseSSMonthlyBenefit: out.assumptions.spouseSSMonthlyBenefit,
        spouseSSClaimingAge: 67,
        spouseSSAnnualBase: out.assumptions.spouseSSMonthlyBenefit * 12,
        includeOtherIncome: false,
        monthlyPension: 0,
        pensionStartAge: 65,
        annualPension: 0,
        monthlyOtherIncome: 0,
        otherIncomeDuration: 0,
        annualOtherIncome: 0
    };
    const preTaxFn = (spend, income) => engine.calculateWithdrawalTax(spend, income, { taxMode: 'simple', flatRate: 0 }).preTaxWithdrawal;
    const summary = directRetirement(trialInput, sequences, preTaxFn);
    assert.equal(out.successes, summary.successes);
    assert.equal(out.successRate, summary.successRate);
    assert.equal(out.medianEndingBalance, summary.medianEndingBalance);
    assert.equal(out.medianEndingRealBalance, summary.medianEndingReal);
    assert.equal(out.scenarioCount, summary.n);
});

test('retirement defaults are the site defaults and dollar amounts are not invented', () => {
    assert.throws(() => callTool('retirement_success', {}), InputError);
    assert.throws(
        () => callTool('retirement_success', { retirementSavings: 1, annualWithdrawal: 1, includeSS: true }),
        /ssMonthlyBenefit is required/
    );
    const out = callTool('retirement_success', {
        retirementSavings: 500000,
        annualWithdrawal: 20000,
        simulationCount: 25,
        seed: 11
    });
    assert.equal(out.modeUsed, 'shuffled');
    assert.equal(out.scenarioCount, 25);
    assert.equal(out.assumptions.retirementAge, 65);
    assert.equal(out.assumptions.horizonYears, 30);
    assert.equal(out.assumptions.stockAllocationPercent, 60);
    assert.equal(out.assumptions.taxRatePercent, 15);
    assert.equal(out.assumptions.adjustForInflation, true);
    assert.equal(out.assumptions.includeSS, false);
    assert.equal(out.assumptions.seed, 11);
    assert.ok(out.assumptions.defaultsApplied.includes('retirementAge'));
    assert.ok(out.assumptions.defaultsApplied.includes('returnMode'));
    assert.ok(!out.assumptions.defaultsApplied.includes('seed'));
    assert.ok(!out.assumptions.defaultsApplied.includes('preTaxPercent'));
    assert.match(out.firecalc_url, /retirementReturnMode=shuffled/);
    assert.match(out.firecalc_url, /seed=11/);
    const parsed = IO.parseShareParams(out.firecalc_url);
    assert.equal(parsed.values.retirementSavings, '500000');
    assert.equal(parsed.values.annualWithdrawal, '20000');
    assert.equal(parsed.checks.includeSS, false);
});

test('the same seed replays retirement_success and a different seed can differ', () => {
    const base = {
        retirementSavings: 800000,
        annualWithdrawal: 45000,
        stockAllocationPercent: 80,
        taxRatePercent: 0,
        horizonYears: 30,
        simulationCount: 200,
        returnMode: 'shuffled'
    };
    const a = callTool('retirement_success', { ...base, seed: 246813 });
    const b = callTool('retirement_success', { ...base, seed: 246813 });
    const c = callTool('retirement_success', { ...base, seed: 135790 });
    assert.equal(a.successes, b.successes);
    assert.equal(a.medianEndingBalance, b.medianEndingBalance);
    assert.notEqual(a.medianEndingBalance, c.medianEndingBalance);
});

test('detailed taxes use calculateWithdrawalTax', () => {
    const shared = {
        retirementSavings: 900000,
        annualWithdrawal: 54000,
        simulationCount: 1,
        seed: 3,
        returnMode: 'shuffled'
    };
    const detailed = callTool('retirement_success', { ...shared, taxMode: 'detailed', stateTaxPercent: 4.5 });
    const direct = engine.calculateWithdrawalTax(54000, { socialSecurity: 0, pension: 0, otherOrdinary: 0 }, {
        taxMode: 'detailed',
        filingStatus: 'mfj',
        preTaxPct: 60,
        rothPct: 20,
        taxablePct: 20,
        optimizeOrder: true,
        stateTaxRate: 4.5
    });
    assert.equal(detailed.firstYearPreTaxDraw, direct.preTaxWithdrawal);
    assert.equal(detailed.assumptions.taxMode, 'detailed');
    assert.ok(detailed.assumptions.defaultsApplied.includes('taxFilingStatus'));
    assert.throws(
        () => callTool('retirement_success', { ...shared, taxMode: 'detailed', preTaxPercent: 50, rothPercent: 20, taxablePercent: 20 }),
        /sum to 100/
    );
});

test('years_to_target matches FirecalcSim and reports defaults', () => {
    const input = {
        currentAge: 35,
        currentSavings: 180000,
        income: 95000,
        expenses: 55000,
        targetAmount: 1200000,
        stockAllocationPercent: 70,
        incomeGrowthPercent: 2,
        returnMode: 'shuffled',
        simulationCount: 80,
        seed: 246813
    };
    const out = callTool('years_to_target', input);
    assert.equal(out.modeUsed, 'shuffled');
    assert.equal(out.scenarioCount, 80);
    assert.equal(out.assumptions.dataWindow, '1975–2024');
    assert.match(out.firecalc_url, /tab=accumulation/);
    const trialInput = {
        currentAge: 35,
        currentSavings: 180000,
        income: 95000,
        expenses: 55000,
        targetAmount: 1200000,
        stockAllocation: 0.7,
        incomeGrowth: 0.02,
        maxYears: 50
    };
    const sequences = Sim.buildSequences(history, 'shuffled', 50, 80, false, Sim.seededRandom(246813));
    const sims = sequences.map(seq => Sim.runAccumulationTrial(trialInput, seq));
    const summary = IO.summarizeSavings(sims, 50);
    assert.equal(out.medianYears, summary.median);
    assert.equal(out.p10Years, summary.p10);
    assert.equal(out.p90Years, summary.p90);
    assert.equal(out.reachedCount, summary.reached);

    const historical = callTool('years_to_target', { ...input, returnMode: 'historical' });
    assert.equal(historical.modeUsed, 'historical');
    assert.equal(historical.scenarioCount, history.length);
    assert.throws(() => callTool('years_to_target', { currentSavings: 1 }), /income is required/);
});

test('run_stress_pack refuses an unknown id and keeps dollars off the card', () => {
    assert.throws(
        () => callTool('run_stress_pack', { pack: 'black-monday', retirementSavings: 1000000, annualWithdrawal: 40000 }),
        /Unknown stress pack "black-monday"/
    );
    assert.throws(
        () => callTool('run_stress_pack', { pack: 'not a pack', retirementSavings: 1, annualWithdrawal: 1 }),
        InputError
    );

    const out = callTool('run_stress_pack', {
        pack: 'dotcom',
        retirementSavings: 1000000,
        annualWithdrawal: 40000,
        horizonYears: 30,
        stockAllocationPercent: 60,
        taxRatePercent: 0,
        retirementAge: 65,
        adjustForInflation: true,
        includeSS: false
    });
    assert.equal(out.modeUsed, 'historical');
    assert.equal(out.scenarioCount, 1);
    assert.equal(out.card.packId, 'dotcom');
    assert.equal(out.card.yearsUsed, 25);
    assert.equal(out.card.startYear, 2000);
    assert.equal(out.card.endYear, 2024);
    assert.equal(out.card.clippedBySample, true);
    assert.equal(out.card.startBalance, undefined);
    assert.equal(out.card.endReal, undefined);
    assert.equal('startBalance' in out.card, false);
    const shown = JSON.stringify(out.card) + out.shareCardSvg;
    assert.doesNotMatch(shown, /1000000|1,000,000|\$/);
    assert.match(out.firecalc_url, /pack=dotcom/);
    assert.match(out.assumptions.defaultsApplied.join(' '), /returnMode|seed|taxMode/);

    const direct = Packs.runPack(Packs.getPack('dotcom'), {
        retirementSavings: 1000000,
        annualWithdrawal: 40000,
        stockAllocation: 0.6,
        taxRate: 0,
        adjustForInflation: true,
        retirementAge: 65,
        lifeExpectancy: 30,
        returnMode: 'historical',
        includeSS: false,
        ssAnnualBase: out.assumptions.ssMonthlyBenefit * 12,
        ssClaimingAge: out.assumptions.ssClaimingAge,
        includeSpouseSS: false,
        spouseSSAnnualBase: out.assumptions.spouseSSMonthlyBenefit * 12,
        spouseSSClaimingAge: out.assumptions.spouseSSClaimingAge,
        includeOtherIncome: false,
        annualPension: 0,
        pensionStartAge: out.assumptions.pensionStartAge,
        annualOtherIncome: 0,
        otherIncomeDuration: 0
    }, {
        preTaxFn: spend => engine.calculateWithdrawalTax(spend, { socialSecurity: 0, pension: 0, otherOrdinary: 0 }, { taxMode: 'simple', flatRate: 0 }).preTaxWithdrawal
    });
    assert.equal(out.card.survived, direct.survived);
    assert.equal(out.card.endMultiple, direct.endMultiple);
    assert.equal(out.card.yearsLasted, direct.yearsLasted);
    assert.equal(out.shareCardSvg, Packs.shareCardSvg(direct));
});

test('run_stress_pack can run the whole gauntlet without dollar amounts on the cards', () => {
    const out = callTool('run_stress_pack', {
        all: true,
        retirementSavings: 1000000,
        annualWithdrawal: 40000,
        taxRatePercent: 0,
        horizonYears: 30
    });
    assert.equal(out.modeUsed, 'historical');
    assert.equal(out.scenarioCount, 6);
    assert.equal(out.cards.length, 6);
    assert.deepEqual(out.cards.map(c => c.packId), ['stagflation', 'rate-wall-81', 'bond-rout-94', 'dotcom', 'gfc', 'rate-shock-22']);
    assert.equal(out.shareCardSvg, undefined);
    for (const card of out.cards) {
        assert.equal(card.startBalance, undefined);
        assert.equal(card.endReal, undefined);
        assert.equal(card.retirementSavings, undefined);
        assert.doesNotMatch(JSON.stringify(card), /\$/);
    }
    assert.doesNotMatch(out.firecalc_url, /pack=/);
});

test('build_firecalc_link round-trips retirement, savings, and a number-free challenge', () => {
    const retirement = callTool('build_firecalc_link', {
        kind: 'retirement',
        ...classic,
        simulationCount: 1000,
        seed: 246813,
        pack: 'dotcom'
    });
    const parsed = IO.parseShareParams(retirement.firecalc_url);
    assert.equal(parsed.kind, 'retirement');
    assert.equal(parsed.pack, 'dotcom');
    assert.equal(parsed.seed, 246813);
    assert.equal(parsed.values.retirementSavings, '1000000');
    assert.equal(parsed.values.annualWithdrawal, '40000');
    assert.equal(parsed.values.retirementStockAllocation, '50');
    assert.equal(parsed.values.retirementReturnMode, 'historical');
    assert.equal(parsed.values.retirementLifeExpectancy, '30');
    assert.equal(parsed.checks.withdrawalAdjustment, true);
    assert.equal(parsed.checks.includeSS, false);
    assert.equal(parsed.tax.taxMode, 'simple');
    assert.equal(retirement.modeUsed, 'historical');
    assert.equal(retirement.scenarioCount, 21);
    const rebuilt = IO.retirementShareUrl({
        retirementAge: 65,
        retirementSavings: 1000000,
        annualWithdrawal: 40000,
        stockAllocationPercent: 50,
        adjustForInflation: true,
        taxRatePercent: 0,
        taxMode: 'simple',
        horizonYears: 30,
        simulationCount: 1000,
        returnMode: 'historical',
        includeSS: false,
        ssMonthlyBenefit: retirement.assumptions.ssMonthlyBenefit,
        ssClaimingAge: retirement.assumptions.ssClaimingAge,
        includeSpouseSS: false,
        spouseSSMonthlyBenefit: retirement.assumptions.spouseSSMonthlyBenefit,
        spouseSSClaimingAge: retirement.assumptions.spouseSSClaimingAge,
        includeOtherIncome: false,
        monthlyPension: 0,
        pensionStartAge: 65,
        monthlyOtherIncome: 0,
        otherIncomeDuration: 0,
        seed: 246813,
        pack: 'dotcom'
    }, 'https://firecalc.ai');
    assert.equal(retirement.firecalc_url, rebuilt);
    assert.equal(IO.parseShareParams(rebuilt).values.retirementAge, parsed.values.retirementAge);

    const savingsInput = {
        kind: 'accumulation',
        currentAge: 35,
        currentSavings: 180000,
        income: 95000,
        expenses: 55000,
        targetAmount: 1200000,
        stockAllocationPercent: 70,
        incomeGrowthPercent: 2,
        simulationCount: 1000,
        returnMode: 'shuffled',
        seed: 246813
    };
    const savings = callTool('build_firecalc_link', savingsInput);
    const saved = IO.parseShareParams(savings.firecalc_url);
    assert.equal(saved.kind, 'accumulation');
    assert.equal(saved.values.currentAge, '35');
    assert.equal(saved.values.targetAmount, '1200000');
    assert.equal(saved.values.stockAllocation, '70');
    assert.equal(saved.values.savingsReturnMode, 'shuffled');
    assert.equal(saved.seed, 246813);
    assert.equal(savings.scenarioCount, 1000);
    assert.equal(savings.firecalc_url, IO.savingsShareUrl({
        currentAge: 35,
        currentSavings: 180000,
        income: 95000,
        expenses: 55000,
        targetAmount: 1200000,
        stockAllocationPercent: 70,
        incomeGrowthPercent: 2,
        simulationCount: 1000,
        returnMode: 'shuffled',
        seed: 246813
    }, 'https://firecalc.ai'));

    const challenge = callTool('build_firecalc_link', { kind: 'challenge', pack: 'gfc' });
    assert.equal(challenge.firecalc_url, 'https://firecalc.ai/?pack=gfc');
    assert.equal(challenge.modeUsed, null);
    assert.equal(challenge.scenarioCount, null);
    assert.equal(challenge.assumptions.carriesPlanNumbers, false);
    assert.doesNotMatch(challenge.firecalc_url, /retirementSavings|annualWithdrawal|\$/);
    assert.throws(() => callTool('build_firecalc_link', { kind: 'challenge', pack: 'nope' }), /Unknown stress pack/);
    assert.throws(
        () => callTool('build_firecalc_link', { kind: 'challenge', pack: 'gfc', retirementSavings: 1 }),
        /Omit plan numbers/
    );
});

test('describe_methodology points at the data window and the full note', () => {
    const out = callTool('describe_methodology', {});
    assert.equal(out.modeUsed, null);
    assert.equal(out.scenarioCount, null);
    assert.equal(out.firecalc_url, 'https://firecalc.ai/llms-full.txt');
    assert.equal(out.assumptions.dataWindow, '1975–2024');
    assert.equal(out.assumptions.hostedCompute, false);
    assert.equal(out.assumptions.localOnly, true);
    assert.equal(out.assumptions.packs.length, 6);
    assert.match(out.summary, /dotcom/);
    const short = readResource('firecalc://methodology');
    assert.match(short.text, /1975–2024/);
    const full = readResource('firecalc://llms-full.txt');
    assert.equal(full.text, readFileSync(join(root, 'llms-full.txt'), 'utf8'));
    assert.throws(() => callTool('describe_methodology', { pack: 'gfc' }), /Unknown field/);
    assert.throws(() => readResource('https://example.com'), InputError);
});

test('the package stays local and the static site has no root package.json', () => {
    assert.equal(existsSync(join(root, 'package.json')), false);
    const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.private, true);
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.bin['firecalc-mcp'], './server.mjs');
    const source = ['server.mjs', 'handlers.mjs', 'engine.mjs'].map(name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')).join('\n');
    assert.doesNotMatch(source, /createServer|listen\(|\bfetch\s*\(|api\.openai|wrangler/i);
    const ai = readFileSync(join(root, 'ai.html'), 'utf8');
    assert.match(ai, /id="mcp"[\s\S]*status-live">Live/);
    assert.match(ai, /mcp\/server\.mjs/);
    assert.match(ai, /Not published/);
    assert.doesNotMatch(ai, /\/api\/simulate|wrangler|openai-proxy|workers\.dev/i);
    const agents = readFileSync(join(root, 'agents.txt'), 'utf8');
    assert.doesNotMatch(agents, /Protocols:|MCP:|Payments:/);
    assert.match(agents, /no hosted agent API/);
});
