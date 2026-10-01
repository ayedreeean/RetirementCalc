import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function loadBrowserScripts() {
    const sandbox = { Math, console, URL, URLSearchParams };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(readFileSync(new URL('./market-data.js', import.meta.url), 'utf8'), sandbox, { filename: 'market-data.js' });
    vm.runInContext(readFileSync(new URL('./firecalc-io.js', import.meta.url), 'utf8'), sandbox, { filename: 'firecalc-io.js' });
    assert.equal(typeof sandbox.document, 'undefined');
    assert.equal(typeof sandbox.window, 'undefined');
    assert.equal(typeof sandbox.FirecalcSim.runRetirementTrial, 'function');
    assert.equal(typeof sandbox.FirecalcIO.parseShareParams, 'function');
    return sandbox;
}

const root = loadBrowserScripts();
const Sim = root.FirecalcSim;
const IO = root.FirecalcIO;
const history = root.FIRECALC_HISTORICAL;

test('market table and a retirement trial run without a DOM', () => {
    assert.equal(history[0].year, 1975);
    assert.equal(history[history.length - 1].year, 2024);
    assert.equal(history.length, 50);
    const sequences = Sim.buildSequences(history, 'historical', 30, 1000, true);
    assert.equal(sequences.length, 21);
    const input = {
        retirementSavings: 1000000,
        annualWithdrawal: 40000,
        stockAllocation: 0.6,
        taxRate: 0.15,
        adjustForInflation: true,
        retirementAge: 65,
        lifeExpectancy: 30,
        returnMode: 'historical',
        includeSS: false,
        ssAnnualBase: 0,
        includeSpouseSS: false,
        spouseSSAnnualBase: 0,
        includeOtherIncome: false,
        annualPension: 0,
        pensionStartAge: 65,
        annualOtherIncome: 0,
        otherIncomeDuration: 0
    };
    const sims = sequences.map(seq => Sim.runRetirementTrial(input, seq));
    const summary = IO.summarizeRetirement(sims, input);
    assert.equal(summary.n, 21);
    assert.equal(summary.successes, sims.filter(s => !s.ranOutOfMoney).length);
    assert.ok(summary.successRate >= 0 && summary.successRate <= 100);
    assert.equal(typeof summary.medianEndingBalance, 'number');
    assert.equal(summary.pctl.real.p50.length, 31);
});

test('the same seed replays the same shuffled summary', () => {
    const input = {
        retirementSavings: 800000,
        annualWithdrawal: 45000,
        stockAllocation: 0.8,
        taxRate: 0,
        adjustForInflation: true,
        retirementAge: 60,
        lifeExpectancy: 30,
        returnMode: 'shuffled',
        includeSS: false,
        ssAnnualBase: 0,
        includeSpouseSS: false,
        spouseSSAnnualBase: 0,
        includeOtherIncome: false,
        annualPension: 0,
        pensionStartAge: 65,
        annualOtherIncome: 0,
        otherIncomeDuration: 0
    };
    const run = () => {
        const sequences = Sim.buildSequences(history, 'shuffled', 30, 200, true, Sim.seededRandom(246813));
        return IO.summarizeRetirement(sequences.map(seq => Sim.runRetirementTrial(input, seq)), input);
    };
    const a = run();
    const b = run();
    assert.equal(a.successes, b.successes);
    assert.equal(a.medianEndingBalance, b.medianEndingBalance);
    const other = IO.summarizeRetirement(
        Sim.buildSequences(history, 'shuffled', 30, 200, true, Sim.seededRandom(135790))
            .map(seq => Sim.runRetirementTrial(input, seq)),
        input
    );
    assert.notEqual(a.medianEndingBalance, other.medianEndingBalance);
});

test('savings summary matches years-to-goal ordering', () => {
    const sims = [
        { yearsToTarget: 12 },
        { yearsToTarget: null },
        { yearsToTarget: 4 },
        { yearsToTarget: 9 }
    ];
    const summary = IO.summarizeSavings(sims, 50);
    assert.equal(summary.n, 4);
    // Same index the page uses: floor(n * 0.5), not a midpoint average.
    assert.equal(summary.median, 12);
    assert.equal(summary.p10, 4);
    assert.equal(summary.reached, 3);
    assert.equal(summary.reachedPct, 75);
});

test('share codec round-trips the retirement and savings keys', () => {
    const retirement = IO.retirementShareUrl({
        retirementAge: 55,
        retirementSavings: 1200000,
        annualWithdrawal: 48000,
        stockAllocationPercent: 60,
        adjustForInflation: true,
        taxRatePercent: 15,
        taxMode: 'simple',
        horizonYears: 35,
        simulationCount: 1000,
        returnMode: 'historical',
        includeSS: false,
        ssMonthlyBenefit: 2000,
        ssClaimingAge: 67,
        includeSpouseSS: false,
        spouseSSMonthlyBenefit: 1500,
        spouseSSClaimingAge: 67,
        includeOtherIncome: false,
        monthlyPension: 0,
        pensionStartAge: 65,
        monthlyOtherIncome: 0,
        otherIncomeDuration: 0,
        seed: 246813
    });
    const parsed = IO.parseShareParams(retirement);
    assert.equal(parsed.kind, 'retirement');
    assert.equal(parsed.seed, 246813);
    assert.equal(parsed.values.retirementAge, '55');
    assert.equal(parsed.values.annualWithdrawal, '48000');
    assert.equal(parsed.values.retirementReturnMode, 'historical');
    assert.equal(parsed.checks.includeSS, false);
    assert.equal(parsed.checks.withdrawalAdjustment, true);
    assert.equal(parsed.tax.taxMode, 'simple');
    assert.equal(IO.shareUrl({
        tab: 'retirement',
        seed: parsed.seed,
        values: parsed.values,
        checks: parsed.checks,
        taxEntries: [['taxMode', parsed.tax.taxMode]]
    }), retirement);

    const savings = IO.savingsShareUrl({
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
    });
    const saved = IO.parseShareParams(savings);
    assert.equal(saved.kind, 'accumulation');
    assert.equal(saved.values.stockAllocation, '70');
    assert.equal(saved.values.savingsReturnMode, 'shuffled');
    assert.equal(IO.parseShareParams('').empty, true);
    assert.equal(IO.parseShareParams('?seed=5').kind, null);
});

test('the AI hub is static and points at the codec links', () => {
    const page = readFileSync(new URL('./ai.html', import.meta.url), 'utf8');
    const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.match(page, /No public compute API/);
    assert.match(page, /FIRE calculator for ChatGPT, MCP, and AI agents/);
    assert.match(page, /property="og:title"/);
    assert.match(page, /name="description"/);
    assert.match(page, /href="\/llms\.txt"/);
    assert.match(page, /href="\/llms-full\.txt"/);
    assert.match(page, /href="\/agents\.txt"/);
    assert.match(page, /href="\/agents\.json"/);
    assert.match(page, /Not published/);
    assert.match(page, /currentAge=35/);
    assert.match(page, /retirementReturnMode=historical/);
    assert.match(page, /seed=246813/);
    assert.doesNotMatch(page, /\/api\/simulate|wrangler|openai-proxy|api\.openai\.com/i);
    assert.match(index, /firecalc-io\.js\?v=/);
    assert.match(index, /href="\/ai"/);
    assert.doesNotMatch(index, /aiAnalysis|openai-proxy|AI Analysis|openaiApiKey/);
    const agents = readFileSync(new URL('./agents.txt', import.meta.url), 'utf8');
    const agentsJson = JSON.parse(readFileSync(new URL('./agents.json', import.meta.url), 'utf8'));
    const llms = readFileSync(new URL('./llms.txt', import.meta.url), 'utf8');
    const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
    assert.match(agents, /https:\/\/firecalc\.ai\/ai/);
    assert.doesNotMatch(agents, /Protocols:|MCP:|Payments:/);
    assert.match(agentsJson.site.description, /https:\/\/firecalc\.ai\/ai/);
    assert.match(agentsJson.site.description, /no public compute API/);
    assert.match(agentsJson.site.description, /link-only MCP/);
    assert.match(llms, /https:\/\/firecalc\.ai\/ai/);
    assert.doesNotMatch(llms, /OpenAI/i);
    assert.match(sitemap, /<loc>https:\/\/firecalc\.ai\/ai<\/loc>/);
});
