// ============================================
// TAX ENGINE — FIRECalc Tax Modeling Module
// 2025 Federal Tax Brackets & Capital Gains
// ============================================

(function() {
    'use strict';

    // ============================================
    // TAX BRACKET DATA (2025) — easy to update yearly
    // ============================================
    const TAX_YEAR = 2025;

    const FEDERAL_BRACKETS = {
        single: [
            { min: 0,      max: 11925,   rate: 0.10 },
            { min: 11925,  max: 48475,   rate: 0.12 },
            { min: 48475,  max: 103350,  rate: 0.22 },
            { min: 103350, max: 197300,  rate: 0.24 },
            { min: 197300, max: 250525,  rate: 0.32 },
            { min: 250525, max: 626350,  rate: 0.35 },
            { min: 626350, max: Infinity, rate: 0.37 }
        ],
        mfj: [
            { min: 0,      max: 23850,   rate: 0.10 },
            { min: 23850,  max: 96950,   rate: 0.12 },
            { min: 96950,  max: 206700,  rate: 0.22 },
            { min: 206700, max: 394600,  rate: 0.24 },
            { min: 394600, max: 501050,  rate: 0.32 },
            { min: 501050, max: 751600,  rate: 0.35 },
            { min: 751600, max: Infinity, rate: 0.37 }
        ]
    };

    const STANDARD_DEDUCTION = {
        single: 15000,
        mfj: 30000
    };

    const CAPITAL_GAINS_BRACKETS = {
        single: [
            { min: 0,      max: 48350,  rate: 0.00 },
            { min: 48350,  max: 533400, rate: 0.15 },
            { min: 533400, max: Infinity, rate: 0.20 }
        ],
        mfj: [
            { min: 0,      max: 96700,  rate: 0.00 },
            { min: 96700,  max: 600050, rate: 0.15 },
            { min: 600050, max: Infinity, rate: 0.20 }
        ]
    };

    // ============================================
    // CORE TAX FUNCTIONS
    // ============================================

    /**
     * Calculate federal income tax using progressive brackets.
     * @param {number} taxableIncome - Income after deductions
     * @param {string} filingStatus - 'single' or 'mfj'
     * @returns {number} Federal tax owed
     */
    function calculateFederalTax(taxableIncome, filingStatus) {
        if (taxableIncome <= 0) return 0;
        const brackets = FEDERAL_BRACKETS[filingStatus] || FEDERAL_BRACKETS.mfj;
        let tax = 0;
        let remaining = taxableIncome;

        for (const bracket of brackets) {
            const taxableInBracket = Math.min(remaining, bracket.max - bracket.min);
            if (taxableInBracket <= 0) break;
            tax += taxableInBracket * bracket.rate;
            remaining -= taxableInBracket;
        }
        return tax;
    }

    /**
     * Calculate capital gains tax based on taxable income stack.
     * Capital gains are "stacked" on top of ordinary income to determine the rate.
     * @param {number} gains - Long-term capital gains
     * @param {number} ordinaryTaxableIncome - Ordinary taxable income (after deduction)
     * @param {string} filingStatus - 'single' or 'mfj'
     * @returns {number} Capital gains tax owed
     */
    function calculateCapitalGainsTax(gains, ordinaryTaxableIncome, filingStatus) {
        if (gains <= 0) return 0;
        const brackets = CAPITAL_GAINS_BRACKETS[filingStatus] || CAPITAL_GAINS_BRACKETS.mfj;
        let tax = 0;
        let gainsRemaining = gains;
        // Stack gains on top of ordinary income
        let incomeFloor = Math.max(0, ordinaryTaxableIncome);

        for (const bracket of brackets) {
            if (gainsRemaining <= 0) break;
            const bracketSpace = Math.max(0, bracket.max - Math.max(incomeFloor, bracket.min));
            const taxableInBracket = Math.min(gainsRemaining, bracketSpace);
            if (taxableInBracket <= 0) continue;
            tax += taxableInBracket * bracket.rate;
            gainsRemaining -= taxableInBracket;
            incomeFloor += taxableInBracket;
        }
        return tax;
    }

    /**
     * Calculate how much of Social Security income is taxable.
     * Based on provisional income thresholds (MFJ: $32K/$44K; Single: $25K/$34K).
     * @param {number} ssIncome - Total Social Security income
     * @param {number} otherIncome - All other income (including tax-exempt interest)
     * @returns {number} Taxable portion of SS income
     */
    function calculateSSTaxableAmount(ssIncome, otherIncome) {
        if (ssIncome <= 0) return 0;
        // Provisional income = other income + 50% of SS
        const provisionalIncome = otherIncome + (ssIncome * 0.5);

        // Using MFJ thresholds as default (most common for retirees)
        // Single: $25K / $34K; MFJ: $32K / $44K
        // For simplicity, use MFJ thresholds; filingStatus can be added later
        const lowerThreshold = 32000;
        const upperThreshold = 44000;

        if (provisionalIncome <= lowerThreshold) {
            return 0;
        } else if (provisionalIncome <= upperThreshold) {
            // Up to 50% taxable
            return Math.min(ssIncome * 0.5, (provisionalIncome - lowerThreshold) * 0.5);
        } else {
            // Up to 85% taxable
            const base = Math.min(ssIncome * 0.5, (upperThreshold - lowerThreshold) * 0.5);
            const additional = Math.min(
                ssIncome * 0.85 - base,
                (provisionalIncome - upperThreshold) * 0.85
            );
            return Math.min(ssIncome * 0.85, base + additional);
        }
    }

    /**
     * Calculate total effective tax rate given income breakdown.
     * @param {number} totalIncome - Gross total income
     * @param {string} filingStatus - 'single' or 'mfj'
     * @param {object} incomeBreakdown - { traditional401k, rothConversion, socialSecurity, pension, capitalGains, otherOrdinary }
     * @returns {{ effectiveRate: number, totalTax: number, federalTax: number, capitalGainsTax: number, ssTaxableAmount: number }}
     */
    function calculateEffectiveTaxRate(totalIncome, filingStatus, incomeBreakdown) {
        const ib = incomeBreakdown || {};
        const ssIncome = ib.socialSecurity || 0;
        const capitalGains = ib.capitalGains || 0;
        const ordinaryIncome = (ib.traditional401k || 0) + (ib.rothConversion || 0) +
                               (ib.pension || 0) + (ib.otherOrdinary || 0);

        // Calculate taxable SS
        const ssTaxable = calculateSSTaxableAmount(ssIncome, ordinaryIncome + capitalGains);

        // Total ordinary taxable income (before deduction)
        const grossOrdinary = ordinaryIncome + ssTaxable;
        const deduction = STANDARD_DEDUCTION[filingStatus] || STANDARD_DEDUCTION.mfj;
        const taxableOrdinary = Math.max(0, grossOrdinary - deduction);

        // Federal tax on ordinary income
        const federalTax = calculateFederalTax(taxableOrdinary, filingStatus);

        // Capital gains tax (stacked on ordinary)
        const cgTax = calculateCapitalGainsTax(capitalGains, taxableOrdinary, filingStatus);

        const totalTax = federalTax + cgTax;
        const effectiveRate = totalIncome > 0 ? totalTax / totalIncome : 0;

        return {
            effectiveRate,
            totalTax,
            federalTax,
            capitalGainsTax: cgTax,
            ssTaxableAmount: ssTaxable
        };
    }

    // ============================================
    // TAX-AWARE WITHDRAWAL LOGIC
    // ============================================

    /**
     * Main integration function for the retirement simulation.
     * Calculates the actual tax on a withdrawal given account mix and income sources.
     *
     * @param {number} withdrawalAmount - Desired after-tax withdrawal
     * @param {object} incomeBreakdown - { socialSecurity, pension, otherOrdinary }
     * @param {object} settings - Tax strategy settings from UI
     * @returns {{ preTaxWithdrawal: number, totalTax: number, effectiveRate: number, bucketWithdrawals: object }}
     */
    function calculateWithdrawalTax(withdrawalAmount, incomeBreakdown, settings) {
        // Simple mode: flat rate (identical to current behavior)
        if (!settings || settings.taxMode === 'simple') {
            const flatRate = (settings && settings.flatRate != null) ? settings.flatRate : 0.15;
            const preTax = withdrawalAmount / (1 - flatRate);
            return {
                preTaxWithdrawal: preTax,
                totalTax: preTax - withdrawalAmount,
                effectiveRate: flatRate,
                bucketWithdrawals: { pretax: preTax, roth: 0, taxable: 0 }
            };
        }

        // Detailed mode
        const filingStatus = settings.filingStatus || 'mfj';
        const preTaxPct = (settings.preTaxPct != null ? settings.preTaxPct : 60) / 100;
        const rothPct = (settings.rothPct != null ? settings.rothPct : 20) / 100;
        const taxablePct = (settings.taxablePct != null ? settings.taxablePct : 20) / 100;
        const optimizeOrder = settings.optimizeOrder !== false;
        const stateTaxRate = (settings.stateTaxRate || 0) / 100;

        const ib = incomeBreakdown || {};
        const ssIncome = ib.socialSecurity || 0;
        const pensionIncome = ib.pension || 0;
        const otherOrdinary = ib.otherOrdinary || 0;

        // Determine withdrawal from each bucket
        // If optimize order, we draw in order: taxable → pretax → roth
        // Otherwise, proportional to account mix percentages
        let taxableWithdrawal, pretaxWithdrawal, rothWithdrawal;

        // Use portfolio balances if provided, otherwise use percentages
        const balances = settings.portfolioBalances || null;

        if (optimizeOrder && balances) {
            // Optimal order: taxable first, then pretax, then roth
            let needed = withdrawalAmount; // We'll iterate to find correct gross
            // First pass estimate: assume ~20% tax
            let grossEstimate = withdrawalAmount * 1.2;

            // Iterative solver (3 iterations is usually enough)
            for (let iter = 0; iter < 5; iter++) {
                taxableWithdrawal = Math.min(grossEstimate, balances.taxable || 0);
                let remainder = grossEstimate - taxableWithdrawal;
                pretaxWithdrawal = Math.min(remainder, balances.pretax || 0);
                remainder -= pretaxWithdrawal;
                rothWithdrawal = Math.min(remainder, balances.roth || 0);

                // Calculate tax on this mix
                const capitalGains = taxableWithdrawal * 0.5; // Assume 50% of taxable is gains
                const ordinaryFromWithdrawal = pretaxWithdrawal;
                const totalOrdinary = ordinaryFromWithdrawal + pensionIncome + otherOrdinary;
                const ssTaxable = calculateSSTaxableAmount(ssIncome, totalOrdinary + capitalGains);
                const deduction = STANDARD_DEDUCTION[filingStatus] || STANDARD_DEDUCTION.mfj;
                const taxableOrdinary = Math.max(0, totalOrdinary + ssTaxable - deduction);

                const fedTax = calculateFederalTax(taxableOrdinary, filingStatus);
                const cgTax = calculateCapitalGainsTax(capitalGains, taxableOrdinary, filingStatus);
                const stateTax = (totalOrdinary + capitalGains) * stateTaxRate;
                const totalTax = fedTax + cgTax + stateTax;

                const afterTax = grossEstimate - totalTax;
                // Adjust gross estimate
                if (Math.abs(afterTax - withdrawalAmount) < 1) break;
                grossEstimate = grossEstimate * (withdrawalAmount / afterTax);
            }

            const capitalGains = taxableWithdrawal * 0.5;
            const totalOrdinary = pretaxWithdrawal + pensionIncome + otherOrdinary;
            const ssTaxable = calculateSSTaxableAmount(ssIncome, totalOrdinary + capitalGains);
            const deduction = STANDARD_DEDUCTION[filingStatus] || STANDARD_DEDUCTION.mfj;
            const taxableOrdinary = Math.max(0, totalOrdinary + ssTaxable - deduction);
            const fedTax = calculateFederalTax(taxableOrdinary, filingStatus);
            const cgTax = calculateCapitalGainsTax(capitalGains, taxableOrdinary, filingStatus);
            const stateTax = (totalOrdinary + capitalGains) * stateTaxRate;
            const totalTax = fedTax + cgTax + stateTax;
            const preTaxTotal = taxableWithdrawal + pretaxWithdrawal + rothWithdrawal;

            return {
                preTaxWithdrawal: preTaxTotal,
                totalTax,
                effectiveRate: preTaxTotal > 0 ? totalTax / preTaxTotal : 0,
                bucketWithdrawals: { pretax: pretaxWithdrawal, roth: rothWithdrawal, taxable: taxableWithdrawal }
            };
        }

        // Proportional withdrawal (no optimization or no balances)
        // Iterative solver for proportional split
        let grossEstimate = withdrawalAmount * 1.15;

        for (let iter = 0; iter < 5; iter++) {
            taxableWithdrawal = grossEstimate * taxablePct;
            pretaxWithdrawal = grossEstimate * preTaxPct;
            rothWithdrawal = grossEstimate * rothPct;

            const capitalGains = taxableWithdrawal * 0.5;
            const totalOrdinary = pretaxWithdrawal + pensionIncome + otherOrdinary;
            const ssTaxable = calculateSSTaxableAmount(ssIncome, totalOrdinary + capitalGains);
            const deduction = STANDARD_DEDUCTION[filingStatus] || STANDARD_DEDUCTION.mfj;
            const taxableOrdinary = Math.max(0, totalOrdinary + ssTaxable - deduction);

            const fedTax = calculateFederalTax(taxableOrdinary, filingStatus);
            const cgTax = calculateCapitalGainsTax(capitalGains, taxableOrdinary, filingStatus);
            const stateTax = (totalOrdinary + capitalGains) * stateTaxRate;
            const totalTax = fedTax + cgTax + stateTax;

            const afterTax = grossEstimate - totalTax;
            if (Math.abs(afterTax - withdrawalAmount) < 1) break;
            grossEstimate = grossEstimate * (withdrawalAmount / afterTax);
        }

        const capitalGains = taxableWithdrawal * 0.5;
        const totalOrdinary = pretaxWithdrawal + pensionIncome + otherOrdinary;
        const ssTaxable = calculateSSTaxableAmount(ssIncome, totalOrdinary + capitalGains);
        const deduction = STANDARD_DEDUCTION[filingStatus] || STANDARD_DEDUCTION.mfj;
        const taxableOrdinary = Math.max(0, totalOrdinary + ssTaxable - deduction);
        const fedTax = calculateFederalTax(taxableOrdinary, filingStatus);
        const cgTax = calculateCapitalGainsTax(capitalGains, taxableOrdinary, filingStatus);
        const stateTax = (totalOrdinary + capitalGains) * stateTaxRate;
        const totalTax = fedTax + cgTax + stateTax;
        const preTaxTotal = taxableWithdrawal + pretaxWithdrawal + rothWithdrawal;

        return {
            preTaxWithdrawal: preTaxTotal,
            totalTax,
            effectiveRate: preTaxTotal > 0 ? totalTax / preTaxTotal : 0,
            bucketWithdrawals: { pretax: pretaxWithdrawal, roth: rothWithdrawal, taxable: taxableWithdrawal }
        };
    }

    // ============================================
    // UI HELPERS
    // ============================================

    /** Get current tax settings from the UI */
    function getTaxSettings() {
        const modeEl = document.querySelector('input[name="taxMode"]:checked');
        const mode = modeEl ? modeEl.value : 'simple';

        if (mode === 'simple') {
            const flatRate = parseFloat(document.getElementById('taxRate').value) / 100;
            return { taxMode: 'simple', flatRate: isNaN(flatRate) ? 0.15 : flatRate };
        }

        return {
            taxMode: 'detailed',
            filingStatus: document.getElementById('taxFilingStatus') ?
                document.getElementById('taxFilingStatus').value : 'mfj',
            preTaxPct: parseFloat(document.getElementById('taxPreTaxPct')?.value) || 60,
            rothPct: parseFloat(document.getElementById('taxRothPct')?.value) || 20,
            taxablePct: parseFloat(document.getElementById('taxTaxablePct')?.value) || 20,
            optimizeOrder: document.getElementById('taxOptimizeOrder')?.checked !== false,
            stateTaxRate: parseFloat(document.getElementById('taxStateRate')?.value) || 0
        };
    }

    /** Save tax settings to localStorage */
    function saveTaxSettings() {
        try {
            const settings = getTaxSettings();
            localStorage.setItem('firecalc_tax_settings', JSON.stringify(settings));
        } catch(e) {}
    }

    /** Load tax settings from localStorage */
    function loadTaxSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('firecalc_tax_settings'));
            if (!saved) return;

            // Set mode radio
            const modeRadio = document.querySelector(`input[name="taxMode"][value="${saved.taxMode}"]`);
            if (modeRadio) {
                modeRadio.checked = true;
                toggleTaxMode(saved.taxMode);
            }

            if (saved.taxMode === 'detailed') {
                if (document.getElementById('taxFilingStatus')) document.getElementById('taxFilingStatus').value = saved.filingStatus || 'mfj';
                if (document.getElementById('taxPreTaxPct')) document.getElementById('taxPreTaxPct').value = saved.preTaxPct ?? 60;
                if (document.getElementById('taxRothPct')) document.getElementById('taxRothPct').value = saved.rothPct ?? 20;
                if (document.getElementById('taxTaxablePct')) document.getElementById('taxTaxablePct').value = saved.taxablePct ?? 20;
                if (document.getElementById('taxOptimizeOrder')) document.getElementById('taxOptimizeOrder').checked = saved.optimizeOrder !== false;
                if (document.getElementById('taxStateRate')) document.getElementById('taxStateRate').value = saved.stateTaxRate ?? 0;
                updateAccountMixBar();
            }
        } catch(e) {}
    }

    /** Toggle between simple/detailed tax UI */
    function toggleTaxMode(mode) {
        const simpleSection = document.getElementById('taxSimpleSection');
        const detailedSection = document.getElementById('taxDetailedSection');
        if (simpleSection) simpleSection.style.display = mode === 'simple' ? 'block' : 'none';
        if (detailedSection) detailedSection.style.display = mode === 'detailed' ? 'block' : 'none';
    }

    /** Toggle the Tax Strategy collapsible section */
    function toggleTaxStrategy() {
        const body = document.getElementById('taxStrategyBody');
        const toggle = document.getElementById('taxStrategyToggle');
        if (body) {
            const isHidden = body.style.display === 'none';
            body.style.display = isHidden ? 'block' : 'none';
            if (toggle) toggle.textContent = isHidden ? '▼' : '▶';
        }
    }

    /** Update the visual account mix bar */
    function updateAccountMixBar() {
        const preTax = parseFloat(document.getElementById('taxPreTaxPct')?.value) || 0;
        const roth = parseFloat(document.getElementById('taxRothPct')?.value) || 0;
        const taxable = parseFloat(document.getElementById('taxTaxablePct')?.value) || 0;
        const total = preTax + roth + taxable;

        const bar = document.getElementById('accountMixBar');
        if (!bar) return;

        const preTaxBar = bar.querySelector('.mix-pretax');
        const rothBar = bar.querySelector('.mix-roth');
        const taxableBar = bar.querySelector('.mix-taxable');

        if (preTaxBar) preTaxBar.style.width = (total > 0 ? (preTax / total) * 100 : 0) + '%';
        if (rothBar) rothBar.style.width = (total > 0 ? (roth / total) * 100 : 0) + '%';
        if (taxableBar) taxableBar.style.width = (total > 0 ? (taxable / total) * 100 : 0) + '%';

        const warn = document.getElementById('accountMixWarning');
        if (warn) warn.style.display = Math.abs(total - 100) > 0.5 ? 'block' : 'none';
    }

    /** Apply tax settings from URL params */
    function applyTaxUrlParams() {
        const params = new URLSearchParams(window.location.search);
        if (params.has('taxMode')) {
            const mode = params.get('taxMode');
            const radio = document.querySelector(`input[name="taxMode"][value="${mode}"]`);
            if (radio) { radio.checked = true; toggleTaxMode(mode); }
        }
        if (params.has('taxFilingStatus') && document.getElementById('taxFilingStatus'))
            document.getElementById('taxFilingStatus').value = params.get('taxFilingStatus');
        if (params.has('taxPreTaxPct') && document.getElementById('taxPreTaxPct'))
            document.getElementById('taxPreTaxPct').value = params.get('taxPreTaxPct');
        if (params.has('taxRothPct') && document.getElementById('taxRothPct'))
            document.getElementById('taxRothPct').value = params.get('taxRothPct');
        if (params.has('taxTaxablePct') && document.getElementById('taxTaxablePct'))
            document.getElementById('taxTaxablePct').value = params.get('taxTaxablePct');
        if (params.has('taxOptimizeOrder') && document.getElementById('taxOptimizeOrder'))
            document.getElementById('taxOptimizeOrder').checked = params.get('taxOptimizeOrder') === 'true';
        if (params.has('taxStateRate') && document.getElementById('taxStateRate'))
            document.getElementById('taxStateRate').value = params.get('taxStateRate');
        updateAccountMixBar();
    }

    /** Get tax params for share URL */
    function getTaxShareParams() {
        const settings = getTaxSettings();
        const params = new URLSearchParams();
        params.set('taxMode', settings.taxMode);
        if (settings.taxMode === 'detailed') {
            params.set('taxFilingStatus', settings.filingStatus);
            params.set('taxPreTaxPct', settings.preTaxPct);
            params.set('taxRothPct', settings.rothPct);
            params.set('taxTaxablePct', settings.taxablePct);
            params.set('taxOptimizeOrder', settings.optimizeOrder);
            params.set('taxStateRate', settings.stateTaxRate);
        }
        return params;
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    document.addEventListener('DOMContentLoaded', function() {
        // Load saved settings (URL params take priority)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('taxMode')) {
            applyTaxUrlParams();
        } else {
            loadTaxSettings();
        }

        // Wire up event listeners
        document.querySelectorAll('input[name="taxMode"]').forEach(radio => {
            radio.addEventListener('change', function() {
                toggleTaxMode(this.value);
                saveTaxSettings();
            });
        });

        const taxStrategyHeader = document.getElementById('taxStrategyHeader');
        if (taxStrategyHeader) {
            taxStrategyHeader.addEventListener('click', toggleTaxStrategy);
        }

        // Account mix inputs
        ['taxPreTaxPct', 'taxRothPct', 'taxTaxablePct'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', () => { updateAccountMixBar(); saveTaxSettings(); });
            }
        });

        // Other tax inputs
        ['taxFilingStatus', 'taxOptimizeOrder', 'taxStateRate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', saveTaxSettings);
        });

        // Initialize display state
        const checkedMode = document.querySelector('input[name="taxMode"]:checked');
        if (checkedMode) toggleTaxMode(checkedMode.value);
        updateAccountMixBar();
    });

    // ============================================
    // EXPORTS
    // ============================================
    window.TaxEngine = {
        calculateFederalTax,
        calculateCapitalGainsTax,
        calculateSSTaxableAmount,
        calculateEffectiveTaxRate,
        FEDERAL_BRACKETS,
        STANDARD_DEDUCTION,
        CAPITAL_GAINS_BRACKETS,
        TAX_YEAR
    };

    window.calculateWithdrawalTax = calculateWithdrawalTax;
    window.getTaxSettings = getTaxSettings;
    window.getTaxShareParams = getTaxShareParams;

})();
