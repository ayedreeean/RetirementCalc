// MCP tool handlers. They shape inputs the way app.js does, then call the
// shared engine. They do not contain a second copy of the trial loop.
// Share URLs are built in share-link.mjs, which does not load FirecalcSim.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { engine, repoRootPath } from './engine.mjs';
import {
    DISCLAIMER,
    InputError,
    ORIGIN,
    buildShareLink,
    resolveRetirement,
    resolveSavings,
    retirementAssumptions,
    savingsAssumptions,
    shareConfig
} from './share-link.mjs';

export { DISCLAIMER, InputError, ORIGIN };

const Sim = engine.FirecalcSim;
const IO = engine.FirecalcIO;
const Packs = engine.FirecalcPacks;
const history = engine.FIRECALC_HISTORICAL;
const DATA_FIRST = history[0].year;
const DATA_LAST = history[history.length - 1].year;

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


function buildFirecalcLink(args) {
    const built = buildShareLink(args);
    const kind = args && args.kind;
    if (kind === 'challenge') return built;
    if (kind === 'accumulation') {
        built.scenarioCount = built.modeUsed === 'historical'
            ? Sim.buildSequences(history, 'historical', IO.MAX_ACCUMULATION_YEARS, 1, false).length
            : built.assumptions.simulationCount;
        return built;
    }
    if (built.modeUsed === 'historical') {
        const windows = Sim.buildSequences(history, 'historical', built.assumptions.horizonYears, 1, true);
        if (!windows.length) {
            throw new InputError(`The ${DATA_FIRST}–${DATA_LAST} sample has no complete ${built.assumptions.horizonYears}-year window.`);
        }
        built.scenarioCount = windows.length;
    } else {
        built.scenarioCount = built.assumptions.simulationCount;
    }
    return built;
}

function rejectUnknown(args, allowed) {
    const extra = Object.keys(args || {}).filter(k => !allowed.has(k));
    if (extra.length) throw new InputError(`Unknown field: ${extra.join(', ')}.`);
}

function sampleAssumptions() {
    return {
        dataWindow: `${DATA_FIRST}–${DATA_LAST}`,
        rows: history.length,
        assets: 'S&P 500 total return (dividends included) and that year’s 10-year US Treasury total return. CPI is on the same row. Treasuries can be negative. This is not the Bloomberg US Aggregate.',
        notInSample: '1966 and 1973–74 are before the table. There is no pack for those years.',
        engine: 'FirecalcSim (market-data.js), FirecalcIO (firecalc-io.js), FirecalcPacks (stress-packs.js), calculateWithdrawalTax (tax-engine.js)',
        disclaimer: DISCLAIMER
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
