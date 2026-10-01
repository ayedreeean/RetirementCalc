// Loads the site's calculator scripts into a DOM-free sandbox.
// Trial math stays in ../market-data.js (FirecalcSim). Share links stay in
// ../firecalc-io.js. Packs stay in ../stress-packs.js. Bracket taxes stay in
// ../tax-engine.js (calculateWithdrawalTax). This file does not reimplement them.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEngine() {
    const sandbox = {
        Math,
        console,
        URL,
        URLSearchParams,
        localStorage: {
            getItem() { return null; },
            setItem() {}
        },
        document: {
            addEventListener() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
            getElementById() { return null; }
        }
    };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    for (const file of ['market-data.js', 'firecalc-io.js', 'stress-packs.js', 'tax-engine.js']) {
        const code = readFileSync(join(repoRoot, file), 'utf8');
        vm.runInContext(code, sandbox, { filename: file });
    }
    if (typeof sandbox.FirecalcSim?.runRetirementTrial !== 'function') {
        throw new Error('FirecalcSim did not load');
    }
    if (typeof sandbox.FirecalcIO?.retirementShareUrl !== 'function') {
        throw new Error('FirecalcIO did not load');
    }
    if (typeof sandbox.FirecalcPacks?.runPack !== 'function') {
        throw new Error('FirecalcPacks did not load');
    }
    if (typeof sandbox.calculateWithdrawalTax !== 'function') {
        throw new Error('calculateWithdrawalTax did not load');
    }
    return sandbox;
}

export const repoRootPath = repoRoot;
export const engine = loadEngine();
