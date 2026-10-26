import './dom-stub.js';
import '../market-data.js';
import '../firecalc-io.js';
import '../tax-engine.js';

export function getEngine() {
    const Sim = globalThis.FirecalcSim;
    const IO = globalThis.FirecalcIO;
    const calculateWithdrawalTax = globalThis.calculateWithdrawalTax;
    if (typeof Sim?.runAccumulationTrial !== 'function' || typeof IO?.parseShareParams !== 'function') {
        throw new Error('FIREcalc engine did not load');
    }
    if (typeof calculateWithdrawalTax !== 'function') {
        throw new Error('Tax helper did not load');
    }
    return {
        Sim,
        IO,
        data: globalThis.FIRECALC_HISTORICAL,
        calculateWithdrawalTax
    };
}
