// Hosted tools. Every handler lives in mcp/share-link.mjs and only builds URLs
// or describes the method. Do not import engine.mjs, market-data.js, or
// stress-packs.js from this folder.
import {
    InputError,
    buildShareLink,
    describeMethodologyHosted,
    listStressPacks,
    validateShareParams
} from '../../../mcp/share-link.mjs';

const readOnly = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
};

const retirementFields = {
    retirementSavings: { type: 'number', minimum: 0, description: 'Portfolio at retirement, in dollars. Required for a retirement link. Do not guess.' },
    annualWithdrawal: { type: 'number', minimum: 0, description: 'Annual after-tax spending, in dollars. Required for a retirement link. Do not guess.' },
    retirementAge: { type: 'integer', minimum: 30, maximum: 90, description: 'Default 65, disclosed in assumptions.' },
    horizonYears: { type: 'integer', minimum: 5, maximum: 50, description: 'Years after retirement. Default 30.' },
    stockAllocationPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Percent in the S&P 500. 60 means 60%, not 0.60. Default 60 on a retirement link and 70 on a savings link.' },
    adjustForInflation: { type: 'boolean', description: 'Raise spending with CPI from the second year. Default true.' },
    returnMode: { type: 'string', enum: ['shuffled', 'historical'], description: 'Default shuffled. This server does not run either mode.' },
    simulationCount: { type: 'integer', minimum: 1, maximum: 5000, description: 'Stored on the link. Default 1000. Not a path count this server computed.' },
    seed: { type: 'integer', minimum: 1, description: 'Stored on the link. Default 246813. This server does not shuffle paths.' },
    taxMode: { type: 'string', enum: ['simple', 'detailed'], description: 'Default simple.' },
    taxRatePercent: { type: 'number', minimum: 0, maximum: 99, description: 'Flat tax percent. Default 15 when taxMode is simple.' },
    taxFilingStatus: { type: 'string', enum: ['mfj', 'single'], description: 'Detailed mode. Default mfj.' },
    preTaxPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Detailed mode. Default 60. The three mix fields must sum to 100.' },
    rothPercent: { type: 'number', minimum: 0, maximum: 100, description: 'Detailed mode. Default 20.' },
    taxablePercent: { type: 'number', minimum: 0, maximum: 100, description: 'Detailed mode. Default 20.' },
    optimizeOrder: { type: 'boolean', description: 'Detailed mode. Default true. Does not change results on the site.' },
    stateTaxPercent: { type: 'number', minimum: 0, maximum: 15, description: 'Detailed mode. Default 0.' },
    includeSS: { type: 'boolean', description: 'Default false. When true, ssMonthlyBenefit is required. Do not invent a benefit.' },
    ssMonthlyBenefit: { type: 'number', minimum: 0, description: 'Monthly benefit at age 67. Required when includeSS is true.' },
    ssClaimingAge: { type: 'integer', description: '62–70. Default 67.' },
    includeSpouseSS: { type: 'boolean', description: 'Default false. When true, spouseSSMonthlyBenefit is required.' },
    spouseSSMonthlyBenefit: { type: 'number', minimum: 0, description: 'Required when includeSpouseSS is true.' },
    spouseSSClaimingAge: { type: 'integer', description: '62–70. Default 67.' },
    includeOtherIncome: { type: 'boolean', description: 'Default false.' },
    monthlyPension: { type: 'number', minimum: 0, description: 'Nominal dollars per month. Default 0. Not a plan you should invent.' },
    pensionStartAge: { type: 'integer', description: 'Default 65.' },
    monthlyOtherIncome: { type: 'number', minimum: 0, description: 'Default 0.' },
    otherIncomeDuration: { type: 'integer', minimum: 0, maximum: 50, description: 'Years. 0 means the whole horizon. Default 0.' },
    pack: { type: 'string', description: 'Known stress pack id. Retirement and challenge links only.' }
};

const savingsFields = {
    currentSavings: { type: 'number', minimum: 0, description: 'Invested today, in dollars. Required for a savings link. Do not guess.' },
    income: { type: 'number', minimum: 0, description: 'Annual after-tax income, in dollars. Required for a savings link. Do not guess.' },
    expenses: { type: 'number', minimum: 0, description: 'Annual spending, in dollars. Required for a savings link. Do not guess.' },
    targetAmount: { type: 'number', minimum: 0, description: 'Goal in today’s dollars. Required for a savings link. Do not guess.' },
    currentAge: { type: 'integer', minimum: 18, maximum: 90, description: 'Default 30.' },
    incomeGrowthPercent: { type: 'number', minimum: 0, maximum: 10, description: 'Real raises above inflation, in percent. Default 2.' }
};

export const HOSTED_TOOLS = [
    {
        name: 'build_firecalc_link',
        description: 'Build an https://firecalc.ai share URL with FirecalcIO. kind is retirement, accumulation, or challenge. A challenge link is only a pack id and has no plan numbers. Portfolio, withdrawal, income, spending, and the savings goal are required for a plan link and are never invented. Does not run a trial and does not return a success rate. Illustration, not advice.',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['kind'],
            properties: {
                kind: { type: 'string', enum: ['retirement', 'accumulation', 'challenge'] },
                ...retirementFields,
                ...savingsFields
            }
        },
        annotations: readOnly,
        _meta: {
            'openai/toolInvocation/invoking': 'Building a FIREcalc link',
            'openai/toolInvocation/invoked': 'Built a FIREcalc link'
        },
        handler(args) {
            return buildShareLink(args, { surface: 'hosted' });
        }
    },
    {
        name: 'describe_methodology',
        description: 'Describe the FIREcalc 1975–2024 sample, the success definition, and the stress packs. No simulation and no success rate.',
        inputSchema: { type: 'object', additionalProperties: false, properties: {} },
        annotations: readOnly,
        _meta: {
            'openai/toolInvocation/invoking': 'Reading the FIREcalc methodology',
            'openai/toolInvocation/invoked': 'Described the FIREcalc methodology'
        },
        handler(args) {
            rejectEmpty(args);
            return describeMethodologyHosted();
        }
    },
    {
        name: 'list_stress_packs',
        description: 'List the six named historical stress packs and the challenge link for each. A challenge link names the pack only. Does not run the pack.',
        inputSchema: { type: 'object', additionalProperties: false, properties: {} },
        annotations: readOnly,
        _meta: {
            'openai/toolInvocation/invoking': 'Listing FIREcalc stress packs',
            'openai/toolInvocation/invoked': 'Listed FIREcalc stress packs'
        },
        handler(args) {
            rejectEmpty(args);
            return listStressPacks();
        }
    },
    {
        name: 'challenge_link',
        description: 'Return https://firecalc.ai/?pack=<id> for one known stress pack. The URL has no portfolio and no spending. Does not run the pack.',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['pack'],
            properties: {
                pack: { type: 'string', description: 'One of stagflation, rate-wall-81, bond-rout-94, dotcom, gfc, rate-shock-22.' }
            }
        },
        annotations: readOnly,
        _meta: {
            'openai/toolInvocation/invoking': 'Building a challenge link',
            'openai/toolInvocation/invoked': 'Built a challenge link'
        },
        handler(args) {
            const pack = args && args.pack;
            return buildShareLink({ kind: 'challenge', pack }, { surface: 'hosted' });
        }
    },
    {
        name: 'validate_share_params',
        description: 'Read a firecalc.ai share URL and report which parameters are present and whether a pack id is known. Does not run the plan and does not fill in missing dollars.',
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['url'],
            properties: {
                url: { type: 'string', description: 'A https://firecalc.ai URL or a query string.' }
            }
        },
        annotations: readOnly,
        _meta: {
            'openai/toolInvocation/invoking': 'Reading a FIREcalc link',
            'openai/toolInvocation/invoked': 'Read a FIREcalc link'
        },
        handler(args) {
            return validateShareParams(args);
        }
    }
];

function rejectEmpty(args) {
    const extra = Object.keys(args || {});
    if (extra.length) throw new InputError(`Unknown field: ${extra.join(', ')}.`);
}

const REFUSED = new Set(['retirement_success', 'years_to_target', 'run_stress_pack', 'simulate', 'run_retirement', 'run_pack']);

export function listHostedTools() {
    return HOSTED_TOOLS.map(({ name, description, inputSchema, annotations, _meta }) => ({
        name, description, inputSchema, annotations, _meta
    }));
}

export function callHostedTool(name, args) {
    if (typeof name !== 'string' || REFUSED.has(name) || /simulat|success_rate|run_pack|gauntlet|trial/i.test(name)) {
        throw new InputError('This server does not run simulations. Use build_firecalc_link, challenge_link, list_stress_packs, describe_methodology, or validate_share_params.');
    }
    const tool = HOSTED_TOOLS.find(item => item.name === name);
    if (!tool) throw new InputError(`Unknown tool "${name}".`);
    if (args == null) args = {};
    if (typeof args !== 'object' || Array.isArray(args)) throw new InputError('Tool arguments must be an object.');
    return tool.handler(args);
}

export { InputError };
