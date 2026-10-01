import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { callTool } from '../../../mcp/handlers.mjs';
import { PACK_CATALOG, buildShareLink } from '../../../mcp/share-link.mjs';
import { createFetch } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function loadPacks() {
    const sandbox = { Math, console, URL, URLSearchParams };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    for (const file of ['market-data.js', 'firecalc-io.js', 'stress-packs.js']) {
        vm.runInContext(readFileSync(join(root, file), 'utf8'), sandbox, { filename: file });
    }
    return sandbox;
}

const site = loadPacks();
const IO = site.FirecalcIO;
const Packs = site.FirecalcPacks;
const history = site.FIRECALC_HISTORICAL;

function meta(pack) {
    return {
        id: pack.id,
        name: pack.name,
        villainLabel: pack.villainLabel,
        startYear: pack.startYear,
        villainYears: [...pack.villainYears],
        copy: pack.copy,
        note: pack.note || null
    };
}

const classic = {
    kind: 'retirement',
    retirementSavings: 1000000,
    annualWithdrawal: 40000,
    stockAllocationPercent: 50,
    taxRatePercent: 0,
    returnMode: 'historical',
    horizonYears: 30,
    simulationCount: 1000,
    seed: 246813,
    pack: 'dotcom'
};

test('pack catalog matches the site packs and challenge URLs match FirecalcIO', () => {
    const available = Packs.availablePacks(history);
    assert.deepEqual(PACK_CATALOG.map(meta), Array.from(available, meta));
    assert.equal(history[0].year, 1975);
    assert.equal(history.at(-1).year, 2024);
    assert.equal(history.length, 50);
    for (const pack of PACK_CATALOG) {
        assert.equal(site.FirecalcIO.challengeUrl(pack.id), `https://firecalc.ai/?pack=${pack.id}`);
    }
});

test('hosted links match FirecalcIO and the local link tool, without a trial count', () => {
    const local = callTool('build_firecalc_link', classic);
    const hosted = buildShareLink(classic, { surface: 'hosted' });
    assert.equal(hosted.firecalc_url, local.firecalc_url);
    assert.equal(hosted.compute, false);
    assert.equal(hosted.scenarioCount, null);
    assert.equal(local.scenarioCount, 21);
    const parsed = IO.parseShareParams(hosted.firecalc_url);
    assert.equal(parsed.pack, 'dotcom');
    assert.equal(parsed.values.retirementSavings, '1000000');
    assert.equal(parsed.values.annualWithdrawal, '40000');
    assert.equal(parsed.values.retirementStockAllocation, '50');
    assert.equal(parsed.values.retirementReturnMode, 'historical');
    assert.equal(IO.retirementShareUrl({
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
        ssMonthlyBenefit: hosted.assumptions.ssMonthlyBenefit,
        ssClaimingAge: 67,
        includeSpouseSS: false,
        spouseSSMonthlyBenefit: hosted.assumptions.spouseSSMonthlyBenefit,
        spouseSSClaimingAge: 67,
        includeOtherIncome: false,
        monthlyPension: 0,
        pensionStartAge: 65,
        monthlyOtherIncome: 0,
        otherIncomeDuration: 0,
        seed: 246813,
        pack: 'dotcom'
    }), hosted.firecalc_url);

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
    const saved = buildShareLink(savingsInput, { surface: 'hosted' });
    assert.equal(saved.firecalc_url, callTool('build_firecalc_link', savingsInput).firecalc_url);
    assert.equal(saved.firecalc_url, IO.savingsShareUrl({
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
    }));
    assert.equal(saved.compute, false);
    assert.equal(saved.scenarioCount, null);

    const challenge = buildShareLink({ kind: 'challenge', pack: 'gfc' }, { surface: 'hosted' });
    assert.equal(challenge.firecalc_url, IO.challengeUrl('gfc'));
    assert.equal(challenge.firecalc_url, 'https://firecalc.ai/?pack=gfc');
    assert.equal(challenge.assumptions.carriesPlanNumbers, false);
    assert.doesNotMatch(challenge.firecalc_url, /retirementSavings|annualWithdrawal|currentSavings/);
});

test('a plan link refuses missing dollars instead of inventing them', () => {
    assert.throws(
        () => buildShareLink({ kind: 'retirement', retirementAge: 55 }, { surface: 'hosted' }),
        /retirementSavings is required\. This tool does not invent dollar amounts/
    );
    assert.throws(
        () => buildShareLink({ kind: 'accumulation', currentAge: 35 }, { surface: 'hosted' }),
        /currentSavings is required\. This tool does not invent dollar amounts/
    );
    assert.throws(
        () => buildShareLink({ kind: 'retirement', retirementSavings: 1, annualWithdrawal: 1, includeSS: true }, { surface: 'hosted' }),
        /ssMonthlyBenefit is required/
    );
    assert.throws(
        () => buildShareLink({ kind: 'challenge', pack: 'gfc', retirementSavings: 1 }, { surface: 'hosted' }),
        /carries only the pack id/
    );
    const refused = buildShareLink.toString();
    assert.doesNotMatch(refused, /1000000|40000|180000/);
});

async function rpc(fetchImpl, id, method, params, extra) {
    const response = await fetchImpl(new Request('https://mcp.example/mcp', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            ...(extra || {})
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params })
    }));
    return { status: response.status, body: await response.json() };
}

test('the HTTPS MCP lists link tools only and does not log plan dollars', async () => {
    const logs = [];
    const fetchImpl = createFetch({ log: event => logs.push(event) });

    const health = await fetchImpl(new Request('https://mcp.example/'));
    const healthBody = await health.json();
    assert.equal(health.status, 200);
    assert.equal(healthBody.ok, true);
    assert.equal(healthBody.compute, false);
    assert.equal(healthBody.mcp, '/mcp');
    assert.match(healthBody.privacy, /not logged/);

    const init = await rpc(fetchImpl, 1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    assert.equal(init.body.result.serverInfo.name, 'firecalc-link');
    assert.match(init.body.result.instructions, /does not run trials/i);
    assert.equal(init.body.result.capabilities.tools.listChanged, false);

    const notify = await fetchImpl(new Request('https://mcp.example/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
    }));
    assert.equal(notify.status, 202);
    assert.equal(await notify.text(), '');

    const listed = await rpc(fetchImpl, 2, 'tools/list', {});
    const names = listed.body.result.tools.map(tool => tool.name).sort();
    assert.deepEqual(names, [
        'build_firecalc_link',
        'challenge_link',
        'describe_methodology',
        'list_stress_packs',
        'validate_share_params'
    ]);
    assert.ok(!names.includes('retirement_success'));
    assert.ok(!names.includes('run_stress_pack'));
    assert.ok(!names.includes('years_to_target'));

    const built = await rpc(fetchImpl, 3, 'tools/call', {
        name: 'build_firecalc_link',
        arguments: { kind: 'retirement', retirementSavings: 1234567, annualWithdrawal: 40000 }
    });
    const plan = JSON.parse(built.body.result.content[0].text);
    assert.equal(plan.compute, false);
    assert.equal(plan.scenarioCount, null);
    assert.match(plan.firecalc_url, /retirementSavings=1234567/);
    assert.equal(plan.firecalc_url, callTool('build_firecalc_link', {
        kind: 'retirement',
        retirementSavings: 1234567,
        annualWithdrawal: 40000
    }).firecalc_url);
    assert.equal(JSON.stringify(logs).includes('1234567'), false);
    assert.equal(JSON.stringify(logs).includes('40000'), false);
    assert.ok(logs.some(line => line.tool === 'build_firecalc_link' && line.rpc === 'tools/call'));

    const refused = await rpc(fetchImpl, 4, 'tools/call', {
        name: 'retirement_success',
        arguments: { retirementSavings: 2000000, annualWithdrawal: 80000 }
    });
    assert.equal(refused.body.result.isError, true);
    assert.match(refused.body.result.content[0].text, /does not run simulations/);
    assert.equal(JSON.stringify(logs).includes('2000000'), false);

    const packs = await rpc(fetchImpl, 5, 'tools/call', { name: 'list_stress_packs', arguments: {} });
    const packBody = JSON.parse(packs.body.result.content[0].text);
    assert.equal(packBody.compute, false);
    assert.equal(packBody.packs.length, 6);
    assert.equal(packBody.packs.find(pack => pack.id === 'dotcom').challengeUrl, 'https://firecalc.ai/?pack=dotcom');

    const challenge = await rpc(fetchImpl, 6, 'tools/call', { name: 'challenge_link', arguments: { pack: 'rate-shock-22' } });
    const challengeBody = JSON.parse(challenge.body.result.content[0].text);
    assert.equal(challengeBody.firecalc_url, IO.challengeUrl('rate-shock-22'));

    const described = await rpc(fetchImpl, 7, 'tools/call', { name: 'describe_methodology', arguments: {} });
    const method = JSON.parse(described.body.result.content[0].text);
    assert.equal(method.compute, false);
    assert.equal(method.assumptions.runsTrials, false);
    assert.equal(method.firecalc_url, 'https://firecalc.ai/llms-full.txt');
    assert.match(method.summary, /does not run a savings trial/);

    const checked = await rpc(fetchImpl, 8, 'tools/call', {
        name: 'validate_share_params',
        arguments: { url: plan.firecalc_url }
    });
    const validation = JSON.parse(checked.body.result.content[0].text);
    assert.equal(validation.compute, false);
    assert.equal(validation.kind, 'retirement');
    assert.equal(validation.values.retirementSavings, '1234567');
    assert.equal(validation.packOnly, false);

    const packOnly = await rpc(fetchImpl, 9, 'tools/call', {
        name: 'validate_share_params',
        arguments: { url: 'https://firecalc.ai/?pack=gfc' }
    });
    const only = JSON.parse(packOnly.body.result.content[0].text);
    assert.equal(only.packOnly, true);
    assert.equal(only.packKnown, true);
    assert.equal(IO.isPackOnly(only.pack ? `?pack=${only.pack}` : 'https://firecalc.ai/?pack=gfc'), true);

    const oauth = await fetchImpl(new Request('https://mcp.example/.well-known/oauth-protected-resource'));
    assert.equal(oauth.status, 404);
    const oauthBody = await oauth.json();
    assert.equal(oauthBody.error, 'oauth_not_used');

    const getMcp = await fetchImpl(new Request('https://mcp.example/mcp'));
    assert.equal(getMcp.status, 405);

    const huge = 'x'.repeat(70 * 1024);
    const tooBig = await fetchImpl(new Request('https://mcp.example/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: huge
    }));
    assert.equal(tooBig.status, 413);
    assert.equal(JSON.stringify(logs).includes(huge.slice(0, 100)), false);
});

test('worker sources do not import the simulator', () => {
    const files = [
        'workers/firecalc-link-mcp/src/index.js',
        'workers/firecalc-link-mcp/src/tools.js',
        'mcp/share-link.mjs'
    ].map(file => readFileSync(join(root, file), 'utf8')).join('\n');
    const imports = files.split('\n').filter(line => /^\s*import\b/.test(line) || /\bfrom\s+['"]/.test(line)).join('\n');
    assert.doesNotMatch(imports, /engine\.mjs|market-data|stress-packs|tax-engine/);
    assert.doesNotMatch(files, /runRetirementTrial|runGauntlet|summarizeRetirement|summarizeSavings|\.runPack\(/);
    const ai = readFileSync(join(root, 'ai.html'), 'utf8');
    assert.match(ai, /id="mcp"[\s\S]*status-live">Live/);
    assert.match(ai, /id="mcp-hosted"[\s\S]*status-draft">Draft/);
    assert.match(ai, /Not published/);
    assert.doesNotMatch(ai, /\/api\/simulate|wrangler|openai-proxy|workers\.dev/i);
});
