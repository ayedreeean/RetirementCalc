import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { engine } from './mcp/engine.mjs';
import { CONSENT_TEXT } from './functions/_lib/signup.js';

const { FirecalcSim: Sim, FirecalcIO: IO, FirecalcPacks: Packs } = engine;
const read = (path) => readFileSync(path, 'utf8');

const PAGES = [
    'guides/when-can-i-retire.html',
    'guides/retire-on-one-million.html',
    'guides/fire-calculator-for-families.html',
    'guides/coast-fire.html',
    'guides/four-percent-rule.html'
];

function savings(cfg) {
    const rng = Sim.seededRandom(246813);
    const sequences = Sim.buildSequences(null, cfg.returnMode, 50, cfg.simulationCount, false, rng);
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
    return IO.summarizeSavings(sims, 50);
}

function retirement(cfg) {
    const full = cfg.returnMode === 'historical';
    const sequences = Sim.buildSequences(null, cfg.returnMode, cfg.horizonYears, cfg.simulationCount || 1000, full, Sim.seededRandom(246813));
    const factor = (age) => IO.SS_AGE_FACTORS[age] || 1;
    const inp = {
        retirementAge: cfg.retirementAge,
        retirementSavings: cfg.retirementSavings,
        annualWithdrawal: cfg.annualWithdrawal,
        adjustForInflation: true,
        taxRate: cfg.taxRatePercent / 100,
        stockAllocation: cfg.stockAllocationPercent / 100,
        lifeExpectancy: cfg.horizonYears,
        returnMode: cfg.returnMode,
        includeSS: !!cfg.includeSS,
        ssClaimingAge: cfg.ssClaimingAge || 67,
        ssAnnualBase: cfg.includeSS ? cfg.ssMonthlyBenefit * factor(cfg.ssClaimingAge || 67) * 12 : 0,
        includeSpouseSS: !!cfg.includeSpouseSS,
        spouseSSClaimingAge: cfg.spouseSSClaimingAge || 67,
        spouseSSAnnualBase: cfg.includeSpouseSS ? cfg.spouseSSMonthlyBenefit * factor(cfg.spouseSSClaimingAge || 67) * 12 : 0,
        includeOtherIncome: false,
        annualPension: 0,
        annualOtherIncome: 0,
        pensionStartAge: 65,
        otherIncomeDuration: 0
    };
    const sims = sequences.map(seq => Sim.runRetirementTrial(inp, seq));
    return IO.summarizeRetirement(sims, inp);
}

test('guide pages are indexable, consented, and deep-link real share params', () => {
    const sitemap = read('sitemap.xml');
    const llms = read('llms.txt');
    const home = read('index.html');
    const robots = read('robots.txt');
    assert.match(robots, /Disallow:\s*\/api\//);
    assert.match(robots, /Allow:\s*\/app\.js/);
    assert.match(sitemap, /<lastmod>2026-09-25<\/lastmod>/);
    for (const file of PAGES) {
        const html = read(file);
        const slug = file.slice('guides/'.length, -'.html'.length);
        assert.match(html, new RegExp(`<title>[^<]+</title>`));
        assert.match(html, new RegExp(`<link rel="canonical" href="https://firecalc.ai/guides/${slug}">`));
        assert.match(html, new RegExp(`<meta property="og:url" content="https://firecalc.ai/guides/${slug}">`));
        assert.match(html, /<meta name="description" content="[^"]{40,}"/);
        assert.match(html, /"@type":"FAQPage"/);
        assert.match(html, /G-57CCGCXNJT/);
        assert.ok(html.includes(CONSENT_TEXT));
        assert.match(html, /1975/);
        assert.doesNotMatch(html, /OpenAI|Bloomberg aggregate|1975–2020|1975-2020/i);
        assert.match(sitemap, new RegExp(`<loc>https://firecalc.ai/guides/${slug}</loc>`));
        assert.ok(llms.includes(`https://firecalc.ai/guides/${slug}`));
        assert.ok(home.includes(`/guides/${slug}`));
        const links = [...html.matchAll(/href="(\/\?[^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
        assert.ok(links.length >= 1, file);
        for (const link of links) {
            const parsed = IO.parseShareParams(link.replace(/^\/\?/, '?'));
            assert.equal(parsed.empty, false, link);
            assert.ok(parsed.kind === 'accumulation' || parsed.kind === 'retirement', link);
        }
    }
});

test('worked examples match the engine', () => {
    const when = read('guides/when-can-i-retire.html');
    const million = read('guides/retire-on-one-million.html');
    const family = read('guides/fire-calculator-for-families.html');
    const coast = read('guides/coast-fire.html');
    const rule = read('guides/four-percent-rule.html');

    const whenS = savings({ currentAge: 38, currentSavings: 220000, income: 110000, expenses: 72000, targetAmount: 1800000, stockAllocationPercent: 70, incomeGrowthPercent: 2, simulationCount: 1000, returnMode: 'shuffled' });
    assert.match(when, new RegExp(`the median path takes ${whenS.median} years`, 'i'));
    assert.match(when, new RegExp(`by ${whenS.p10} years`));
    assert.match(when, new RegExp(`at least ${whenS.p90} years`));
    const whenH = savings({ currentAge: 38, currentSavings: 220000, income: 110000, expenses: 72000, targetAmount: 1800000, stockAllocationPercent: 70, incomeGrowthPercent: 2, simulationCount: 1000, returnMode: 'historical' });
    assert.match(when, new RegExp(`${whenH.reached} of ${whenH.n} start years`));

    const main = savings({ currentAge: 32, currentSavings: 80000, income: 95000, expenses: 62000, targetAmount: 1000000, stockAllocationPercent: 70, incomeGrowthPercent: 2, simulationCount: 1000, returnMode: 'shuffled' });
    assert.match(million, new RegExp(`the median path takes ${main.median} years`, 'i'));
    const close = savings({ currentAge: 45, currentSavings: 650000, income: 120000, expenses: 80000, targetAmount: 1000000, stockAllocationPercent: 60, incomeGrowthPercent: 1, simulationCount: 1000, returnMode: 'shuffled' });
    assert.match(million, new RegExp(`the median path takes ${close.median} years`, 'i'));
    const half = savings({ currentAge: 30, currentSavings: 40000, income: 75000, expenses: 50000, targetAmount: 500000, stockAllocationPercent: 80, incomeGrowthPercent: 2, simulationCount: 1000, returnMode: 'shuffled' });
    assert.match(million, new RegExp(`the median path takes ${half.median} years`, 'i'));
    const two = savings({ currentAge: 35, currentSavings: 250000, income: 160000, expenses: 90000, targetAmount: 2000000, stockAllocationPercent: 80, incomeGrowthPercent: 2, simulationCount: 1000, returnMode: 'shuffled' });
    assert.match(million, new RegExp(`the median path takes ${two.median} years`, 'i'));

    const fam = savings({ currentAge: 34, currentSavings: 180000, income: 150000, expenses: 110000, targetAmount: 1750000, stockAllocationPercent: 70, incomeGrowthPercent: 1, simulationCount: 1000, returnMode: 'shuffled' });
    assert.match(family, new RegExp(`the median path takes ${fam.median} years`, 'i'));
    assert.match(family, /no separate input for each child/i);
    const famBase = { retirementAge: 60, retirementSavings: 1750000, stockAllocationPercent: 60, taxRatePercent: 15, horizonYears: 35, returnMode: 'historical', ssClaimingAge: 67, spouseSSClaimingAge: 67, ssMonthlyBenefit: 2200, spouseSSMonthlyBenefit: 1600 };
    const at = (withdrawal, ss) => retirement({ ...famBase, annualWithdrawal: withdrawal, includeSS: ss, includeSpouseSS: ss });
    const off70 = at(70000, false);
    const on100 = at(100000, true);
    const off100 = at(100000, false);
    const off110 = at(110000, false);
    assert.match(family, new RegExp(`${off70.successes} of ${off70.n}`));
    assert.match(family, new RegExp(`${off100.successes} of ${off100.n}`));
    assert.match(family, new RegExp(`${on100.successes} of ${on100.n}`));
    assert.match(family, new RegExp(`${off110.successes} of ${off110.n}`));
    assert.match(family, /includeSpouseSS=true/);

    const coastS = savings({ currentAge: 40, currentSavings: 450000, income: 85000, expenses: 85000, targetAmount: 1500000, stockAllocationPercent: 80, incomeGrowthPercent: 0, simulationCount: 1000, returnMode: 'shuffled' });
    assert.match(coast, new RegExp(`the median path takes ${coastS.median} years`, 'i'));
    assert.match(coast, new RegExp(`${coastS.reached} of ${coastS.n.toLocaleString('en-US')}`));
    const coastH = savings({ currentAge: 40, currentSavings: 450000, income: 85000, expenses: 85000, targetAmount: 1500000, stockAllocationPercent: 80, incomeGrowthPercent: 0, simulationCount: 1000, returnMode: 'historical' });
    assert.match(coast, new RegExp(`${coastH.reached} of ${coastH.n} start years`));
    assert.match(coast, /does not solve for the balance you would need today/);
    assert.match(coast, /incomeGrowth=0/);

    const classic = retirement({ retirementAge: 65, retirementSavings: 1000000, annualWithdrawal: 40000, stockAllocationPercent: 50, taxRatePercent: 0, horizonYears: 30, returnMode: 'historical', includeSS: false, includeSpouseSS: false });
    assert.match(rule, new RegExp(`${classic.successes} of ${classic.n}`));
    const shuffled = retirement({ retirementAge: 65, retirementSavings: 1000000, annualWithdrawal: 40000, stockAllocationPercent: 50, taxRatePercent: 0, horizonYears: 30, returnMode: 'shuffled', simulationCount: 1000, includeSS: false, includeSpouseSS: false });
    assert.match(rule, new RegExp(`${shuffled.successes} of ${shuffled.n.toLocaleString('en-US')}`));
    assert.match(rule, /not a full-history Trinity/);
    assert.match(rule, /taxRate=0/);
    assert.match(rule, /includeSS=false/);

    const packInput = {
        retirementAge: 65, retirementSavings: 1000000, annualWithdrawal: 40000,
        adjustForInflation: true, taxRate: 0, stockAllocation: 0.5, lifeExpectancy: 30,
        includeSS: false, includeSpouseSS: false, includeOtherIncome: false,
        ssAnnualBase: 0, spouseSSAnnualBase: 0, ssClaimingAge: 67, spouseSSClaimingAge: 67,
        pensionStartAge: 65, annualPension: 0, annualOtherIncome: 0, otherIncomeDuration: 0
    };
    const results = Packs.availablePacks().map(pack => Packs.runPack(pack, packInput));
    assert.equal(results.length, 6);
    if (results.every(r => r.survived)) assert.match(rule, /none of the six packs ran out of money/);
    const stag = results.find(r => r.pack.id === 'stagflation');
    assert.match(rule, new RegExp(`${stag.window.startYear}–${stag.window.endYear}`));
    assert.match(rule, new RegExp(`${Math.round(stag.low.multiple * 100)}%`));
    for (const id of ['dotcom', 'gfc', 'rate-shock-22']) {
        const row = results.find(r => r.pack.id === id);
        assert.match(rule, new RegExp(`${row.window.startYear}–${row.window.endYear}, ${row.window.years} years`));
    }
});

test('signup code does not run the simulator, and the privacy policy covers the list', () => {
    const sources = [
        'functions/_lib/signup.js',
        'functions/api/signup.js',
        'functions/api/unsubscribe.js'
    ].map(read).join('\n');
    assert.doesNotMatch(sources, /FirecalcSim|market-data|runRetirementTrial|runAccumulationTrial/);
    const privacy = read('privacy-policy.html');
    assert.match(privacy, /Google Analytics 4/);
    assert.match(privacy, /Cloudflare Web Analytics/);
    assert.match(privacy, /unsubscribe/);
    assert.match(privacy, /FIRECALC_SIGNUPS/);
    assert.match(privacy, /2026-10-26\.2/);
    assert.match(privacy, /suppression/);
    assert.doesNotMatch(privacy, /OpenAI|AI Analysis|openai/i);
    const home = read('index.html');
    assert.ok(home.includes(CONSENT_TEXT));
    assert.match(home, /G-57CCGCXNJT/);
    assert.doesNotMatch(read('wrangler.toml'), /^\s*pages_build_output_dir\s*=/m);
});
