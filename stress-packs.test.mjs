import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function load() {
    const sandbox = { Math, console, URL, URLSearchParams };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const file of ['market-data.js', 'firecalc-io.js', 'stress-packs.js']) {
        vm.runInContext(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'), sandbox, { filename: file });
    }
    assert.equal(typeof sandbox.document, 'undefined');
    return sandbox;
}

const root = load();
const Sim = root.FirecalcSim;
const IO = root.FirecalcIO;
const Packs = root.FirecalcPacks;
const history = root.FIRECALC_HISTORICAL;
const FIRST = history[0].year;
const LAST = history[history.length - 1].year;

function plan(overrides) {
    return Object.assign({
        retirementSavings: 1000000,
        annualWithdrawal: 40000,
        stockAllocation: 0.6,
        taxRate: 0.15,
        adjustForInflation: true,
        retirementAge: 65,
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
    }, overrides || {});
}

test('every pack sits inside the 1975–2024 table', () => {
    assert.equal(FIRST, 1975);
    assert.equal(LAST, 2024);
    const ids = new Set();
    assert.ok(Packs.PACKS.length >= 5 && Packs.PACKS.length <= 7);
    for (const p of Packs.PACKS) {
        assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
        ids.add(p.id);
        assert.match(p.id, IO.PACK_ID_RE);
        assert.ok(p.name && p.copy && p.villainLabel, `${p.id} needs copy`);
        assert.ok(Number.isInteger(p.startYear));
        assert.ok(p.startYear >= FIRST && p.startYear <= LAST, `${p.id} start ${p.startYear}`);
        assert.ok(p.villainYears[0] >= p.startYear, `${p.id} villain starts before the pack`);
        assert.ok(p.villainYears[1] >= p.villainYears[0]);
        assert.ok(p.villainYears[1] <= LAST, `${p.id} villain ends after ${LAST}`);
        assert.equal(Packs.isInSample(p), true);
        assert.equal(Packs.getPack(p.id), p);
    }
    assert.equal(Packs.availablePacks().length, Packs.PACKS.length);
});

test('packs outside the table, or unknown ids, are refused', () => {
    assert.equal(Packs.isInSample({ startYear: 1966, villainYears: [1966, 1966] }), false);
    assert.equal(Packs.isInSample({ startYear: 1973, villainYears: [1973, 1974] }), false);
    assert.equal(Packs.isInSample({ startYear: 2023, villainYears: [2023, 2025] }), false);
    assert.equal(Packs.isInSample({ startYear: 2000, villainYears: [1999, 2002] }), false);
    assert.equal(Packs.isInSample({ startYear: 2000.5, villainYears: [2001, 2002] }), false);
    assert.equal(Packs.packWindow({ startYear: 1973, villainYears: [1973, 1974] }, 30), null);
    assert.equal(Packs.getPack('black-monday'), null);
    assert.equal(Packs.getPack('covid'), null);
    assert.equal(Packs.getPack('DOTCOM'), null);
    assert.equal(Packs.getPack('<script>'), null);
    assert.equal(Packs.getPack(undefined), null);
    // A table that stops before a pack's villain years hides that pack.
    const short = history.filter(r => r.year <= 2005);
    assert.equal(Packs.getPack('gfc', short), null);
    assert.ok(!Packs.availablePacks(short).some(p => p.id === 'gfc' || p.id === 'rate-shock-22'));
});

test('windows use exact, contiguous years and clip at 2024', () => {
    const dotcom = Packs.getPack('dotcom');
    const w = Packs.packWindow(dotcom, 30);
    assert.equal(w.startYear, 2000);
    assert.equal(w.endYear, 2024);
    assert.equal(w.years, 25);
    assert.equal(w.clippedBySample, true);
    assert.deepEqual(Array.from(w.sequence, r => r.year), Array.from({ length: 25 }, (_, i) => 2000 + i));

    const stag = Packs.getPack('stagflation');
    const w30 = Packs.packWindow(stag, 30);
    assert.equal(w30.endYear, 2006);
    assert.equal(w30.clippedBySample, false);
    const w5 = Packs.packWindow(stag, 5);
    assert.equal(`${w5.startYear}-${w5.endYear}`, '1977-1981');
    // Shorter than the villain stretch: the whole stretch still runs.
    const w2 = Packs.packWindow(stag, 2);
    assert.equal(w2.years, 5);

    const shock = Packs.packWindow(Packs.getPack('rate-shock-22'), 30);
    assert.equal(Packs.yearsLabel(shock), '2022–2024');
    assert.equal(shock.years, 3);

    for (const p of Packs.PACKS) {
        for (const horizon of [5, 30, 50]) {
            const win = Packs.packWindow(p, horizon);
            assert.ok(win.startYear >= FIRST && win.endYear <= LAST, `${p.id} ${horizon}`);
            assert.ok(win.endYear >= p.villainYears[1]);
            assert.equal(win.sequence.length, win.years);
            win.sequence.forEach((row, i) => assert.equal(row.year, win.startYear + i));
            assert.match(Packs.yearsDisclosure(Packs.runPack(p, plan({ lifeExpectancy: horizon }))), new RegExp(Packs.yearsLabel(win)));
        }
    }
});

test('a pack run is the engine run on that slice of the table', () => {
    const input = plan({ includeSS: true, ssAnnualBase: 24000, ssClaimingAge: 67, retirementAge: 62 });
    for (const p of Packs.PACKS) {
        const r = Packs.runPack(p, input);
        const w = Packs.packWindow(p, input.lifeExpectancy);
        const direct = Sim.runRetirementTrial(Object.assign({}, input, { lifeExpectancy: w.years, returnMode: 'historical' }), history.slice(history.findIndex(x => x.year === p.startYear)).slice(0, w.years));
        assert.deepEqual(JSON.parse(JSON.stringify(r.trial)), JSON.parse(JSON.stringify(direct)), p.id);
        assert.equal(r.trial.startYear, p.startYear);
        assert.equal(r.path.length, r.trial.yearlyData.length + 1);
    }
    const preTaxFn = spend => spend * 1.25;
    const withTax = Packs.runPack(Packs.getPack('gfc'), input, { preTaxFn });
    const gfcWin = Packs.packWindow(Packs.getPack('gfc'), 30);
    const directTax = Sim.runRetirementTrial(Object.assign({}, input, { lifeExpectancy: gfcWin.years }), gfcWin.sequence, preTaxFn);
    assert.equal(withTax.trial.finalBalance, directTax.finalBalance);
});

test('scoreboard: verdicts, low point, and villain stats come from the table', () => {
    const g = Packs.runGauntlet(plan());
    assert.equal(g.total, Packs.PACKS.length);
    assert.equal(g.survived, g.results.filter(r => r.survived).length);

    const dot = g.results.find(r => r.pack.id === 'dotcom');
    assert.equal(dot.verdict, 'smaller');
    assert.ok(dot.endMultiple > 0 && dot.endMultiple < 1);
    assert.ok(dot.low.year >= 2000 && dot.low.year <= 2024);
    assert.ok(Math.abs(dot.villain.stocks - ((1 - 0.091) * (1 - 0.119) * (1 - 0.22) - 1)) < 1e-12);
    assert.equal(Packs.signedPct(dot.villain.stocks), '−37.5%');

    const harsh = Packs.runGauntlet(plan({ annualWithdrawal: 75000, stockAllocation: 1, taxRate: 0 }));
    const out = harsh.results.find(r => r.pack.id === 'dotcom');
    assert.equal(out.verdict, 'out');
    assert.ok(out.ranOutYear >= 2000 && out.ranOutYear <= 2024);
    assert.equal(out.ranOutAge, 65 + out.yearsLasted);
    assert.equal(harsh.toughest.survived, false);

    const note = Packs.notOfferedNote();
    assert.match(note, /1966 or 1973–74/);
    assert.match(note, /\+5\.6% in 1987/);
    assert.match(note, /\+18\.4% in 2020/);
});

test('share links carry the pack and round-trip', () => {
    const config = {
        retirementAge: 60, retirementSavings: 1100000, annualWithdrawal: 44000, stockAllocationPercent: 70,
        adjustForInflation: true, taxRatePercent: 15, taxMode: 'simple', horizonYears: 30, simulationCount: 1000,
        returnMode: 'historical', includeSS: false, ssMonthlyBenefit: 2000, ssClaimingAge: 67, includeSpouseSS: false,
        spouseSSMonthlyBenefit: 1500, spouseSSClaimingAge: 67, includeOtherIncome: false, monthlyPension: 0,
        pensionStartAge: 65, monthlyOtherIncome: 0, otherIncomeDuration: 0, seed: 246813
    };
    const plain = IO.retirementShareUrl(config);
    assert.doesNotMatch(plain, /pack=/);
    const url = IO.retirementShareUrl(Object.assign({}, config, { pack: 'dotcom' }));
    assert.match(url, /&pack=dotcom$/);
    const parsed = IO.parseShareParams(url);
    assert.equal(parsed.kind, 'retirement');
    assert.equal(parsed.pack, 'dotcom');
    assert.equal(Packs.getPack(parsed.pack).startYear, 2000);
    assert.equal(IO.shareUrl({
        tab: 'retirement', seed: parsed.seed, pack: parsed.pack, values: parsed.values, checks: parsed.checks,
        taxEntries: [['taxMode', parsed.tax.taxMode]]
    }), url);
    assert.equal(IO.isPackOnly(url), false);

    const challenge = IO.challengeUrl('stagflation');
    assert.equal(challenge, 'https://firecalc.ai/?pack=stagflation');
    const c = IO.parseShareParams(challenge);
    assert.equal(c.kind, 'retirement');
    assert.equal(c.pack, 'stagflation');
    assert.deepEqual(Object.keys(c.values), []);
    assert.equal(IO.isPackOnly(challenge), true);
    assert.equal(IO.isPackOnly('?tab=retirement&pack=gfc'), true);
    assert.equal(IO.isPackOnly('?tab=accumulation&pack=gfc'), false);
    assert.equal(IO.isPackOnly('?retirementAge=60&pack=gfc'), false);

    const bad = IO.parseShareParams('?pack=%3Cscript%3E');
    assert.equal(bad.pack, null);
    assert.equal(bad.packRequested, '<script>');
    assert.equal(IO.challengeUrl('<script>'), null);
    assert.equal(IO.parseShareParams('?tab=accumulation&currentAge=35&pack=dotcom').pack, null);
    assert.equal(IO.buildShareParams({ tab: 'retirement', pack: 'Not valid!' }).has('pack'), false);
});

test('the share card discloses years, stays illustrative, and leaves out dollar amounts', () => {
    for (const p of Packs.PACKS) {
        const r = Packs.runPack(p, plan());
        const svg = Packs.shareCardSvg(r);
        assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1200" height="630"/);
        assert.ok(svg.includes(Packs.escapeXml(p.name)), p.id);
        assert.ok(svg.includes(Packs.yearsLabel(r.window)), `${p.id} years`);
        assert.match(svg, /Illustration, not advice/);
        assert.match(svg, /1975–2024/);
        assert.ok(svg.includes(`firecalc.ai/?pack=${p.id}`));
        assert.doesNotMatch(svg, /\$\s?\d/);
        assert.doesNotMatch(svg, /1,000,000|40,000/);
        assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
    }
    const out = Packs.runPack(Packs.getPack('dotcom'), plan({ annualWithdrawal: 75000, stockAllocation: 1, taxRate: 0 }));
    assert.match(Packs.shareCardSvg(out), /Ran out in 20\d\d/);
    const zero = Packs.runPack(Packs.getPack('gfc'), plan({ retirementSavings: 0 }));
    assert.doesNotMatch(Packs.shareCardSvg(zero), /NaN|undefined|Infinity/);

    const fake = Object.assign({}, Packs.runPack(Packs.getPack('gfc'), plan()));
    fake.pack = Object.assign({}, fake.pack, { name: 'A <b>&"bad"</b> name' });
    const svg = Packs.shareCardSvg(fake, { linkText: 'x<y' });
    assert.doesNotMatch(svg, /<b>/);
    assert.match(svg, /A &lt;b&gt;&amp;&quot;bad&quot;&lt;\/b&gt; name/);
    assert.match(svg, /x&lt;y/);
});

test('calculator and /ai hub wire the packs in', () => {
    const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    const ai = readFileSync(new URL('./ai.html', import.meta.url), 'utf8');
    const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
    assert.ok(index.indexOf('firecalc-io.js?v=') < index.indexOf('stress-packs.js?v='));
    assert.ok(index.indexOf('stress-packs.js?v=') < index.indexOf('app.js?v='));
    assert.match(index, /id="packsCard"/);
    assert.match(index, /data-open-packs/);
    assert.match(app, /Packs\.runGauntlet/);
    assert.match(app, /applyPackFromLink/);
    assert.match(ai, /Named historical stress packs<\/span><span class="badge status status-live">Live/);
    for (const p of Packs.PACKS) assert.ok(ai.includes(`?pack=${p.id}`), `ai.html links ${p.id}`);
    assert.doesNotMatch(ai, /\/api\/simulate|wrangler|openai/i);
});
