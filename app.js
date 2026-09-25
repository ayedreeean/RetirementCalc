// FIREcalc UI. Simulation math lives in market-data.js (FirecalcSim) and
// tax-engine.js; this file reads the form, calls the engine, and draws results.
(function () {
    'use strict';

    // ============================================
    // CONSTANTS
    // ============================================
    const Sim = window.FirecalcSim;
    const historicalData = window.FIRECALC_HISTORICAL;
    const MAX_ACCUMULATION_YEARS = 50;
    const MAX_INPUT_VALUE = 999999999;
    const MAX_AGE = 90;
    const SENSITIVITY_PATHS = 1000;
    const ROWS_PER_PAGE = 20;
    const MAX_PINS = 4;
    const DESKTOP_MIN = 981;

    // Social Security claiming age adjustment factors (full retirement age 67)
    const SS_AGE_FACTORS = {
        62: 0.70, 63: 0.75, 64: 0.80, 65: 0.8667,
        66: 0.9333, 67: 1.00, 68: 1.08, 69: 1.16, 70: 1.24
    };

    const C = {
        teal: '#0F7B6C', tealStrong: '#0B6358', sun: '#EE8F3A', sunStrong: '#B8621A',
        sky: '#4F9BD9', coral: '#D0503F', plum: '#8C6BC8', rose: '#C2577F',
        ink: '#1C2433', muted: '#5B6576', faint: '#8A93A2', grid: 'rgba(28, 36, 51, .07)'
    };
    const PIN_COLORS = [C.sun, C.sky, C.plum, C.rose];

    const $ = id => document.getElementById(id);
    const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const state = {
        seeds: { savings: newSeed(), retirement: newSeed() },
        results: { savings: null, retirement: null },
        hasRun: { savings: false, retirement: false },
        pins: { savings: [], retirement: [] },
        sens: { savings: 'expenses', retirement: 'withdrawal' },
        dollars: 'real',
        table: {
            savings: { page: 1, sort: null, dir: 'asc' },
            retirement: { page: 1, filter: 'all' }
        },
        charts: {},
        pinSeq: 0
    };

    function newSeed() { return Math.floor(Math.random() * 900000) + 100000; }

    // ============================================
    // FORMATTING
    // ============================================
    function formatCurrency(amount) {
        if (amount == null || isNaN(amount)) return '$0.00';
        const isNegative = amount < 0;
        const abs = Math.abs(amount);
        const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
        return isNegative ? `-$${formatted}` : `$${formatted}`;
    }
    const fmtMoney = n => formatCurrency(Math.round(n));
    function trimNum(x) {
        if (x >= 100) return x.toFixed(0);
        if (x >= 10) return x.toFixed(1).replace(/\.0$/, '');
        return x.toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
    }
    function fmtCompact(n) {
        if (n == null || isNaN(n)) return '–';
        const sign = n < 0 ? '-' : '';
        const a = Math.abs(n);
        if (a >= 1e9) return `${sign}$${trimNum(a / 1e9)}B`;
        if (a >= 1e6) return `${sign}$${trimNum(a / 1e6)}M`;
        if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}k`;
        return `${sign}$${Math.round(a)}`;
    }
    const fmtInt = n => Number(n).toLocaleString('en-US');
    const pct = (x, digits = 0) => `${(x).toFixed(digits)}%`;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

    function parseMoney(v) { return parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); }
    function readMoney(id, fallback) {
        const el = $(id);
        const v = parseMoney(el ? el.value : '');
        return isNaN(v) ? fallback : v;
    }
    function formatMoneyInput(el) {
        const v = parseMoney(el.value);
        if (isNaN(v)) return;
        el.value = v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    function setMoney(id, v) {
        const el = $(id);
        if (!el) return;
        el.value = Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
    }

    function hexA(hex, a) {
        const h = hex.replace('#', '');
        const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    function debounce(fn, ms) {
        let t = null;
        return function () { clearTimeout(t); t = setTimeout(fn, ms); };
    }

    function quantileSorted(arr, q) {
        if (!arr.length) return null;
        return arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
    }

    // ============================================
    // TOASTS
    // ============================================
    let toastTimer = null;
    function showToast(message, isError) {
        const toast = $('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.toggle('toast-error', !!isError);
        toast.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('visible'), isError ? 4500 : 3200);
    }
    function showValidationError(message) { showToast(message, true); }

    // ============================================
    // LOCAL STORAGE PERSISTENCE
    // ============================================
    const STORAGE_KEY = 'firecalc_inputs';
    const STORED_FIELDS = [
        'currentAge', 'currentSavings', 'income', 'expenses', 'targetAmount',
        'stockAllocation', 'incomeGrowth', 'savingsSimulationCount',
        'retirementAge', 'retirementSavings', 'annualWithdrawal',
        'retirementStockAllocation', 'withdrawalAdjustment', 'taxRate',
        'simulationCount', 'retirementLifeExpectancy',
        'includeSS', 'ssMonthlyBenefit', 'ssClaimingAge',
        'savingsReturnMode', 'retirementReturnMode',
        'includeSpouseSS', 'spouseSSMonthlyBenefit', 'spouseSSClaimingAge',
        'includeOtherIncome', 'monthlyPension', 'pensionStartAge',
        'monthlyOtherIncome', 'otherIncomeDuration'
    ];

    function saveInputsToStorage() {
        const inputs = {};
        STORED_FIELDS.forEach(id => {
            const el = $(id);
            if (el) inputs[id] = el.type === 'checkbox' ? el.checked : el.value;
        });
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
            localStorage.setItem('firecalc_inputs_version', '2');
        } catch (e) {}
    }

    function loadInputsFromStorage() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved) {
                try { localStorage.setItem('firecalc_inputs_version', '2'); } catch (e) {}
                return;
            }
            Object.keys(saved).forEach(id => {
                const el = $(id);
                if (!el) return;
                if (el.type === 'checkbox') el.checked = saved[id];
                else el.value = saved[id];
            });
            migrateLegacySocialSecurityDefault(saved);
        } catch (e) {}
    }

    // Older visits saved the factory default with Social Security checked.
    // Turn that untouched default off once so a returning browser is not
    // still running the subsidized case. Custom benefit amounts are kept.
    function migrateLegacySocialSecurityDefault(saved) {
        let version = null;
        try { version = localStorage.getItem('firecalc_inputs_version'); } catch (e) {}
        if (version === '2') return;
        const untouched = saved
            && saved.includeSS === true
            && String(saved.ssMonthlyBenefit) === '2000'
            && String(saved.ssClaimingAge) === '67';
        if (untouched) {
            const el = $('includeSS');
            if (el) el.checked = false;
            try {
                const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                stored.includeSS = false;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
            } catch (e) {}
        }
        try { localStorage.setItem('firecalc_inputs_version', '2'); } catch (e) {}
    }

    // ============================================
    // TABS
    // ============================================
    function activeTabKey() {
        return $('retirement-tab').hidden ? 'savings' : 'retirement';
    }

    function showTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(panel => { panel.hidden = panel.id !== tabId; });
        document.querySelectorAll('.tab').forEach(tab => {
            const on = tab.getAttribute('data-tab') === tabId;
            tab.classList.toggle('active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
            tab.tabIndex = on ? 0 : -1;
        });
        // Charts drawn while hidden have zero size; resize once visible.
        requestAnimationFrame(() => Object.values(state.charts).forEach(ch => { try { ch.resize(); } catch (e) {} }));
        updatePeek();
    }

    function wireTabs() {
        const tabs = Array.from(document.querySelectorAll('.tab'));
        tabs.forEach((tab, i) => {
            tab.addEventListener('click', () => {
                showTab(tab.getAttribute('data-tab'));
                window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
            });
            tab.addEventListener('keydown', e => {
                let next = null;
                if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
                if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
                if (e.key === 'Home') next = tabs[0];
                if (e.key === 'End') next = tabs[tabs.length - 1];
                if (next) {
                    e.preventDefault();
                    showTab(next.getAttribute('data-tab'));
                    next.focus();
                }
            });
        });
    }

    // ============================================
    // FORM CONTROLS
    // ============================================
    function upgradeHints() {
        const containers = document.querySelectorAll('.tooltip-container');
        containers.forEach((c, i) => {
            const icon = c.querySelector('.tooltip-icon');
            const text = c.querySelector('.tooltip-text');
            if (!icon || !text || icon.tagName === 'BUTTON') return;
            const host = c.closest('.field-label, .card-title, .hero-eyebrow, .switch-text, h2, h3');
            let name = host ? host.textContent.replace(text.textContent, '').replace('?', '').replace(/\s+/g, ' ').trim() : '';
            if (name.length > 60) name = name.slice(0, 60);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tooltip-icon';
            btn.textContent = '?';
            btn.setAttribute('aria-label', name ? `About ${name}` : 'More info');
            btn.setAttribute('aria-expanded', 'false');
            text.id = text.id || `hint-${i}`;
            text.setAttribute('role', 'tooltip');
            btn.setAttribute('aria-describedby', text.id);
            icon.replaceWith(btn);

            const place = () => placeHint(c);
            c.addEventListener('mouseenter', place);
            btn.addEventListener('focus', place);
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const open = !c.classList.contains('open');
                closeHints();
                if (open) {
                    place();
                    c.classList.add('open');
                    btn.setAttribute('aria-expanded', 'true');
                }
            });
        });
        document.addEventListener('click', closeHints);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHints(); });
        window.addEventListener('scroll', closeHints, { passive: true });
        document.querySelectorAll('.form-panel, .sheet-body').forEach(el => el.addEventListener('scroll', closeHints, { passive: true }));
    }

    function closeHints() {
        document.querySelectorAll('.tooltip-container.open').forEach(c => {
            c.classList.remove('open');
            const b = c.querySelector('.tooltip-icon');
            if (b) b.setAttribute('aria-expanded', 'false');
        });
    }

    // Hints use fixed positioning so the scrollable form panel does not clip them.
    function placeHint(c) {
        const btn = c.querySelector('.tooltip-icon');
        const tip = c.querySelector('.tooltip-text');
        if (!btn || !tip) return;
        const r = btn.getBoundingClientRect();
        const w = tip.offsetWidth, h = tip.offsetHeight;
        const margin = 12;
        let left = r.left + r.width / 2 - w / 2;
        left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
        let top = r.top - h - 10;
        const header = document.querySelector('.app-header');
        const minTop = (header ? header.getBoundingClientRect().bottom : 0) + 8;
        const below = top < minTop;
        if (below) top = r.bottom + 10;
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
        tip.style.setProperty('--arrow-x', `${r.left + r.width / 2 - left}px`);
        tip.classList.toggle('below', below);
    }

    function syncSlider(id) {
        const el = $(id);
        if (!el) return;
        const v = parseInt(el.value, 10) || 0;
        el.style.setProperty('--fill', `${v}%`);
        const label = $(`${id}Value`);
        if (label) label.textContent = v;
        const line = el.closest('.field') && el.closest('.field').querySelector('.mix-line');
        if (line) {
            const s = line.querySelector('[data-mix-stock]');
            const b = line.querySelector('[data-mix-bond]');
            if (s) s.textContent = v;
            if (b) b.textContent = 100 - v;
        }
    }

    function wireSliders() {
        ['stockAllocation', 'retirementStockAllocation'].forEach(id => {
            const el = $(id);
            if (!el) return;
            el.addEventListener('input', () => syncSlider(id));
            syncSlider(id);
        });
    }

    function wireMoneyInputs() {
        document.querySelectorAll('input[data-money]').forEach(el => {
            formatMoneyInput(el);
            el.addEventListener('blur', () => { formatMoneyInput(el); saveInputsToStorage(); });
        });
    }

    function setupCheckboxToggle(checkboxId, fieldsId) {
        const cb = $(checkboxId);
        const fields = $(fieldsId);
        if (!cb || !fields) return;
        const update = () => { fields.hidden = !cb.checked; };
        cb.addEventListener('change', update);
        update();
    }

    function wireReturnModeControl(selectId, countId, noteId, which) {
        const sel = $(selectId);
        const count = $(countId);
        const note = $(noteId);
        if (!sel) return;
        const sync = () => {
            const historical = sel.value === 'historical';
            if (count) count.disabled = historical;
            const reshuffle = $(which === 'retirement' ? 'retirementReshuffle' : 'savingsReshuffle');
            if (reshuffle) reshuffle.hidden = historical;
            if (!note) return;
            if (which === 'retirement') {
                note.textContent = historical
                    ? 'Uses every complete window in 1975–2024. A 30-year retirement has 21 windows. The sample does not include 1966 or 1973–74. The non-stock sleeve is that year’s 10-year Treasury return.'
                    : 'Each year is drawn independently from 1975–2024. This is not a historical sequence. The non-stock sleeve is that year’s 10-year Treasury return, which can be negative.';
            } else {
                note.textContent = historical
                    ? 'One path per start year from 1975 until the goal or the sample ends in 2024. Late starts have fewer years. 1966 and 1973–74 are not included.'
                    : 'Each year is drawn independently from 1975–2024. The savings goal is measured in today’s purchasing power.';
            }
        };
        if (!sel.dataset.bound) {
            sel.addEventListener('change', sync);
            sel.dataset.bound = '1';
        }
        sync();
    }

    function currentTaxSettings() {
        return typeof window.getTaxSettings === 'function' ? window.getTaxSettings() : null;
    }

    function makePreTaxFn(taxSettings) {
        if (typeof window.calculateWithdrawalTax !== 'function' || !taxSettings) return null;
        return (spend, income) => window.calculateWithdrawalTax(spend, income, taxSettings).preTaxWithdrawal;
    }

    function updateTaxBadge() {
        const badge = $('taxBadge');
        if (!badge) return;
        const s = currentTaxSettings();
        if (!s || s.taxMode === 'simple') {
            const rate = parseFloat($('taxRate').value);
            badge.textContent = `Flat ${isNaN(rate) ? 0 : rate}%`;
        } else {
            const status = s.filingStatus === 'single' ? 'Single' : 'MFJ';
            badge.textContent = `Brackets · ${status}${s.stateTaxRate > 0 ? ` + ${s.stateTaxRate}% state` : ''}`;
        }
    }

    function updateIncomeBadge() {
        const badge = $('incomeBadge');
        if (!badge) return;
        const parts = [];
        if ($('includeSS').checked) {
            const b = readMoney('ssMonthlyBenefit', 0);
            parts.push(`SS ${fmtMoney(b)}/mo at ${$('ssClaimingAge').value}`);
        }
        if ($('includeSpouseSS').checked) parts.push('spouse SS');
        if ($('includeOtherIncome').checked && (readMoney('monthlyPension', 0) > 0 || readMoney('monthlyOtherIncome', 0) > 0)) parts.push('other income');
        badge.classList.toggle('badge-off', parts.length === 0);
        badge.classList.toggle('badge-on', parts.length > 0);
        badge.textContent = parts.length ? `On · ${parts.join(', ')}` : 'Off';
    }

    function updateSavingsHelpers() {
        const income = readMoney('income', NaN);
        const expenses = readMoney('expenses', NaN);
        const line = $('savingsRateLine');
        if (line) {
            if (isNaN(income) || isNaN(expenses)) line.textContent = '';
            else if (expenses >= income) line.textContent = 'Spending is at or above income, so nothing is added each year.';
            else {
                const save = income - expenses;
                line.innerHTML = '';
                line.append('You add ');
                const s = document.createElement('strong');
                s.textContent = `${fmtMoney(save)} a year`;
                line.append(s, ` (${Math.round(save / income * 100)}% of income), rising with your pay.`);
            }
        }
        const v25 = $('goal25xValue');
        if (v25 && !isNaN(expenses)) v25.textContent = fmtMoney(expenses * 25);
    }

    function updateRetirementHelpers() {
        const line = $('withdrawalRateLine');
        if (!line) return;
        const savings = readMoney('retirementSavings', NaN);
        const spend = readMoney('annualWithdrawal', NaN);
        if (isNaN(savings) || isNaN(spend) || savings <= 0) { line.textContent = ''; return; }
        const draw = firstYearDraw(spend, parseFloat($('taxRate').value) / 100);
        line.innerHTML = '';
        line.append(`${pct(spend / savings * 100, 1)} of the portfolio. With taxes, the first-year draw is `);
        const s = document.createElement('strong');
        s.textContent = `${fmtMoney(draw)} (${pct(draw / savings * 100, 1)})`;
        line.append(s, ', before any other income.');
    }

    function firstYearDraw(spend, taxRate) {
        const fn = makePreTaxFn(currentTaxSettings());
        const draw = fn ? fn(spend, { socialSecurity: 0, pension: 0, otherOrdinary: 0 }) : spend / (1 - taxRate);
        return isFinite(draw) ? draw : spend;
    }

    // ============================================
    // PRESETS & HANDOFF
    // ============================================
    const PRESETS = {
        classic: {
            retirementAge: 65, retirementLifeExpectancy: 30, retirementSavings: 1000000, annualWithdrawal: 40000,
            withdrawalAdjustment: true, retirementStockAllocation: 50, taxRate: 0, retirementReturnMode: 'historical',
            includeSS: false, includeSpouseSS: false, includeOtherIncome: false, taxMode: 'simple',
            toast: 'Classic 4% check: $40,000 on $1,000,000, 50% stocks, no tax, Social Security off, historical windows.'
        },
        early: {
            retirementAge: 45, retirementLifeExpectancy: 50, retirementSavings: 1250000, annualWithdrawal: 45000,
            withdrawalAdjustment: true, retirementStockAllocation: 80, taxRate: 10, retirementReturnMode: 'shuffled',
            includeSS: false, includeSpouseSS: false, includeOtherIncome: false, taxMode: 'simple',
            toast: 'Early retiree: 50 years from age 45, 3.6% of the portfolio, 80% stocks, Social Security off.'
        },
        defaults: {
            retirementAge: 65, retirementLifeExpectancy: 30, retirementSavings: 1000000, annualWithdrawal: 40000,
            withdrawalAdjustment: true, retirementStockAllocation: 60, taxRate: 15, retirementReturnMode: 'shuffled',
            includeSS: false, includeSpouseSS: false, includeOtherIncome: false, taxMode: 'simple',
            toast: 'Back to the defaults. Social Security is off.'
        }
    };

    function applyPreset(name) {
        const p = PRESETS[name];
        if (!p) return;
        Object.keys(p).forEach(key => {
            if (key === 'toast' || key === 'taxMode') return;
            const el = $(key);
            if (!el) return;
            if (el.type === 'checkbox') {
                el.checked = p[key];
                el.dispatchEvent(new Event('change', { bubbles: false }));
            } else if (el.hasAttribute('data-money')) setMoney(key, p[key]);
            else el.value = p[key];
        });
        const radio = document.querySelector(`input[name="taxMode"][value="${p.taxMode}"]`);
        if (radio && !radio.checked) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: false }));
        }
        syncSlider('retirementStockAllocation');
        wireReturnModeControl('retirementReturnMode', 'simulationCount', 'retirementReturnModeNote', 'retirement');
        refreshBadges();
        saveInputsToStorage();
        showToast(p.toast);
        runRetirementSimulation({ scroll: !state.hasRun.retirement });
    }

    function handoffToRetirement() {
        const res = state.results.savings;
        if (!res) return;
        const { inp, summary } = res;
        if (summary.median != null && summary.median > 0) {
            $('retirementAge').value = Math.min(MAX_AGE, inp.currentAge + summary.median);
        }
        setMoney('retirementSavings', inp.targetAmount);
        setMoney('annualWithdrawal', inp.expenses);
        saveInputsToStorage();
        refreshBadges();
        showTab('retirement-tab');
        showToast(`Copied: retire at ${$('retirementAge').value} with ${fmtMoney(inp.targetAmount)}, spending ${fmtMoney(inp.expenses)} a year (today’s dollars).`);
        runRetirementSimulation({ scroll: true, scrollTop: true });
    }

    function refreshBadges() {
        updateTaxBadge();
        updateIncomeBadge();
        updateSavingsHelpers();
        updateRetirementHelpers();
    }

    // ============================================
    // CHART THEME
    // ============================================
    let chartsReady = false;

    function drawPill(ctx, text, x, y, color, align, area) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.font = '600 11px Inter, ui-sans-serif, system-ui, sans-serif';
        const padX = 7, h = 20;
        const w = ctx.measureText(text).width + padX * 2;
        let left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
        if (area) left = Math.max(area.left + 2, Math.min(left, area.right - w - 2));
        const top = y - h / 2;
        ctx.fillStyle = 'rgba(255, 255, 255, .95)';
        ctx.strokeStyle = hexA(color, .45);
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(left, top, w, h, 10); else ctx.rect(left, top, w, h);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, left + padX, y + .5);
        ctx.restore();
    }

    const refLinesPlugin = {
        id: 'fcRefLines',
        defaults: { lines: [] },
        afterDatasetsDraw(chart, args, opts) {
            const lines = (opts && opts.lines) || [];
            if (!lines.length) return;
            const { ctx, chartArea: a, scales } = chart;
            lines.forEach(l => {
                ctx.save();
                ctx.setLineDash(l.dash || [6, 5]);
                ctx.lineWidth = l.width || 1.5;
                ctx.strokeStyle = l.color;
                if (l.y != null) {
                    const scale = scales[l.axis || 'y'];
                    if (!scale) { ctx.restore(); return; }
                    const y = scale.getPixelForValue(l.y);
                    if (y < a.top - 1 || y > a.bottom + 1) { ctx.restore(); return; }
                    ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
                    if (l.label) drawPill(ctx, l.label, l.align === 'right' ? a.right - 6 : a.left + 6, y - 13, l.textColor || l.color, l.align === 'right' ? 'right' : 'left', a);
                } else if (l.x != null) {
                    const x = scales.x.getPixelForValue(l.x);
                    if (x < a.left - 1 || x > a.right + 1) { ctx.restore(); return; }
                    ctx.beginPath(); ctx.moveTo(x, a.top + (l.label ? 12 : 0)); ctx.lineTo(x, a.bottom); ctx.stroke();
                    if (l.label) drawPill(ctx, l.label, x, a.top + 10 + (l.row || 0) * 24, l.textColor || l.color, 'center', a);
                }
                ctx.restore();
            });
        }
    };

    const crosshairPlugin = {
        id: 'fcCrosshair',
        afterDatasetsDraw(chart) {
            if (chart.config.type !== 'line') return;
            const active = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
            if (!active.length) return;
            const x = active[0].element.x;
            const { ctx, chartArea: a } = chart;
            ctx.save();
            ctx.setLineDash([3, 4]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(28, 36, 51, .28)';
            ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke();
            ctx.restore();
        }
    };

    function setupCharts() {
        if (chartsReady) return true;
        if (typeof window.Chart === 'undefined') return false;
        const Chart = window.Chart;
        const d = Chart.defaults;
        d.font.family = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';
        d.font.size = window.innerWidth < 720 ? 11 : 12;
        d.color = C.muted;
        d.borderColor = C.grid;
        d.maintainAspectRatio = false;
        d.animation.duration = reducedMotion ? 0 : 650;
        d.animation.easing = 'easeOutQuart';
        d.plugins.legend.display = false;
        const t = d.plugins.tooltip;
        t.backgroundColor = 'rgba(28, 36, 51, .95)';
        t.titleColor = '#fff';
        t.bodyColor = '#E6E8EC';
        t.footerColor = '#FCE3C8';
        t.padding = 12;
        t.cornerRadius = 12;
        t.boxPadding = 5;
        t.caretSize = 6;
        t.usePointStyle = true;
        t.titleFont = { weight: '600', size: 12.5 };
        t.bodyFont = { size: 12 };
        t.footerFont = { weight: '500', size: 11.5 };
        d.elements.line.borderCapStyle = 'round';
        d.elements.line.borderJoinStyle = 'round';
        // Monotone curves never overshoot the data, so a smoothed line cannot show a balance no path had.
        d.elements.line.cubicInterpolationMode = 'monotone';
        d.elements.point.radius = 0;
        d.elements.point.hoverRadius = 5;
        d.elements.point.hoverBorderWidth = 2;
        d.elements.bar.borderRadius = 4;
        Chart.register(refLinesPlugin, crosshairPlugin);
        chartsReady = true;
        return true;
    }

    function vGradient(color, top, bottom) {
        return context => {
            const chart = context.chart;
            const area = chart.chartArea;
            if (!area) return hexA(color, bottom);
            const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, hexA(color, top));
            g.addColorStop(1, hexA(color, bottom));
            return g;
        };
    }

    function yAxis(extra) {
        return Object.assign({
            beginAtZero: true,
            grid: { color: C.grid, drawTicks: false },
            border: { display: false },
            ticks: { padding: 8, maxTicksLimit: 6, callback: v => fmtCompact(v) }
        }, extra || {});
    }

    function xAxis(title, extra) {
        return Object.assign({
            grid: { display: false },
            border: { color: 'rgba(28, 36, 51, .14)' },
            ticks: { padding: 6, maxRotation: 0, autoSkipPadding: 14 },
            title: title ? { display: true, text: title, color: C.faint, font: { size: 11, weight: '500' } } : { display: false }
        }, extra || {});
    }

    function upsertChart(key, canvasId, config) {
        if (!setupCharts()) return null;
        const canvas = $(canvasId);
        if (!canvas) return null;
        const existing = state.charts[key];
        if (existing && existing.canvas === canvas && existing.config.type === config.type) {
            existing.data = config.data;
            existing.options = config.options;
            existing.update();
            return existing;
        }
        if (existing) existing.destroy();
        state.charts[key] = new window.Chart(canvas, config);
        return state.charts[key];
    }

    function setAria(canvasId, text) {
        const c = $(canvasId);
        if (c) c.setAttribute('aria-label', text);
    }

    function clickable(onPick) {
        return {
            onClick: (evt, elements) => { if (elements && elements.length) onPick(elements[0].index); },
            onHover: (evt, elements, chart) => { chart.canvas.style.cursor = elements && elements.length ? 'pointer' : 'default'; }
        };
    }

    // ============================================
    // SAVINGS SIMULATION
    // ============================================
    function readSavingsInputs() {
        return {
            currentAge: parseInt($('currentAge').value, 10),
            currentSavings: parseMoney($('currentSavings').value),
            income: parseMoney($('income').value),
            expenses: parseMoney($('expenses').value),
            targetAmount: parseMoney($('targetAmount').value),
            stockAllocation: parseInt($('stockAllocation').value, 10) / 100,
            incomeGrowth: parseFloat($('incomeGrowth').value) / 100,
            simulationCount: parseInt($('savingsSimulationCount').value, 10),
            returnMode: ($('savingsReturnMode') || {}).value || 'shuffled'
        };
    }

    function validateSavings(i, silent) {
        const fail = msg => { if (!silent) showValidationError(msg); return false; };
        if (isNaN(i.currentAge) || isNaN(i.currentSavings) || isNaN(i.income) ||
            isNaN(i.expenses) || isNaN(i.targetAmount) || isNaN(i.stockAllocation) || isNaN(i.incomeGrowth) || isNaN(i.simulationCount)) {
            return fail('Please fill in all fields with valid numbers.');
        }
        if (i.currentAge < 0 || i.currentSavings < 0 || i.income < 0 || i.expenses < 0 || i.targetAmount < 0) {
            return fail('Values cannot be negative.');
        }
        if (i.currentAge > MAX_AGE) return fail(`Current age seems too high (max ${MAX_AGE}).`);
        if (i.currentSavings > MAX_INPUT_VALUE || i.income > MAX_INPUT_VALUE || i.expenses > MAX_INPUT_VALUE || i.targetAmount > MAX_INPUT_VALUE) {
            return fail(`One or more values exceed the maximum allowed (${formatCurrency(MAX_INPUT_VALUE)}).`);
        }
        if (!silent) {
            if (i.expenses > i.income * 2) showValidationError('Warning: Your expenses are more than double your income. Please verify your inputs.');
            else if (i.targetAmount < i.currentSavings) showValidationError('Warning: Your target amount is less than your current savings. You have already reached your goal!');
        }
        return true;
    }

    function savingsTrialInput(i) {
        return {
            currentAge: i.currentAge,
            currentSavings: i.currentSavings,
            income: i.income,
            expenses: i.expenses,
            targetAmount: i.targetAmount,
            stockAllocation: i.stockAllocation,
            incomeGrowth: i.incomeGrowth,
            maxYears: MAX_ACCUMULATION_YEARS
        };
    }

    function byYearsToTarget(a, b) {
        if (a.yearsToTarget == null && b.yearsToTarget == null) return 0;
        if (a.yearsToTarget == null) return 1;
        if (b.yearsToTarget == null) return -1;
        return a.yearsToTarget - b.yearsToTarget;
    }

    function summarizeSavings(sims) {
        const sorted = [...sims].sort(byYearsToTarget);
        const n = sorted.length;
        const medianSim = sorted[Math.floor(n * 0.5)];
        const p10Sim = sorted[Math.floor(n * 0.1)];
        const p90Sim = sorted[Math.min(n - 1, Math.floor(n * 0.9))];
        const counts = new Array(MAX_ACCUMULATION_YEARS + 1).fill(0);
        let reached = 0;
        sims.forEach(s => {
            if (s.yearsToTarget != null) { reached++; counts[Math.min(MAX_ACCUMULATION_YEARS, s.yearsToTarget)]++; }
        });
        const cdf = [];
        let run = 0;
        for (let y = 0; y <= MAX_ACCUMULATION_YEARS; y++) { run += counts[y]; cdf.push(run / n * 100); }
        return {
            sorted, n, medianSim,
            median: medianSim.yearsToTarget,
            p10: p10Sim.yearsToTarget,
            p90: p90Sim.yearsToTarget,
            reached, reachedPct: reached / n * 100,
            counts, cdf
        };
    }

    function runAccumulationSimulation(opts) {
        opts = opts || {};
        const silent = !!opts.silent;
        const inp = readSavingsInputs();
        const body = $('results');
        if (!validateSavings(inp, silent)) { markStale(body, 'savingsRunMeta'); return; }
        const button = $('runSimulation');
        if (!silent) setButtonLoading(button, true);
        body.classList.add('is-updating');

        setTimeout(() => {
            try {
                const rng = Sim.seededRandom(state.seeds.savings);
                const sequences = Sim.buildSequences(historicalData, inp.returnMode, MAX_ACCUMULATION_YEARS, inp.simulationCount, false, rng);
                const trialIn = savingsTrialInput(inp);
                const sims = sequences.map(sequence => {
                    const trial = Sim.runAccumulationTrial(trialIn, sequence);
                    if (inp.returnMode !== 'historical') trial.startYear = null;
                    trial.yearsToGoal = trial.yearsToTarget;
                    return trial;
                });
                const summary = summarizeSavings(sims);
                const res = { inp, sims, sequences, summary, seed: state.seeds.savings, sens: {} };
                state.results.savings = res;
                state.table.savings.page = 1;
                const firstRun = !state.hasRun.savings;
                state.hasRun.savings = true;

                $('savingsEmpty').hidden = true;
                body.hidden = false;
                body.classList.remove('is-stale');
                staggerReveal(body);
                renderSavings(res);
                if (opts.scroll || (firstRun && !silent)) scrollToResults('savingsHero');
                scheduleIdle(() => renderSavingsSensitivity(res));
            } catch (err) {
                console.error('Savings simulation failed:', err);
                if (!silent) showValidationError('Something went wrong running the simulation. Please check your inputs.');
            } finally {
                body.classList.remove('is-updating');
                if (!silent) setButtonLoading(button, false);
            }
        }, silent ? 0 : 40);
    }

    function renderSavings(res) {
        const { inp, summary } = res;
        const historical = inp.returnMode === 'historical';
        const yrs = y => (y == null ? (historical ? 'Not reached' : 'Not within 50 years') : plural(y, 'year', 'years'));

        $('savingsRunMeta').textContent = historical
            ? `${summary.n} historical start years, 1975–2024`
            : `${fmtInt(summary.n)} shuffled paths · seed ${res.seed}`;

        const hero = $('yearsToGoal');
        hero.textContent = '';
        if (summary.median == null) {
            hero.textContent = historical ? 'Not reached' : 'Not within 50 years';
            hero.classList.add('hero-number-text');
        } else {
            hero.classList.remove('hero-number-text');
            hero.append(String(summary.median));
            const unit = document.createElement('span');
            unit.className = 'unit';
            unit.textContent = summary.median === 1 ? 'year' : 'years';
            hero.append(unit);
        }

        const ageLine = $('goalAgeLine');
        ageLine.textContent = '';
        if (summary.median === 0) {
            ageLine.textContent = `You already have ${fmtMoney(inp.targetAmount)} or more.`;
        } else if (summary.median != null) {
            ageLine.append(`Median path reaches ${fmtMoney(inp.targetAmount)} in today’s dollars around `);
            const s = document.createElement('strong');
            s.textContent = `age ${inp.currentAge + summary.median}`;
            ageLine.append(s, '.');
        } else {
            ageLine.textContent = `Fewer than half of paths reach ${fmtMoney(inp.targetAmount)} in today’s dollars${historical ? ' before the sample ends in 2024' : ' within 50 years'}.`;
        }

        const ageOf = y => (y == null ? '' : ` · age ${inp.currentAge + y}`);
        $('yearsP10').textContent = `${yrs(summary.p10)}${ageOf(summary.p10)}`;
        $('yearsP90').textContent = `${yrs(summary.p90)}${ageOf(summary.p90)}`;
        $('reachShare').textContent = pct(summary.reachedPct);
        const reachLabel = $('reachShare').previousElementSibling;
        if (reachLabel) reachLabel.textContent = historical ? 'Windows that reach it' : 'Reach it within 50 years';

        $('yearsToGoalNote').textContent = historical
            ? `Median of ${summary.n} historical windows, one per start year from 1975. The goal is today's purchasing power. Windows that start late are shorter because the sample ends in 2024. 1966 and 1973–74 are not in the sample.`
            : `Median of ${summary.n} shuffled-year trials. The goal is today's purchasing power: the nominal balance divided by inflation since the start. Years are drawn independently, not as a historical sequence.`;

        const handoff = $('handoffLine');
        if (handoff) {
            handoff.textContent = summary.median != null && summary.median > 0
                ? `Retire at ${Math.min(MAX_AGE, inp.currentAge + summary.median)} with ${fmtMoney(inp.targetAmount)} and spend ${fmtMoney(inp.expenses)} a year. How often does that last?`
                : `Send ${fmtMoney(inp.targetAmount)} and ${fmtMoney(inp.expenses)} a year of spending to the retirement simulator.`;
        }

        try { renderSavingsPaths(res); } catch (e) { console.error('Chart error (paths):', e); }
        try { renderYearsDistribution(res); } catch (e) { console.error('Chart error (distribution):', e); }
        try { renderMilestones(res); } catch (e) { console.error('Milestones error:', e); }
        try { renderGrowthSources(res); } catch (e) { console.error('Chart error (growth):', e); }
        renderSavingsCompare();
        renderSavingsTable();
        updatePeek();
    }

    function savingsPathPoints(sim, inp) {
        const pts = [{ x: inp.currentAge, y: inp.currentSavings }];
        sim.yearlyData.forEach((d, i) => pts.push({ x: inp.currentAge + i + 1, y: d.realBalance }));
        return pts;
    }

    function renderSavingsPaths(res) {
        const { inp, summary, sims } = res;
        const n = sims.length;
        const historical = inp.returnMode === 'historical';
        const sampleCount = historical ? n : Math.min(60, n);
        const picks = [];
        for (let k = 0; k < sampleCount; k++) picks.push(summary.sorted[Math.floor((k + 0.5) * n / sampleCount)]);
        const medianPts = savingsPathPoints(summary.medianSim, inp);
        let maxX = inp.currentAge + 1;
        const faint = picks.map(sim => {
            const data = savingsPathPoints(sim, inp);
            maxX = Math.max(maxX, data[data.length - 1].x);
            return {
                label: sim.startYear ? `${sim.startYear} start` : 'Path',
                data, borderColor: hexA(C.teal, historical ? .22 : .16), borderWidth: 1.25,
                pointRadius: 0, pointHoverRadius: 0, fill: false, tension: .25
            };
        });
        const lastIdx = medianPts.length - 1;
        const reachedMedian = summary.median != null && summary.median > 0;
        const median = {
            label: 'Median path', data: medianPts, borderColor: C.teal, borderWidth: 3.2, tension: .25,
            fill: 'origin', backgroundColor: vGradient(C.teal, .20, .01),
            pointRadius: ctx => (ctx.dataIndex === lastIdx && reachedMedian ? 5.5 : 0),
            pointBackgroundColor: '#fff', pointBorderColor: C.teal, pointBorderWidth: 2.5, pointHoverRadius: 6,
            pointHoverBackgroundColor: C.teal, pointHoverBorderColor: '#fff'
        };
        const lines = [{ y: inp.targetAmount, color: C.sun, textColor: C.sunStrong, label: `Goal ${fmtCompact(inp.targetAmount)}`, align: 'left' }];
        if (reachedMedian) lines.push({ x: inp.currentAge + summary.median, color: hexA(C.teal, .6), textColor: C.tealStrong, label: `Median · age ${inp.currentAge + summary.median}`, dash: [2, 4], width: 1.25 });

        upsertChart('savingsPaths', 'savingsPathsChart', {
            type: 'line',
            data: { datasets: [...faint, median] },
            options: {
                normalized: true,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: xAxis('Age', { type: 'linear', min: inp.currentAge, max: Math.min(inp.currentAge + MAX_ACCUMULATION_YEARS, Math.ceil(Math.max(maxX, inp.currentAge + 5) / 5) * 5), ticks: { padding: 6, maxRotation: 0, stepSize: 5, precision: 0 } }),
                    y: yAxis({ suggestedMax: inp.targetAmount * 1.12, title: { display: true, text: 'Today’s dollars', color: C.faint, font: { size: 11, weight: '500' } } })
                },
                plugins: {
                    fcRefLines: { lines },
                    tooltip: {
                        filter: item => item.dataset.label === 'Median path',
                        callbacks: {
                            title: items => (items.length ? `Age ${items[0].parsed.x}` : ''),
                            label: item => ` Median path: ${fmtMoney(item.parsed.y)}`,
                            footer: items => {
                                if (!items.length) return '';
                                const y = items[0].parsed.x - inp.currentAge;
                                return y > 0 ? `${pct(summary.cdf[Math.min(y, MAX_ACCUMULATION_YEARS)])} of paths have reached the goal` : '';
                            }
                        }
                    }
                }
            }
        });
        setAria('savingsPathsChart', `${sampleCount} savings paths in today’s dollars. The median path reaches the ${fmtMoney(inp.targetAmount)} goal ${reachedMedian ? `at age ${inp.currentAge + summary.median}` : 'not within the horizon'}.`);
    }

    function renderYearsDistribution(res) {
        const { inp, summary } = res;
        const finite = res.sims.map(s => s.yearsToTarget).filter(y => y != null && y > 0);
        const caption = $('distributionCaption');
        if (!finite.length) {
            caption.textContent = summary.median === 0 ? 'You are already at the goal.' : 'No path reaches the goal within the horizon.';
            if (state.charts.years) { state.charts.years.destroy(); delete state.charts.years; }
            return;
        }
        const maxY = Math.min(MAX_ACCUMULATION_YEARS, Math.max(...finite) + 1);
        const minY = Math.max(1, Math.min(...finite) - 1);
        const labels = [];
        const bars = [];
        const cum = [];
        for (let y = minY; y <= maxY; y++) {
            labels.push(y);
            bars.push(summary.counts[y] / summary.n * 100);
            cum.push(summary.cdf[y]);
        }
        const maxBar = Math.max(...bars);
        const idx = y => (y == null ? null : y - minY);
        const lines = [];
        if (summary.p10 != null && summary.p10 > 0) lines.push({ x: idx(summary.p10), color: hexA(C.sky, .7), textColor: '#2F6FA6', label: 'Faster 10%', dash: [2, 4], width: 1.25 });
        if (summary.median != null && summary.median > 0) lines.push({ x: idx(summary.median), color: hexA(C.teal, .8), textColor: C.tealStrong, label: 'Median', dash: [2, 4], width: 1.25, row: 1 });
        if (summary.p90 != null && summary.p90 > 0) lines.push({ x: idx(summary.p90), color: hexA(C.sun, .8), textColor: C.sunStrong, label: 'Slower 10%', dash: [2, 4], width: 1.25 });

        upsertChart('years', 'yearsDistributionChart', {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        type: 'line', label: 'Reached goal by then', data: cum, yAxisID: 'y', order: 1,
                        borderColor: C.teal, borderWidth: 2.5, tension: .3, fill: 'origin', backgroundColor: vGradient(C.teal, .16, .01),
                        pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: C.teal, pointHoverBorderColor: '#fff'
                    },
                    {
                        type: 'bar', label: 'First reached that year', data: bars, yAxisID: 'y1', order: 2,
                        backgroundColor: labels.map(y => (y === summary.median ? hexA(C.sun, .85) : hexA(C.sun, .35))),
                        borderRadius: 4, barPercentage: .82, categoryPercentage: .9
                    }
                ]
            },
            options: {
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: xAxis('Age', { ticks: { padding: 6, maxRotation: 0, autoSkipPadding: 12, callback: (v, i) => inp.currentAge + labels[i] } }),
                    y: yAxis({ min: 0, max: 100, ticks: { padding: 8, stepSize: 25, callback: v => `${v}%` } }),
                    y1: { display: false, min: 0, max: maxBar * 3.2, grid: { display: false } }
                },
                plugins: {
                    fcRefLines: { lines },
                    tooltip: {
                        callbacks: {
                            title: items => `Year ${labels[items[0].dataIndex]} · age ${inp.currentAge + labels[items[0].dataIndex]}`,
                            label: item => (item.datasetIndex === 0 ? ` ${pct(item.parsed.y)} have reached it by now` : ` ${pct(item.parsed.y, 1)} first reach it this year`)
                        }
                    }
                }
            }
        });

        const never = 100 - summary.reachedPct;
        const historical = inp.returnMode === 'historical';
        caption.textContent = summary.median != null
            ? `Half of ${historical ? 'windows' : 'paths'} reach the goal by age ${inp.currentAge + summary.median}. ${never >= 0.5 ? `${pct(never)} never reach it${historical ? ' before the sample ends' : ' within 50 years'}.` : 'Almost every path reaches it within 50 years.'}`
            : `Fewer than half of ${historical ? 'windows' : 'paths'} reach the goal.`;
        setAria('yearsDistributionChart', caption.textContent);
    }

    function renderMilestones(res) {
        const { inp, summary } = res;
        const medianSim = summary.medianSim;
        const list = $('milestones');
        list.textContent = '';
        const shares = [0.25, 0.5, 0.75, 1.0];
        let lastReached = -1;
        shares.forEach((share, idx) => {
            const amount = inp.targetAmount * share;
            let label;
            let reached = true;
            if (inp.currentSavings >= amount) {
                label = 'Now';
            } else {
                let yearReached = null;
                for (let i = 0; i < medianSim.yearlyData.length; i++) {
                    const real = medianSim.yearlyData[i].realBalance != null ? medianSim.yearlyData[i].realBalance : medianSim.yearlyData[i].balance;
                    if (real >= amount) { yearReached = i + 1; break; }
                }
                if (yearReached == null) { label = 'Not reached'; reached = false; }
                else label = `Age ${inp.currentAge + yearReached}`;
            }
            if (reached) lastReached = idx;
            const li = document.createElement('li');
            li.className = `milestone${reached ? '' : ' milestone-unreached'}`;
            li.innerHTML = '<div class="milestone-node"></div><div class="milestone-age"></div><div class="milestone-amount"></div>';
            li.querySelector('.milestone-node').textContent = `${share * 100}%`;
            li.querySelector('.milestone-age').textContent = label;
            li.querySelector('.milestone-amount').textContent = fmtMoney(amount);
            list.appendChild(li);
        });
        list.style.setProperty('--progress', lastReached <= 0 ? 0 : lastReached / 3);
    }

    function renderGrowthSources(res) {
        const { inp, summary } = res;
        const yearlyData = summary.medianSim.yearlyData;
        const initial = inp.currentSavings;
        const labels = [inp.currentAge];
        const initialData = [initial];
        const contribData = [0];
        const returnsData = [0];
        const totals = [initial];
        let cumulativeContributions = 0;
        yearlyData.forEach((d, i) => {
            const cpi = d.cpi || 1;
            cumulativeContributions += d.contribution;
            const cumulativeReturns = d.balance - cumulativeContributions - initial;
            labels.push(inp.currentAge + i + 1);
            initialData.push(initial / cpi);
            contribData.push(cumulativeContributions / cpi);
            returnsData.push(Math.max(0, cumulativeReturns) / cpi);
            totals.push((initial + cumulativeContributions + Math.max(0, cumulativeReturns)) / cpi);
        });
        const area = (label, data, color, fill) => ({
            label, data, fill, borderColor: color, borderWidth: 1.5, backgroundColor: hexA(color, .55), tension: .3,
            pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: color, pointHoverBorderColor: '#fff'
        });
        upsertChart('growth', 'growthSourcesChart', {
            type: 'line',
            data: {
                labels,
                datasets: [
                    area('Starting savings', initialData, C.sky, 'origin'),
                    area('Your contributions', contribData, C.teal, '-1'),
                    area('Market growth', returnsData, C.sun, '-1')
                ]
            },
            options: {
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10, boxHeight: 10, padding: 16, color: C.muted } },
                    fcRefLines: { lines: [{ y: inp.targetAmount, color: C.sun, textColor: C.sunStrong, label: `Goal ${fmtCompact(inp.targetAmount)}` }] },
                    tooltip: {
                        itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
                        callbacks: {
                            title: items => `Age ${items[0].label}`,
                            label: item => ` ${item.dataset.label}: ${fmtMoney(item.parsed.y)}`,
                            footer: items => `Total: ${fmtMoney(totals[items[0].dataIndex])} today’s dollars`
                        }
                    }
                },
                scales: {
                    x: xAxis('Age'),
                    y: yAxis({ stacked: true, suggestedMax: inp.targetAmount })
                }
            }
        });
        const last = yearlyData.length;
        if (last) {
            const contrib = contribData[last], growth = returnsData[last], start = initialData[last];
            setAria('growthSourcesChart', `On the median path at the goal: ${fmtMoney(start)} from starting savings, ${fmtMoney(contrib)} from contributions, ${fmtMoney(growth)} from market growth, in today’s dollars.`);
        }
    }

    // --- Savings sensitivity ---
    function computeSavingsSensitivity(res, variable) {
        const { inp } = res;
        const seqs = res.sequences.slice(0, SENSITIVITY_PATHS);
        let points;
        if (variable === 'expenses') {
            const mults = [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2];
            const seen = new Set();
            points = mults.map(m => ({ value: m === 1 ? inp.expenses : Math.max(0, Math.round(inp.expenses * m / 500) * 500), current: m === 1, mult: m }))
                .filter(p => { if (seen.has(p.value)) return false; seen.add(p.value); return true; });
        } else {
            const cur = Math.round(inp.stockAllocation * 100);
            const vals = Array.from(new Set([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, cur])).sort((a, b) => a - b);
            points = vals.map(v => ({ value: v, current: v === cur }));
        }
        points.forEach(p => {
            const variant = Object.assign({}, inp, variable === 'expenses' ? { expenses: p.value } : { stockAllocation: p.value / 100 });
            const trialIn = savingsTrialInput(variant);
            const years = seqs.map(seq => Sim.runAccumulationTrial(trialIn, seq).yearsToTarget)
                .map(y => (y == null ? Infinity : y)).sort((a, b) => a - b);
            const q = x => { const v = quantileSorted(years, x); return v === Infinity ? null : v; };
            p.p10 = q(0.1); p.p50 = q(0.5); p.p90 = q(0.9);
        });
        return { variable, points, paths: seqs.length };
    }

    function renderSavingsSensitivity(res) {
        if (state.results.savings !== res) return;
        const variable = state.sens.savings;
        const sens = res.sens[variable] || (res.sens[variable] = computeSavingsSensitivity(res, variable));
        const { points } = sens;
        const labels = points.map(p => (variable === 'expenses' ? fmtCompact(p.value) : `${p.value}%`));
        const curIdx = points.findIndex(p => p.current);
        const pointColors = points.map(p => (p.current ? C.sun : '#fff'));
        upsertChart('savingsSens', 'savingsSensitivityChart', {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Faster 10%', data: points.map(p => p.p10), borderColor: hexA(C.teal, .25), borderWidth: 1, pointRadius: 0, fill: false, tension: .3, spanGaps: false },
                    { label: 'Slower 10%', data: points.map(p => p.p90), borderColor: hexA(C.teal, .25), borderWidth: 1, pointRadius: 0, fill: 0, backgroundColor: hexA(C.teal, .10), tension: .3, spanGaps: false },
                    {
                        label: 'Median years', data: points.map(p => p.p50), borderColor: C.teal, borderWidth: 3, tension: .3,
                        pointRadius: points.map(p => (p.current ? 7 : 4)), pointHoverRadius: 8,
                        pointBackgroundColor: pointColors, pointBorderColor: points.map(p => (p.current ? '#fff' : C.teal)), pointBorderWidth: 2
                    }
                ]
            },
            options: Object.assign({
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: xAxis(variable === 'expenses' ? 'Annual spending' : 'Stocks in the mix'),
                    y: yAxis({ beginAtZero: false, ticks: { padding: 8, maxTicksLimit: 6, precision: 0, callback: v => `${v} yrs` } })
                },
                plugins: {
                    fcRefLines: { lines: curIdx >= 0 ? [{ x: curIdx, color: hexA(C.sun, .7), textColor: C.sunStrong, label: 'You', dash: [2, 4], width: 1.25 }] : [] },
                    tooltip: {
                        itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
                        callbacks: {
                            title: items => {
                                const p = points[items[0].dataIndex];
                                return variable === 'expenses' ? `Spending ${fmtMoney(p.value)} a year${p.current ? ' (yours)' : ''}` : `${p.value}% stocks${p.current ? ' (yours)' : ''}`;
                            },
                            label: item => ` ${item.dataset.label}: ${item.parsed.y == null ? 'not within 50 yrs' : plural(item.parsed.y, 'year', 'years')}`,
                            footer: items => (points[items[0].dataIndex].current ? '' : 'Click to try this')
                        }
                    }
                }
            }, clickable(i => applySensitivityPoint('savings', variable, points[i].value)))
        });

        const caption = $('savingsSensitivityCaption');
        const fmtY = y => (y == null ? 'not within 50' : String(y));
        const cur = points[curIdx];
        let text;
        if (variable === 'expenses') {
            const lower = points.find(p => p.mult === 0.9);
            text = lower && cur ? `Spending ${fmtMoney(lower.value)} instead of ${fmtMoney(cur.value)} moves the median from ${fmtY(cur.p50)} to ${fmtY(lower.p50)} years.` : '';
        } else {
            const at0 = points[0], at100 = points[points.length - 1];
            text = `On these paths the median runs from ${fmtY(at100.p50)} years at 100% stocks to ${fmtY(at0.p50)} years at 0%.`;
        }
        caption.textContent = `${text} Band: faster and slower 10%. Same ${fmtInt(sens.paths)} paths for every point. Click a point to try it.`;
        setAria('savingsSensitivityChart', text);
    }

    function applySensitivityPoint(tab, variable, value) {
        if (tab === 'savings') {
            if (variable === 'expenses') setMoney('expenses', value);
            else { $('stockAllocation').value = value; syncSlider('stockAllocation'); }
        } else {
            if (variable === 'withdrawal') setMoney('annualWithdrawal', value);
            else { $('retirementStockAllocation').value = value; syncSlider('retirementStockAllocation'); }
        }
        saveInputsToStorage();
        refreshBadges();
        const label = variable === 'stock' ? `${value}% stocks` : `${fmtMoney(value)} a year`;
        showToast(`Trying ${label}. Pin the previous result first to compare.`);
        if (tab === 'savings') runAccumulationSimulation({ silent: true });
        else runRetirementSimulation({ silent: true });
    }

    // ============================================
    // RETIREMENT SIMULATION
    // ============================================
    function readRetirementInputs() {
        const i = {
            retirementAge: parseInt($('retirementAge').value, 10),
            retirementSavings: parseMoney($('retirementSavings').value),
            annualWithdrawal: parseMoney($('annualWithdrawal').value),
            adjustForInflation: $('withdrawalAdjustment').checked,
            taxRate: parseFloat($('taxRate').value) / 100,
            stockAllocation: parseInt($('retirementStockAllocation').value, 10) / 100,
            simulationCount: parseInt($('simulationCount').value, 10),
            lifeExpectancy: parseInt($('retirementLifeExpectancy').value, 10),
            returnMode: ($('retirementReturnMode') || {}).value || 'shuffled',
            includeSS: $('includeSS').checked,
            ssMonthlyBenefit: parseFloat(($('ssMonthlyBenefit').value || '0').replace(/[^0-9.]/g, '')) || 0,
            ssClaimingAge: parseInt($('ssClaimingAge').value, 10) || 67,
            includeSpouseSS: $('includeSpouseSS').checked,
            spouseSSMonthlyBenefit: parseFloat(($('spouseSSMonthlyBenefit').value || '0').replace(/[^0-9.]/g, '')) || 0,
            spouseSSClaimingAge: parseInt($('spouseSSClaimingAge').value, 10) || 67,
            includeOtherIncome: $('includeOtherIncome').checked,
            monthlyPension: parseFloat(($('monthlyPension').value || '0').replace(/[^0-9.]/g, '')) || 0,
            pensionStartAge: parseInt($('pensionStartAge').value, 10) || 65,
            monthlyOtherIncome: parseFloat(($('monthlyOtherIncome').value || '0').replace(/[^0-9.]/g, '')) || 0,
            otherIncomeDuration: parseInt($('otherIncomeDuration').value, 10) || 0
        };
        i.ssAnnualBase = i.ssMonthlyBenefit * (SS_AGE_FACTORS[i.ssClaimingAge] || 1.0) * 12;
        i.spouseSSAnnualBase = i.spouseSSMonthlyBenefit * (SS_AGE_FACTORS[i.spouseSSClaimingAge] || 1.0) * 12;
        i.annualPension = i.monthlyPension * 12;
        i.annualOtherIncome = i.monthlyOtherIncome * 12;
        return i;
    }

    function validateRetirement(i, silent) {
        const fail = msg => { if (!silent) showValidationError(msg); return false; };
        if (isNaN(i.retirementAge) || isNaN(i.retirementSavings) || isNaN(i.annualWithdrawal) ||
            isNaN(i.taxRate) || isNaN(i.stockAllocation) || isNaN(i.lifeExpectancy)) {
            return fail('Please fill in all fields with valid numbers.');
        }
        if (i.retirementSavings < 0 || i.annualWithdrawal < 0 || i.taxRate < 0) return fail('Values cannot be negative.');
        if (i.taxRate >= 1) return fail('Tax rate must be below 100%.');
        if (i.retirementAge > MAX_AGE) return fail(`Retirement age seems too high (max ${MAX_AGE}).`);
        if (i.retirementSavings > MAX_INPUT_VALUE || i.annualWithdrawal > MAX_INPUT_VALUE) {
            return fail(`One or more values exceed the maximum allowed (${formatCurrency(MAX_INPUT_VALUE)}).`);
        }
        if (i.lifeExpectancy <= 0) return fail('Retirement length must be positive.');
        return true;
    }

    function retirementAssumptionSentences(opts) {
        const sentences = [];
        if (opts.returnMode === 'historical') {
            sentences.push(`Historical cycles: ${opts.windowCount} complete ${opts.lifeExpectancy}-year windows from the 1975–2024 sample. This sample does not include 1966 or 1973–74.`);
        } else {
            sentences.push(`Shuffled years: ${opts.windowCount} trials. Each year is drawn independently from 1975–2024. That is not a historical sequence, and 1966 / 1973–74 are not in the sample.`);
        }
        if (opts.includeSS && opts.ssMonthlyBenefit > 0) {
            sentences.push(`Social Security is on: $${Math.round(opts.ssMonthlyBenefit).toLocaleString()} per month at full retirement age, claimed at age ${opts.ssClaimingAge}. That income is included in this success rate. It is not a portfolio-only withdrawal result.`);
        } else {
            sentences.push('Social Security is off. This success rate counts portfolio withdrawals only, unless a pension or other income is also turned on.');
        }
        if (opts.includeSpouseSS && opts.spouseSSMonthlyBenefit > 0) {
            sentences.push(`Spouse Social Security is on: $${Math.round(opts.spouseSSMonthlyBenefit).toLocaleString()} per month at full retirement age, claimed at age ${opts.spouseSSClaimingAge}.`);
        }
        if (opts.includeOtherIncome && ((opts.monthlyPension || 0) > 0 || (opts.monthlyOtherIncome || 0) > 0)) {
            sentences.push('Pension or other income is on, so part of spending is not withdrawn from the portfolio.');
        }
        return sentences;
    }

    function runRetirementTrials(inp, sequences, preTaxFn) {
        return sequences.map(sequence => {
            const r = Sim.runRetirementTrial(inp, sequence, preTaxFn);
            if (inp.returnMode !== 'historical') r.startYear = null;
            return r;
        });
    }

    function summarizeRetirement(sims, inp) {
        const n = sims.length;
        const L = inp.lifeExpectancy;
        const successes = sims.filter(s => !s.ranOutOfMoney).length;
        const successRate = successes / n * 100;

        const pctl = { real: { p10: [], p25: [], p50: [], p75: [], p90: [] }, nominal: { p10: [], p25: [], p50: [], p75: [], p90: [] } };
        const survival = [];
        const nomBuf = new Float64Array(n);
        const realBuf = new Float64Array(n);
        for (let k = 0; k <= L; k++) {
            let alive = 0;
            for (let s = 0; s < n; s++) {
                const sim = sims[s];
                if (k === 0) { nomBuf[s] = inp.retirementSavings; realBuf[s] = inp.retirementSavings; }
                else {
                    const yd = sim.yearlyData[k - 1];
                    nomBuf[s] = yd ? yd.balance : 0;
                    realBuf[s] = yd ? yd.balance / yd.cpi : 0;
                }
                if (!sim.ranOutOfMoney || sim.yearsLasted > k) alive++;
            }
            survival.push(alive / n * 100);
            const ns = Float64Array.from(nomBuf).sort();
            const rs = Float64Array.from(realBuf).sort();
            [['p10', .1], ['p25', .25], ['p50', .5], ['p75', .75], ['p90', .9]].forEach(([key, q]) => {
                pctl.nominal[key].push(quantileSorted(ns, q));
                pctl.real[key].push(quantileSorted(rs, q));
            });
        }

        const endingBalances = sims.map(s => s.finalBalance).sort((a, b) => a - b);
        const medianEndingBalance = endingBalances[Math.floor(n * 0.5)];
        const endingReal = sims.map(s => s.finalRealBalance).sort((a, b) => a - b);
        const medianEndingReal = endingReal[Math.floor(n * 0.5)];

        let totalReturn = 0, returnCount = 0;
        sims.forEach(sim => sim.yearlyData.forEach(y => { totalReturn += y.return; returnCount++; }));
        const avgReturn = returnCount > 0 ? totalReturn / returnCount : 0;

        const sortedByWithdrawals = [...sims].sort((a, b) => a.totalWithdrawn - b.totalWithdrawn);
        const medianWithdrawals = sortedByWithdrawals[Math.floor(n * 0.5)].totalWithdrawn;

        const yearsLasted = sims.filter(s => s.ranOutOfMoney).map(s => s.yearsLasted).sort((a, b) => a - b);
        const worstCaseYears = yearsLasted.length > 0 ? yearsLasted[Math.floor(yearsLasted.length * 0.1)] : null;
        const earliestDepletion = yearsLasted.length ? yearsLasted[0] : null;

        const hasIncome = sims.some(s => s.totalIncomeReceived > 0);
        let coveragePct = null;
        if (hasIncome) {
            const medianSim = sortedByWithdrawals[Math.floor(n * 0.5)];
            const totalExpensesPT = medianSim.yearlyData.reduce((s, y) => s + y.withdrawal + y.totalIncome, 0);
            coveragePct = totalExpensesPT > 0 ? (medianSim.totalIncomeReceived / totalExpensesPT * 100) : 0;
        }

        let toughest = null;
        if (inp.returnMode === 'historical') {
            toughest = [...sims].sort((a, b) => {
                if (a.ranOutOfMoney !== b.ranOutOfMoney) return a.ranOutOfMoney ? -1 : 1;
                if (a.ranOutOfMoney) return a.yearsLasted - b.yearsLasted;
                return a.finalRealBalance - b.finalRealBalance;
            })[0];
        }

        const sortedByBalance = [...sims].sort((a, b) => a.finalBalance - b.finalBalance);
        const medianSim = sortedByBalance[Math.floor(n / 2)];

        return {
            n, L, successes, successRate, pctl, survival,
            medianEndingBalance, medianEndingReal, avgReturn, medianWithdrawals,
            worstCaseYears, earliestDepletion, hasIncome, coveragePct, toughest, medianSim
        };
    }

    function runRetirementSimulation(opts) {
        opts = opts || {};
        const silent = !!opts.silent;
        const inp = readRetirementInputs();
        const body = $('retirement-results');
        if (!validateRetirement(inp, silent)) { markStale(body, 'retirementRunMeta'); return; }
        const button = $('runRetirementSimulation');
        if (!silent) setButtonLoading(button, true);
        body.classList.add('is-updating');

        setTimeout(() => {
            try {
                const rng = Sim.seededRandom(state.seeds.retirement);
                const sequences = Sim.buildSequences(historicalData, inp.returnMode, inp.lifeExpectancy, inp.simulationCount, true, rng);
                if (sequences.length === 0) {
                    if (!silent) showValidationError('The 1975–2024 sample has no complete window for that retirement length. Shorten the horizon or switch to shuffled years.');
                    markStale(body, 'retirementRunMeta');
                    return;
                }
                const taxSettings = currentTaxSettings();
                const preTaxFn = makePreTaxFn(taxSettings);
                const sims = runRetirementTrials(inp, sequences, preTaxFn);
                const summary = summarizeRetirement(sims, inp);
                const draw = preTaxFn ? preTaxFn(inp.annualWithdrawal, { socialSecurity: 0, pension: 0, otherOrdinary: 0 }) : inp.annualWithdrawal / (1 - inp.taxRate);
                const res = { inp, sims, sequences, summary, preTaxFn, taxSettings, firstDraw: draw, seed: state.seeds.retirement, sens: {} };
                state.results.retirement = res;
                state.table.retirement.page = 1;
                const firstRun = !state.hasRun.retirement;
                state.hasRun.retirement = true;

                $('retirementEmpty').hidden = true;
                body.hidden = false;
                body.classList.remove('is-stale');
                staggerReveal(body);
                renderRetirement(res);
                if (opts.scroll || (firstRun && !silent)) scrollToResults('retirementHero', opts.scrollTop);
                scheduleIdle(() => renderRetirementSensitivity(res));
            } catch (error) {
                console.error('Error in retirement simulation:', error);
                if (!silent) showValidationError('An error occurred during the simulation. Please check your inputs.');
            } finally {
                body.classList.remove('is-updating');
                if (!silent) setButtonLoading(button, false);
            }
        }, silent ? 0 : 40);
    }

    function successLevel(rate) { return rate >= 85 ? 'high' : rate >= 65 ? 'mid' : 'low'; }

    function renderRetirement(res) {
        const { inp, summary } = res;
        const historical = inp.returnMode === 'historical';
        const endAge = inp.retirementAge + inp.lifeExpectancy;

        $('retirementRunMeta').textContent = historical
            ? `${summary.n} complete ${inp.lifeExpectancy}-year windows, 1975–2024`
            : `${fmtInt(summary.n)} shuffled paths · seed ${res.seed}`;

        $('successRate').textContent = `${Math.round(summary.successRate)}%`;
        const ring = $('successRing');
        const level = successLevel(summary.successRate);
        ring.classList.toggle('level-mid', level === 'mid');
        ring.classList.toggle('level-low', level === 'low');
        ring.setAttribute('stroke-dasharray', '0 100');
        requestAnimationFrame(() => requestAnimationFrame(() => ring.setAttribute('stroke-dasharray', `${Math.max(0.01, summary.successRate)} 100`)));

        const headline = $('successHeadline');
        headline.textContent = '';
        const strong = document.createElement('strong');
        strong.textContent = `${fmtInt(summary.successes)} of ${fmtInt(summary.n)}`;
        headline.append(strong, ` ${historical ? 'historical windows' : 'shuffled paths'} still had money after all ${inp.lifeExpectancy} years, to age ${endAge}.`);

        const chips = $('assumptionChips');
        chips.textContent = '';
        const chip = (text, cls) => { const li = document.createElement('li'); li.className = `a-chip ${cls || ''}`; li.textContent = text; chips.appendChild(li); };
        chip(historical ? `Historical cycles · ${summary.n} windows` : `Shuffled years · ${fmtInt(summary.n)} paths`, 'c-sky');
        if (inp.includeSS && inp.ssMonthlyBenefit > 0) chip(`Social Security on · ${fmtMoney(inp.ssMonthlyBenefit)}/mo at ${inp.ssClaimingAge}`, 'c-sun');
        else chip('Social Security off', 'c-teal');
        if (inp.includeSpouseSS && inp.spouseSSMonthlyBenefit > 0) chip(`Spouse SS on · ${fmtMoney(inp.spouseSSMonthlyBenefit)}/mo at ${inp.spouseSSClaimingAge}`, 'c-sun');
        if (inp.includeOtherIncome && (inp.monthlyPension > 0 || inp.monthlyOtherIncome > 0)) chip('Pension / other income on', 'c-sun');
        const ts = res.taxSettings;
        chip(!ts || ts.taxMode === 'simple' ? `Tax ${Math.round(inp.taxRate * 100)}% flat` : `Tax brackets · ${ts.filingStatus === 'single' ? 'single' : 'MFJ'}`);
        chip(inp.adjustForInflation ? 'Spending rises with inflation' : 'Spending fixed in future dollars');
        if (inp.retirementSavings > 0) chip(`First-year draw ${fmtMoney(res.firstDraw)} · ${pct(res.firstDraw / inp.retirementSavings * 100, 1)} of portfolio`);

        const sentences = retirementAssumptionSentences({
            returnMode: inp.returnMode, windowCount: summary.n, lifeExpectancy: inp.lifeExpectancy,
            includeSS: inp.includeSS, ssMonthlyBenefit: inp.ssMonthlyBenefit, ssClaimingAge: inp.ssClaimingAge,
            includeSpouseSS: inp.includeSpouseSS, spouseSSMonthlyBenefit: inp.spouseSSMonthlyBenefit, spouseSSClaimingAge: inp.spouseSSClaimingAge,
            includeOtherIncome: inp.includeOtherIncome, monthlyPension: inp.monthlyPension, monthlyOtherIncome: inp.monthlyOtherIncome
        });
        $('retirementAssumptions').textContent = sentences.join(' ');

        try { renderFan(res); } catch (e) { console.error('Chart error (fan):', e); }
        try { renderSurvival(res); } catch (e) { console.error('Chart error (survival):', e); }
        try { renderOutcomes(res); } catch (e) { console.error('Chart error (outcomes):', e); }
        renderRetirementStats(res);
        renderRetirementCompare();
        renderRetirementTable();
        updatePeek();
    }

    function renderFan(res) {
        const { inp, summary } = res;
        const dollars = state.dollars;
        const p = summary.pctl[dollars];
        const labels = [];
        for (let k = 0; k <= inp.lifeExpectancy; k++) labels.push(inp.retirementAge + k);
        const edge = hexA(C.teal, .28);
        const names = { p90: '90th percentile', p75: '75th percentile', p50: 'Median', p25: '25th percentile', p10: '10th percentile' };
        upsertChart('fan', 'retirementBalanceChart', {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { key: 'p10', label: names.p10, data: p.p10, borderColor: edge, borderWidth: 1, fill: false, tension: .3 },
                    { key: 'p90', label: names.p90, data: p.p90, borderColor: edge, borderWidth: 1, fill: 0, backgroundColor: hexA(C.teal, .10), tension: .3 },
                    { key: 'p25', label: names.p25, data: p.p25, borderColor: 'transparent', borderWidth: 0, fill: false, tension: .3 },
                    { key: 'p75', label: names.p75, data: p.p75, borderColor: 'transparent', borderWidth: 0, fill: 2, backgroundColor: hexA(C.teal, .20), tension: .3 },
                    {
                        key: 'p50', label: names.p50, data: p.p50, borderColor: C.teal, borderWidth: 3.2, fill: false, tension: .3,
                        pointHoverBackgroundColor: C.teal, pointHoverBorderColor: '#fff'
                    }
                ]
            },
            options: {
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: xAxis('Age'),
                    y: yAxis({ title: { display: true, text: dollars === 'real' ? 'Today’s dollars' : 'Future dollars', color: C.faint, font: { size: 11, weight: '500' } } })
                },
                plugins: {
                    fcRefLines: { lines: [{ y: inp.retirementSavings, color: '#9AA3B2', textColor: C.muted, label: `Start ${fmtCompact(inp.retirementSavings)}`, align: 'right' }] },
                    tooltip: {
                        itemSort: (a, b) => b.parsed.y - a.parsed.y,
                        callbacks: {
                            title: items => `Age ${items[0].label}`,
                            label: item => ` ${item.dataset.label}: ${item.parsed.y <= 0 ? 'ran out' : fmtMoney(item.parsed.y)}`,
                            labelColor: item => {
                                const c = item.dataset.key === 'p50' ? C.teal : item.dataset.key === 'p25' || item.dataset.key === 'p75' ? hexA(C.teal, .45) : hexA(C.teal, .22);
                                return { borderColor: c, backgroundColor: c, borderRadius: 3 };
                            }
                        }
                    }
                }
            }
        });
        const L = inp.lifeExpectancy;
        const last10 = p.p10[L], last50 = p.p50[L];
        const cap = `${dollars === 'real' ? 'In today’s dollars' : 'In future dollars'}. At age ${inp.retirementAge + L}, the median balance is ${last50 <= 0 ? '$0' : fmtCompact(last50)} and the 10th percentile is ${last10 <= 0 ? '$0 (ran out)' : fmtCompact(last10)}.`;
        $('fanCaption').textContent = cap;
        setAria('retirementBalanceChart', cap);
    }

    function renderSurvival(res) {
        const { inp, summary } = res;
        const labels = [];
        for (let k = 0; k <= inp.lifeExpectancy; k++) labels.push(inp.retirementAge + k);
        const final = summary.survival[summary.survival.length - 1];
        const color = successLevel(final) === 'high' ? C.teal : successLevel(final) === 'mid' ? C.sun : C.coral;
        const lastIdx = labels.length - 1;
        upsertChart('survival', 'survivalChart', {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Money left', data: summary.survival, borderColor: color, borderWidth: 3, tension: .25, stepped: false,
                    fill: 'origin', backgroundColor: vGradient(color, .22, .02),
                    pointRadius: ctx => (ctx.dataIndex === lastIdx ? 5 : 0), pointBackgroundColor: '#fff', pointBorderColor: color, pointBorderWidth: 2.5,
                    pointHoverBackgroundColor: color, pointHoverBorderColor: '#fff'
                }]
            },
            options: {
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: xAxis('Age'),
                    y: yAxis({ min: 0, max: 100, ticks: { padding: 8, stepSize: 25, callback: v => `${v}%` } })
                },
                plugins: {
                    tooltip: { callbacks: { title: items => `Age ${items[0].label}`, label: item => ` ${pct(item.parsed.y, 1)} of paths still have money` } }
                }
            }
        });
        const cap = summary.earliestDepletion == null
            ? `Every ${inp.returnMode === 'historical' ? 'window' : 'path'} still has money at age ${inp.retirementAge + inp.lifeExpectancy}.`
            : `At age ${inp.retirementAge + inp.lifeExpectancy}, ${pct(final)} still have money. The earliest depletion is at age ${inp.retirementAge + summary.earliestDepletion}.`;
        $('survivalCaption').textContent = cap;
        setAria('survivalChart', cap);
    }

    function renderOutcomes(res) {
        const { inp, summary, sims } = res;
        const historical = inp.returnMode === 'historical';
        const start = inp.retirementSavings;
        if (historical) {
            $('outcomesTitle').textContent = 'How each start year ended';
            const labels = sims.map(s => String(s.startYear));
            const values = sims.map(s => (s.ranOutOfMoney ? 0 : s.finalRealBalance));
            const marks = sims.map(s => (s.ranOutOfMoney ? 0 : null));
            upsertChart('outcomes', 'outcomesChart', {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        { type: 'bar', label: 'Ending balance', data: values, backgroundColor: sims.map(s => (s.finalRealBalance >= start ? hexA(C.teal, .85) : hexA(C.teal, .45))), borderRadius: 5, barPercentage: .8, order: 2 },
                        { type: 'line', label: 'Ran out', data: marks, showLine: false, pointStyle: 'crossRot', pointRadius: 8, pointHoverRadius: 9, pointBorderWidth: 3, borderColor: C.coral, pointBorderColor: C.coral, order: 1 }
                    ]
                },
                options: {
                    interaction: { mode: 'index', intersect: false },
                    scales: { x: xAxis('Year retirement starts', { ticks: { padding: 6, maxRotation: 0, autoSkipPadding: 8 } }), y: yAxis({ title: { display: true, text: 'Ending balance, today’s dollars', color: C.faint, font: { size: 11, weight: '500' } } }) },
                    plugins: {
                        fcRefLines: { lines: [{ y: start, color: '#9AA3B2', textColor: C.muted, label: `Start ${fmtCompact(start)}`, align: 'right' }] },
                        tooltip: {
                            filter: item => item.datasetIndex === 0,
                            callbacks: {
                                title: items => `Retire in ${items[0].label}`,
                                label: item => {
                                    const s = sims[item.dataIndex];
                                    return s.ranOutOfMoney ? ` Ran out at age ${inp.retirementAge + s.yearsLasted}` : ` Ended with ${fmtMoney(s.finalRealBalance)} (today’s $)`;
                                }
                            }
                        }
                    }
                }
            });
            const failed = sims.filter(s => s.ranOutOfMoney);
            const cap = `${summary.successes} of ${summary.n} start years lasted ${inp.lifeExpectancy} years.${failed.length ? ` Crosses mark the ${plural(failed.length, 'year', 'years')} that ran out.` : ''} Darker bars ended with more purchasing power than they started with.`;
            $('outcomesCaption').textContent = cap;
            setAria('outcomesChart', cap);
            return;
        }

        $('outcomesTitle').textContent = 'How paths ended';
        const bins = [
            { label: 'Ran out', test: s => s.ranOutOfMoney, color: C.coral },
            { label: 'Under ½ of start', test: s => !s.ranOutOfMoney && s.finalRealBalance < start * .5, color: C.sun },
            { label: '½ to 1×', test: s => !s.ranOutOfMoney && s.finalRealBalance >= start * .5 && s.finalRealBalance < start, color: '#F4C27F' },
            { label: '1× to 2×', test: s => !s.ranOutOfMoney && s.finalRealBalance >= start && s.finalRealBalance < start * 2, color: '#8CCFC3' },
            { label: '2× to 4×', test: s => !s.ranOutOfMoney && s.finalRealBalance >= start * 2 && s.finalRealBalance < start * 4, color: '#3FA394' },
            { label: 'Over 4×', test: s => !s.ranOutOfMoney && s.finalRealBalance >= start * 4, color: C.teal }
        ];
        const shares = bins.map(b => sims.filter(b.test).length / summary.n * 100);
        upsertChart('outcomes', 'outcomesChart', {
            type: 'bar',
            data: { labels: bins.map(b => b.label), datasets: [{ label: 'Share of paths', data: shares, backgroundColor: bins.map(b => b.color), borderRadius: 8, barPercentage: .78 }] },
            options: {
                scales: {
                    x: xAxis('Ending balance vs. starting balance, both in today’s dollars'),
                    y: yAxis({ ticks: { padding: 8, maxTicksLimit: 5, callback: v => `${v}%` } })
                },
                plugins: { tooltip: { callbacks: { label: item => ` ${pct(item.parsed.y, 1)} of paths` } } }
            }
        });
        const ahead = shares[3] + shares[4] + shares[5];
        const cap = `${pct(ahead)} of paths end with at least the purchasing power they started with. ${pct(shares[0])} run out.`;
        $('outcomesCaption').textContent = cap;
        setAria('outcomesChart', cap);
    }

    function renderRetirementStats(res) {
        const { inp, summary } = res;
        $('medianEndingBalance').textContent = fmtMoney(summary.medianEndingBalance);
        $('medianEndingReal').textContent = `Future dollars · about ${fmtMoney(summary.medianEndingReal)} in today’s`;
        $('retirementAvgReturn').textContent = `${(summary.avgReturn * 100).toFixed(1)}%`;
        $('totalWithdrawals').textContent = fmtMoney(summary.medianWithdrawals);
        $('worstCaseAge').textContent = summary.worstCaseYears != null ? String(inp.retirementAge + summary.worstCaseYears) : 'Funds not depleted';

        const tItem = $('toughestStartItem');
        if (summary.toughest) {
            tItem.hidden = false;
            const t = summary.toughest;
            $('toughestStart').textContent = String(t.startYear);
            $('toughestStartDesc').textContent = t.ranOutOfMoney ? `Ran out at age ${inp.retirementAge + t.yearsLasted}` : `Lowest ending balance: ${fmtMoney(t.finalRealBalance)} today’s $`;
        } else tItem.hidden = true;

        const cov = $('ssCoverageItem');
        if (summary.hasIncome) {
            cov.hidden = false;
            $('ssCoveragePercent').textContent = `${Math.round(summary.coveragePct)}%`;
        } else cov.hidden = true;
    }

    // --- Retirement sensitivity ---
    function computeRetirementSensitivity(res, variable) {
        const { inp } = res;
        const seqs = res.sequences.slice(0, SENSITIVITY_PATHS);
        let points;
        if (variable === 'withdrawal') {
            const mults = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3];
            const seen = new Set();
            points = mults.map(m => ({ value: m === 1 ? inp.annualWithdrawal : Math.max(0, Math.round(inp.annualWithdrawal * m / 500) * 500), current: m === 1, mult: m }))
                .filter(p => { if (seen.has(p.value)) return false; seen.add(p.value); return true; });
        } else {
            const cur = Math.round(inp.stockAllocation * 100);
            const vals = Array.from(new Set([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, cur])).sort((a, b) => a - b);
            points = vals.map(v => ({ value: v, current: v === cur }));
        }
        points.forEach(p => {
            const variant = Object.assign({}, inp, variable === 'withdrawal' ? { annualWithdrawal: p.value } : { stockAllocation: p.value / 100 });
            const sims = runRetirementTrials(variant, seqs, res.preTaxFn);
            p.success = sims.filter(s => !s.ranOutOfMoney).length / sims.length * 100;
        });
        return { variable, points, paths: seqs.length };
    }

    function renderRetirementSensitivity(res) {
        if (state.results.retirement !== res) return;
        const variable = state.sens.retirement;
        const sens = res.sens[variable] || (res.sens[variable] = computeRetirementSensitivity(res, variable));
        const { points } = sens;
        const { inp } = res;
        const labels = points.map(p => (variable === 'withdrawal' ? fmtCompact(p.value) : `${p.value}%`));
        const curIdx = points.findIndex(p => p.current);
        upsertChart('retSens', 'retirementSensitivityChart', {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Success rate', data: points.map(p => p.success), borderColor: C.teal, borderWidth: 3, tension: .3,
                    fill: 'origin', backgroundColor: vGradient(C.teal, .18, .01),
                    pointRadius: points.map(p => (p.current ? 7 : 4)), pointHoverRadius: 8,
                    pointBackgroundColor: points.map(p => (p.current ? C.sun : '#fff')),
                    pointBorderColor: points.map(p => (p.current ? '#fff' : C.teal)), pointBorderWidth: 2
                }]
            },
            options: Object.assign({
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: xAxis(variable === 'withdrawal' ? 'Annual spending, after tax' : 'Stocks in the mix'),
                    y: yAxis({ min: 0, max: 100, ticks: { padding: 8, stepSize: 25, callback: v => `${v}%` } })
                },
                plugins: {
                    fcRefLines: { lines: curIdx >= 0 ? [{ x: curIdx, color: hexA(C.sun, .7), textColor: C.sunStrong, label: 'You', dash: [2, 4], width: 1.25 }] : [] },
                    tooltip: {
                        callbacks: {
                            title: items => {
                                const p = points[items[0].dataIndex];
                                if (variable === 'withdrawal') return `${fmtMoney(p.value)} a year · ${pct(p.value / inp.retirementSavings * 100, 1)} of portfolio${p.current ? ' (yours)' : ''}`;
                                return `${p.value}% stocks${p.current ? ' (yours)' : ''}`;
                            },
                            label: item => ` Money lasted in ${pct(item.parsed.y)} of paths`,
                            footer: items => (points[items[0].dataIndex].current ? '' : 'Click to try this')
                        }
                    }
                }
            }, clickable(i => applySensitivityPoint('retirement', variable, points[i].value)))
        });
        const cur = points[curIdx];
        let text = '';
        if (variable === 'withdrawal') {
            const lo = points.find(p => p.mult === 0.9), hi = points.find(p => p.mult === 1.1);
            if (lo && hi && cur) text = `At ${fmtMoney(lo.value)} a year the money lasts in ${pct(lo.success)} of paths; at ${fmtMoney(hi.value)} it lasts in ${pct(hi.success)}. Yours: ${pct(cur.success)}.`;
        } else {
            const best = points.reduce((a, b) => (b.success > a.success ? b : a));
            text = `On these paths the success rate peaks at ${pct(best.success)} with ${best.value}% stocks. Yours: ${cur ? pct(cur.success) : '–'}.`;
        }
        $('retirementSensitivityCaption').textContent = `${text} Same ${fmtInt(sens.paths)} paths for every point. Click a point to try it.`;
        setAria('retirementSensitivityChart', text);
    }

    // ============================================
    // COMPARE (PINNED SCENARIOS)
    // ============================================
    function modeShort(m) { return m === 'historical' ? 'historical' : 'shuffled'; }

    function pinCurrent(tab) {
        const res = state.results[tab];
        if (!res) return;
        const pins = state.pins[tab];
        const color = PIN_COLORS[state.pinSeq++ % PIN_COLORS.length];
        if (tab === 'savings') {
            const { inp, summary } = res;
            pins.push({
                color, cdf: summary.cdf.slice(), median: summary.median, p10: summary.p10, p90: summary.p90, reachedPct: summary.reachedPct,
                label: `Goal ${fmtCompact(inp.targetAmount)} · spend ${fmtCompact(inp.expenses)} · ${Math.round(inp.stockAllocation * 100)}% stocks · ${modeShort(inp.returnMode)}`
            });
        } else {
            const { inp, summary } = res;
            pins.push({
                color, survival: summary.survival.slice(), successRate: summary.successRate, medianEndReal: summary.medianEndingReal,
                drawPct: inp.retirementSavings > 0 ? res.firstDraw / inp.retirementSavings * 100 : 0,
                label: `${fmtCompact(inp.retirementSavings)} · spend ${fmtCompact(inp.annualWithdrawal)} · ${Math.round(inp.stockAllocation * 100)}% stocks · ${inp.lifeExpectancy} yrs · ${modeShort(inp.returnMode)} · SS ${inp.includeSS && inp.ssMonthlyBenefit > 0 ? 'on' : 'off'}`
            });
        }
        while (pins.length > MAX_PINS) pins.shift();
        showToast('Pinned. Change an input and the comparison updates below.');
        if (tab === 'savings') renderSavingsCompare(); else renderRetirementCompare();
        const card = $(tab === 'savings' ? 'savingsCompare' : 'retirementCompare');
        if (card && pins.length === 1) setTimeout(() => card.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' }), 150);
    }

    function removePin(tab, idx) {
        state.pins[tab].splice(idx, 1);
        if (tab === 'savings') renderSavingsCompare(); else renderRetirementCompare();
    }

    function buildCompareTable(tableId, tab, head, rows) {
        const table = $(tableId);
        table.textContent = '';
        const thead = document.createElement('thead');
        const htr = document.createElement('tr');
        head.forEach(h => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = h; htr.appendChild(th); });
        thead.appendChild(htr);
        const tbody = document.createElement('tbody');
        rows.forEach((r, i) => {
            const tr = document.createElement('tr');
            if (r.current) tr.className = 'is-current';
            const first = document.createElement('td');
            const sw = document.createElement('span');
            sw.className = 'compare-swatch';
            sw.style.background = r.color;
            const name = document.createElement('span');
            name.textContent = r.current ? `Current · ${r.label}` : r.label;
            first.append(sw, name);
            tr.appendChild(first);
            r.cells.forEach(c => { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td); });
            const act = document.createElement('td');
            if (!r.current) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'compare-remove';
                b.setAttribute('aria-label', `Remove ${r.label}`);
                b.textContent = '×';
                b.addEventListener('click', () => removePin(tab, r.pinIndex));
                act.appendChild(b);
            }
            tr.appendChild(act);
            tbody.appendChild(tr);
        });
        table.append(thead, tbody);
    }

    function renderSavingsCompare() {
        const card = $('savingsCompare');
        const pins = state.pins.savings;
        const res = state.results.savings;
        if (!pins.length || !res) { card.hidden = true; return; }
        card.hidden = false;
        const { inp, summary } = res;
        const all = [...pins.map((p, i) => Object.assign({ pinIndex: i }, p)), { current: true, color: C.teal, cdf: summary.cdf, median: summary.median, p10: summary.p10, p90: summary.p90, reachedPct: summary.reachedPct, label: `Goal ${fmtCompact(inp.targetAmount)} · spend ${fmtCompact(inp.expenses)} · ${Math.round(inp.stockAllocation * 100)}% stocks · ${modeShort(inp.returnMode)}` }];
        const maxYear = Math.min(MAX_ACCUMULATION_YEARS, Math.max(10, ...all.map(a => (a.p90 != null ? a.p90 + 4 : MAX_ACCUMULATION_YEARS))));
        const labels = [];
        for (let y = 0; y <= maxYear; y++) labels.push(y);
        upsertChart('savingsCompare', 'savingsCompareChart', {
            type: 'line',
            data: {
                labels,
                datasets: all.map(a => ({
                    label: a.current ? 'Current' : a.label, data: labels.map(y => a.cdf[y]), borderColor: a.color,
                    borderWidth: a.current ? 3.2 : 2.2, borderDash: a.current ? [] : [6, 4], tension: .3, fill: false,
                    pointHoverBackgroundColor: a.color, pointHoverBorderColor: '#fff'
                }))
            },
            options: {
                interaction: { mode: 'index', intersect: false },
                scales: { x: xAxis('Years from now', { ticks: { padding: 6, maxRotation: 0, autoSkipPadding: 12 } }), y: yAxis({ min: 0, max: 100, ticks: { padding: 8, stepSize: 25, callback: v => `${v}%` } }) },
                plugins: { tooltip: { callbacks: { title: items => `Year ${items[0].label}`, label: item => ` ${pct(item.parsed.y)} reached · ${item.dataset.label.length > 38 ? `${item.dataset.label.slice(0, 38)}…` : item.dataset.label}` } } }
            }
        });
        const y = v => (v == null ? '50+ yrs' : `${v} yrs`);
        buildCompareTable('savingsCompareTable', 'savings', ['Scenario', 'Median', 'Faster 10%', 'Slower 10%', 'Reach it', ''],
            all.slice().reverse().map(a => ({ current: a.current, color: a.color, label: a.label, pinIndex: a.pinIndex, cells: [y(a.median), y(a.p10), y(a.p90), pct(a.reachedPct)] })));
    }

    function renderRetirementCompare() {
        const card = $('retirementCompare');
        const pins = state.pins.retirement;
        const res = state.results.retirement;
        if (!pins.length || !res) { card.hidden = true; return; }
        card.hidden = false;
        const { inp, summary } = res;
        const all = [...pins.map((p, i) => Object.assign({ pinIndex: i }, p)), {
            current: true, color: C.teal, survival: summary.survival, successRate: summary.successRate, medianEndReal: summary.medianEndingReal,
            drawPct: inp.retirementSavings > 0 ? res.firstDraw / inp.retirementSavings * 100 : 0,
            label: `${fmtCompact(inp.retirementSavings)} · spend ${fmtCompact(inp.annualWithdrawal)} · ${Math.round(inp.stockAllocation * 100)}% stocks · ${inp.lifeExpectancy} yrs · ${modeShort(inp.returnMode)} · SS ${inp.includeSS && inp.ssMonthlyBenefit > 0 ? 'on' : 'off'}`
        }];
        const maxL = Math.max(...all.map(a => a.survival.length - 1));
        const labels = [];
        for (let k = 0; k <= maxL; k++) labels.push(k);
        upsertChart('retCompare', 'retirementCompareChart', {
            type: 'line',
            data: {
                labels,
                datasets: all.map(a => ({
                    label: a.current ? 'Current' : a.label, data: labels.map(k => (k < a.survival.length ? a.survival[k] : null)), borderColor: a.color,
                    borderWidth: a.current ? 3.2 : 2.2, borderDash: a.current ? [] : [6, 4], tension: .25, fill: false,
                    pointHoverBackgroundColor: a.color, pointHoverBorderColor: '#fff'
                }))
            },
            options: {
                interaction: { mode: 'index', intersect: false },
                scales: { x: xAxis('Years into retirement'), y: yAxis({ min: 0, max: 100, ticks: { padding: 8, stepSize: 25, callback: v => `${v}%` } }) },
                plugins: { tooltip: { callbacks: { title: items => `Year ${items[0].label}`, label: item => ` ${pct(item.parsed.y)} have money · ${item.dataset.label.length > 38 ? `${item.dataset.label.slice(0, 38)}…` : item.dataset.label}` } } }
            }
        });
        buildCompareTable('retirementCompareTable', 'retirement', ['Scenario', 'Money lasted', 'Median end, today’s $', 'First-year draw', ''],
            all.slice().reverse().map(a => ({ current: a.current, color: a.color, label: a.label, pinIndex: a.pinIndex, cells: [pct(a.successRate), fmtMoney(a.medianEndReal), pct(a.drawPct, 1)] })));
    }

    // ============================================
    // TABLES
    // ============================================
    function avgReturnOf(sim) {
        if (sim._avg == null) {
            let t = 0;
            sim.yearlyData.forEach(y => { t += y.return; });
            sim._avg = sim.yearlyData.length ? t / sim.yearlyData.length : 0;
        }
        return sim._avg;
    }

    function renderPager(pagerId, page, total, onPage) {
        const pager = $(pagerId);
        pager.textContent = '';
        const pages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
        const from = total ? (page - 1) * ROWS_PER_PAGE + 1 : 0;
        const to = Math.min(total, page * ROWS_PER_PAGE);
        const info = document.createElement('span');
        info.textContent = `Showing ${fmtInt(from)}–${fmtInt(to)} of ${fmtInt(total)}`;
        const btns = document.createElement('div');
        btns.className = 'pager-buttons';
        const prev = document.createElement('button');
        prev.type = 'button'; prev.textContent = 'Previous'; prev.disabled = page <= 1;
        prev.addEventListener('click', () => onPage(page - 1));
        const next = document.createElement('button');
        next.type = 'button'; next.textContent = 'Next'; next.disabled = page >= pages;
        next.addEventListener('click', () => onPage(page + 1));
        btns.append(prev, next);
        pager.append(info, btns);
    }

    function cell(tr, text, cls) {
        const td = document.createElement('td');
        if (cls) td.className = cls;
        if (text instanceof Node) td.appendChild(text); else td.textContent = text;
        tr.appendChild(td);
        return td;
    }

    function detailsButton(onClick, label) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'view-details-btn';
        b.textContent = 'Details';
        b.setAttribute('aria-label', `Details for ${label}`);
        b.addEventListener('click', onClick);
        return b;
    }

    function renderSavingsTable() {
        const res = state.results.savings;
        if (!res) return;
        const t = state.table.savings;
        const rows = res.sims.map((sim, i) => ({ sim, i }));
        if (t.sort) {
            const val = r => {
                switch (t.sort) {
                    case 'yearsToGoal': return r.sim.yearsToTarget != null ? r.sim.yearsToTarget : Infinity;
                    case 'finalBalance': return r.sim.finalBalance;
                    case 'finalRealBalance': return r.sim.finalRealBalance;
                    case 'avgReturn': return avgReturnOf(r.sim);
                    default: return r.i;
                }
            };
            rows.sort((a, b) => (t.dir === 'asc' ? val(a) - val(b) : val(b) - val(a)));
        }
        document.querySelectorAll('.simulation-table th').forEach(th => {
            const btn = th.querySelector('.sort-btn');
            if (!btn) return;
            const key = btn.getAttribute('data-sort');
            if (key === t.sort) th.setAttribute('aria-sort', t.dir === 'asc' ? 'ascending' : 'descending');
            else th.removeAttribute('aria-sort');
        });
        const body = $('simulationTableBody');
        body.textContent = '';
        const start = (t.page - 1) * ROWS_PER_PAGE;
        rows.slice(start, start + ROWS_PER_PAGE).forEach(({ sim, i }) => {
            const tr = document.createElement('tr');
            if (sim === res.summary.medianSim) tr.className = 'median-row';
            const label = sim.startYear ? `${sim.startYear} start` : `#${i + 1}`;
            const first = cell(tr, label);
            if (sim === res.summary.medianSim) {
                const b = document.createElement('span'); b.className = 'median-badge'; b.textContent = 'MEDIAN'; first.appendChild(b);
            }
            cell(tr, sim.yearsToTarget != null ? plural(sim.yearsToTarget, 'year', 'years') : 'Not reached');
            cell(tr, fmtMoney(sim.finalRealBalance));
            cell(tr, fmtMoney(sim.finalBalance));
            cell(tr, `${(avgReturnOf(sim) * 100).toFixed(1)}%`);
            cell(tr, detailsButton(() => showSimulationDetails('savings', sim, label), label));
            body.appendChild(tr);
        });
        renderPager('savingsPager', t.page, rows.length, p => { t.page = p; renderSavingsTable(); });
    }

    function renderRetirementTable() {
        const res = state.results.retirement;
        if (!res) return;
        const t = state.table.retirement;
        const medianSim = res.summary.medianSim;
        let rows = res.sims.map((sim, i) => ({ sim, i }));
        if (t.filter === 'success') rows = rows.filter(r => !r.sim.ranOutOfMoney);
        else if (t.filter === 'failure') rows = rows.filter(r => r.sim.ranOutOfMoney);
        else if (t.filter === 'median') rows = rows.filter(r => r.sim === medianSim);
        const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
        if (t.page > pages) t.page = pages;
        const body = $('simulations-table-body');
        body.textContent = '';
        const start = (t.page - 1) * ROWS_PER_PAGE;
        rows.slice(start, start + ROWS_PER_PAGE).forEach(({ sim, i }) => {
            const tr = document.createElement('tr');
            if (sim === medianSim) tr.className = 'median-row';
            const label = sim.startYear ? `${sim.startYear} start` : `#${i + 1}`;
            const first = cell(tr, label);
            if (sim === medianSim) {
                const b = document.createElement('span'); b.className = 'median-badge'; b.textContent = 'MEDIAN'; first.appendChild(b);
            }
            cell(tr, fmtMoney(sim.finalRealBalance));
            cell(tr, fmtMoney(sim.finalBalance));
            cell(tr, sim.ranOutOfMoney ? `${sim.yearsLasted}` : `${sim.yearsLasted} (full period)`);
            const status = document.createElement('span');
            status.className = `status ${sim.ranOutOfMoney ? 'status-bad' : 'status-ok'}`;
            status.textContent = sim.ranOutOfMoney ? `Ran out at ${res.inp.retirementAge + sim.yearsLasted}` : 'Lasted';
            cell(tr, status);
            cell(tr, detailsButton(() => showSimulationDetails('retirement', sim, label), label));
            body.appendChild(tr);
        });
        if (!rows.length) {
            const tr = document.createElement('tr');
            const td = cell(tr, 'No paths match this filter.');
            td.colSpan = 6;
            body.appendChild(tr);
        }
        renderPager('retirementPager', t.page, rows.length, p => { t.page = p; renderRetirementTable(); });
    }

    function wireTables() {
        document.querySelectorAll('.simulation-table .sort-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = state.table.savings;
                const key = btn.getAttribute('data-sort');
                if (t.sort === key) t.dir = t.dir === 'asc' ? 'desc' : 'asc';
                else { t.sort = key; t.dir = 'asc'; }
                t.page = 1;
                renderSavingsTable();
            });
        });
        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(button => {
            button.addEventListener('click', () => {
                filterButtons.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-pressed', 'false'); });
                button.classList.add('active');
                button.setAttribute('aria-pressed', 'true');
                state.table.retirement.filter = button.getAttribute('data-filter');
                state.table.retirement.page = 1;
                renderRetirementTable();
            });
        });
    }

    // ============================================
    // PATH DETAIL DIALOG
    // ============================================
    function showSimulationDetails(kind, sim, label) {
        const dialog = $('simModal');
        if (!dialog) return;
        const savings = kind === 'savings';
        const res = state.results[kind];
        const inp = res.inp;
        $('simModalTitle').textContent = savings ? `Savings path ${label}` : `Retirement path ${label}`;

        const stats = $('simModalStats');
        stats.textContent = '';
        const stat = (k, v, d) => {
            const el = document.createElement('div');
            el.className = 'stat';
            el.innerHTML = '<p class="stat-label"></p><p class="stat-value"></p>';
            el.querySelector('.stat-label').textContent = k;
            el.querySelector('.stat-value').textContent = v;
            if (d) { const p = document.createElement('p'); p.className = 'stat-desc'; p.textContent = d; el.appendChild(p); }
            stats.appendChild(el);
        };
        if (savings) stat('Years to goal', sim.yearsToTarget != null ? plural(sim.yearsToTarget, 'year', 'years') : 'Not reached', 'Today’s purchasing power');
        else stat('Years lasted', sim.ranOutOfMoney ? `${sim.yearsLasted}, ran out` : `${sim.yearsLasted}, full period`);
        stat('Final balance', fmtMoney(sim.finalRealBalance), 'Today’s dollars');
        stat('Final balance', fmtMoney(sim.finalBalance), 'Future dollars');
        stat('Average return', `${(avgReturnOf(sim) * 100).toFixed(1)}%`, 'Arithmetic mean');

        const head = $('simModalHead');
        const body = $('simModalBody');
        head.textContent = '';
        body.textContent = '';
        const cols = savings
            ? ['Year', 'Age', 'Return', 'Inflation', 'Contribution', 'Balance, future $', 'Balance, today’s $']
            : ['Year', 'Age', 'Return', 'Inflation', 'Spending (after tax)', 'Portfolio draw', 'Other income', 'Balance, future $', 'Balance, today’s $'];
        const htr = document.createElement('tr');
        cols.forEach(c => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = c; htr.appendChild(th); });
        head.appendChild(htr);
        const startAge = savings ? inp.currentAge : inp.retirementAge;
        sim.yearlyData.forEach((d, i) => {
            const tr = document.createElement('tr');
            cell(tr, d.calendarYear && inp.returnMode === 'historical' ? String(d.calendarYear) : `${i + 1}${d.calendarYear ? ` (${d.calendarYear})` : ''}`);
            cell(tr, String(startAge + i));
            cell(tr, `${(d.return * 100).toFixed(1)}%`);
            cell(tr, `${(d.inflation * 100).toFixed(1)}%`);
            if (savings) cell(tr, fmtMoney(d.contribution));
            else {
                cell(tr, fmtMoney(d.afterTaxWithdrawal));
                cell(tr, fmtMoney(d.withdrawal));
                cell(tr, fmtMoney(d.totalIncome || 0));
            }
            cell(tr, fmtMoney(d.balance));
            cell(tr, fmtMoney(d.realBalance != null ? d.realBalance : d.balance / (d.cpi || 1)));
            body.appendChild(tr);
        });

        if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');

        const labels = [startAge];
        const start = savings ? inp.currentSavings : inp.retirementSavings;
        const nominal = [start];
        const real = [start];
        sim.yearlyData.forEach((d, i) => {
            labels.push(startAge + i + 1);
            nominal.push(d.balance);
            real.push(d.realBalance != null ? d.realBalance : d.balance / (d.cpi || 1));
        });
        const lines = savings ? [{ y: inp.targetAmount, color: C.sun, textColor: C.sunStrong, label: `Goal ${fmtCompact(inp.targetAmount)} (today’s $)` }] : [];
        upsertChart('detail', 'simDetailChartCanvas', {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Future dollars', data: nominal, borderColor: C.sky, borderWidth: 2, borderDash: [5, 4], tension: .25, fill: false, pointHoverBackgroundColor: C.sky, pointHoverBorderColor: '#fff' },
                    { label: 'Today’s dollars', data: real, borderColor: C.teal, borderWidth: 3, tension: .25, fill: 'origin', backgroundColor: vGradient(C.teal, .16, .01), pointHoverBackgroundColor: C.teal, pointHoverBorderColor: '#fff' }
                ]
            },
            options: {
                interaction: { mode: 'index', intersect: false },
                scales: { x: xAxis('Age'), y: yAxis() },
                plugins: {
                    legend: { display: true, position: 'bottom', labels: { usePointStyle: true, pointStyle: 'line', padding: 16, color: C.muted } },
                    fcRefLines: { lines },
                    tooltip: { callbacks: { title: items => `Age ${items[0].label}`, label: item => ` ${item.dataset.label}: ${fmtMoney(item.parsed.y)}` } }
                }
            }
        });
    }

    // ============================================
    // SHARE
    // ============================================
    function getShareableUrl() {
        const url = new URL(window.location.href);
        const params = new URLSearchParams();
        const v = id => $(id).value;
        if (activeTabKey() === 'retirement') {
            params.append('tab', 'retirement');
            params.append('retirementAge', v('retirementAge'));
            params.append('retirementSavings', v('retirementSavings'));
            params.append('annualWithdrawal', v('annualWithdrawal'));
            params.append('retirementStockAllocation', v('retirementStockAllocation'));
            params.append('withdrawalAdjustment', $('withdrawalAdjustment').checked);
            params.append('taxRate', v('taxRate'));
            if (typeof window.getTaxShareParams === 'function') {
                const taxParams = window.getTaxShareParams();
                for (const [k, val] of taxParams.entries()) params.append(k, val);
            }
            params.append('retirementLifeExpectancy', v('retirementLifeExpectancy'));
            params.append('simulationCount', v('simulationCount'));
            params.append('retirementReturnMode', v('retirementReturnMode'));
            params.append('includeSS', $('includeSS').checked);
            params.append('ssMonthlyBenefit', v('ssMonthlyBenefit'));
            params.append('ssClaimingAge', v('ssClaimingAge'));
            params.append('includeSpouseSS', $('includeSpouseSS').checked);
            params.append('spouseSSMonthlyBenefit', v('spouseSSMonthlyBenefit'));
            params.append('spouseSSClaimingAge', v('spouseSSClaimingAge'));
            params.append('includeOtherIncome', $('includeOtherIncome').checked);
            params.append('monthlyPension', v('monthlyPension'));
            params.append('pensionStartAge', v('pensionStartAge'));
            params.append('monthlyOtherIncome', v('monthlyOtherIncome'));
            params.append('otherIncomeDuration', v('otherIncomeDuration'));
            params.append('seed', state.seeds.retirement);
        } else {
            params.append('tab', 'accumulation');
            params.append('currentAge', v('currentAge'));
            params.append('currentSavings', v('currentSavings'));
            params.append('income', v('income'));
            params.append('expenses', v('expenses'));
            params.append('targetAmount', v('targetAmount'));
            params.append('stockAllocation', v('stockAllocation'));
            params.append('incomeGrowth', v('incomeGrowth'));
            params.append('savingsSimulationCount', v('savingsSimulationCount'));
            params.append('savingsReturnMode', v('savingsReturnMode'));
            params.append('seed', state.seeds.savings);
        }
        return `${url.origin}${url.pathname}?${params.toString()}`;
    }

    function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
        return new Promise((resolve, reject) => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy') ? resolve() : reject(new Error('copy failed')); } catch (e) { reject(e); }
            ta.remove();
        });
    }

    function wireShare() {
        document.querySelectorAll('[data-share]').forEach(btn => {
            btn.addEventListener('click', () => {
                copyText(getShareableUrl())
                    .then(() => showToast('Link copied. It includes your inputs, so share it with care.'))
                    .catch(err => { console.error('Could not copy text: ', err); showToast('Could not copy the link.', true); });
            });
        });
    }

    function applySharedParameters() {
        const params = new URLSearchParams(window.location.search);
        if (params.size === 0 || ![...params.keys()].length) return;
        const setVal = id => { if (params.has(id)) $(id).value = params.get(id); };
        const setChk = id => { if (params.has(id)) $(id).checked = params.get(id) === 'true'; };
        const seed = parseInt(params.get('seed'), 10);
        if (params.get('tab') === 'retirement') {
            showTab('retirement-tab');
            ['retirementAge', 'retirementSavings', 'annualWithdrawal', 'retirementStockAllocation', 'taxRate',
                'retirementLifeExpectancy', 'simulationCount', 'retirementReturnMode', 'ssMonthlyBenefit', 'ssClaimingAge',
                'spouseSSMonthlyBenefit', 'spouseSSClaimingAge', 'monthlyPension', 'pensionStartAge', 'monthlyOtherIncome', 'otherIncomeDuration'].forEach(setVal);
            ['withdrawalAdjustment', 'includeSS', 'includeSpouseSS', 'includeOtherIncome'].forEach(setChk);
            if (seed > 0) state.seeds.retirement = seed;
            ['includeSS', 'includeSpouseSS', 'includeOtherIncome'].forEach(id => $(id).dispatchEvent(new Event('change')));
            finalizeSharedLoad();
            runRetirementSimulation({ scroll: true });
        } else if (params.has('tab') || params.has('currentAge')) {
            ['currentAge', 'currentSavings', 'income', 'expenses', 'targetAmount', 'stockAllocation', 'incomeGrowth',
                'savingsSimulationCount', 'savingsReturnMode'].forEach(setVal);
            if (seed > 0) state.seeds.savings = seed;
            finalizeSharedLoad();
            runAccumulationSimulation({ scroll: true });
        }
    }

    function finalizeSharedLoad() {
        document.querySelectorAll('input[data-money]').forEach(formatMoneyInput);
        syncSlider('stockAllocation');
        syncSlider('retirementStockAllocation');
        wireReturnModeControl('savingsReturnMode', 'savingsSimulationCount', 'savingsReturnModeNote', 'savings');
        wireReturnModeControl('retirementReturnMode', 'simulationCount', 'retirementReturnModeNote', 'retirement');
        refreshBadges();
    }

    // ============================================
    // SMALL UI HELPERS
    // ============================================
    function setButtonLoading(button, on) {
        if (!button) return;
        const label = button.querySelector('.btn-label');
        if (on) {
            button.dataset.label = label ? label.textContent : '';
            if (label) label.textContent = 'Running paths…';
            button.classList.add('loading');
            button.disabled = true;
        } else {
            if (label && button.dataset.label) label.textContent = button.dataset.label;
            button.classList.remove('loading');
            button.disabled = false;
        }
    }

    function markStale(body, metaId) {
        if (!body || body.hidden) return;
        body.classList.add('is-stale');
        const meta = $(metaId);
        if (meta) meta.textContent = 'Check your inputs. Showing the last complete run.';
    }

    function staggerReveal(body) {
        body.querySelectorAll('.reveal').forEach((el, i) => el.style.setProperty('--i', i));
    }

    function scheduleIdle(fn) {
        if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 400 });
        else setTimeout(fn, 60);
    }

    function scrollToResults(heroId, toTop) {
        const hero = $(heroId);
        if (!hero) return;
        const behavior = reducedMotion ? 'auto' : 'smooth';
        requestAnimationFrame(() => {
            const header = document.querySelector('.app-header');
            const headerH = header ? header.offsetHeight : 0;
            const rect = hero.getBoundingClientRect();
            if (window.innerWidth >= DESKTOP_MIN && !toTop) {
                if (rect.top >= headerH && rect.top < window.innerHeight * 0.45) return;
            }
            window.scrollTo({ top: rect.top + window.pageYOffset - headerH - 16, behavior });
        });
    }

    // Mobile: a floating pill with the headline result while the hero is off-screen.
    const heroVisible = { savings: false, retirement: false };
    function updatePeek() {
        const peek = $('resultPeek');
        if (!peek) return;
        const tab = activeTabKey();
        const res = state.results[tab];
        if (!res || window.innerWidth >= DESKTOP_MIN || heroVisible[tab]) { peek.hidden = true; return; }
        const dot = $('peekDot');
        if (tab === 'savings') {
            const m = res.summary.median;
            $('peekText').textContent = m == null ? 'Median: goal not reached' : `Median: ${plural(m, 'year', 'years')} to goal`;
            dot.className = 'peek-dot';
        } else {
            const r = res.summary.successRate;
            $('peekText').textContent = `${Math.round(r)}% of paths lasted`;
            const level = successLevel(r);
            dot.className = `peek-dot${level === 'high' ? '' : ` level-${level}`}`;
        }
        peek.hidden = false;
    }

    function wirePeek() {
        const peek = $('resultPeek');
        if (!peek) return;
        peek.addEventListener('click', () => {
            const hero = $(activeTabKey() === 'savings' ? 'savingsHero' : 'retirementHero');
            if (hero) hero.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
        });
        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver(entries => {
                entries.forEach(e => { heroVisible[e.target.id === 'savingsHero' ? 'savings' : 'retirement'] = e.isIntersecting; });
                updatePeek();
            }, { threshold: 0.15 });
            ['savingsHero', 'retirementHero'].forEach(id => { const el = $(id); if (el) io.observe(el); });
        }
        window.addEventListener('resize', debounce(updatePeek, 150));
    }

    function wireDialogs() {
        const help = $('helpModal');
        const openHelp = () => { if (typeof help.showModal === 'function') help.showModal(); else help.setAttribute('open', ''); };
        $('helpButton').addEventListener('click', openHelp);
        document.querySelectorAll('[data-open-help]').forEach(b => b.addEventListener('click', openHelp));
        $('closeHelpModal').addEventListener('click', () => help.close());
        $('closeSimModal').addEventListener('click', () => $('simModal').close());
        [help, $('simModal')].forEach(d => {
            d.addEventListener('click', e => { if (e.target === d) d.close(); });
            d.addEventListener('close', closeHints);
        });
    }

    function wireSegmented() {
        document.querySelectorAll('.seg[data-sens]').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.getAttribute('data-sens');
                btn.parentElement.querySelectorAll('.seg').forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-checked', b === btn ? 'true' : 'false'); });
                state.sens[tab] = btn.getAttribute('data-var');
                const res = state.results[tab];
                if (res) (tab === 'savings' ? renderSavingsSensitivity : renderRetirementSensitivity)(res);
            });
        });
        document.querySelectorAll('.seg[data-dollars]').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.parentElement.querySelectorAll('.seg').forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-checked', b === btn ? 'true' : 'false'); });
                state.dollars = btn.getAttribute('data-dollars');
                if (state.results.retirement) renderFan(state.results.retirement);
            });
        });
    }

    function wireLiveUpdates() {
        const liveSavings = debounce(() => { if (state.hasRun.savings) runAccumulationSimulation({ silent: true }); }, 450);
        const liveRetirement = debounce(() => { if (state.hasRun.retirement) runRetirementSimulation({ silent: true }); }, 450);
        const onEdit = (tab, fn) => e => {
            if (!e.target.matches('input, select')) return;
            if (tab === 'savings') updateSavingsHelpers(); else refreshBadges();
            fn();
        };
        ['input', 'change'].forEach(type => {
            $('savingsForm').addEventListener(type, onEdit('savings', liveSavings));
            $('retirementForm').addEventListener(type, onEdit('retirement', liveRetirement));
        });
        $('savingsForm').addEventListener('submit', e => e.preventDefault());
        $('retirementForm').addEventListener('submit', e => e.preventDefault());
    }

    function wireActions() {
        $('runSimulation').addEventListener('click', () => runAccumulationSimulation());
        $('runRetirementSimulation').addEventListener('click', () => runRetirementSimulation());
        $('savingsReshuffle').addEventListener('click', () => { state.seeds.savings = newSeed(); runAccumulationSimulation({ silent: true }); showToast('New shuffled paths drawn.'); });
        $('retirementReshuffle').addEventListener('click', () => { state.seeds.retirement = newSeed(); runRetirementSimulation({ silent: true }); showToast('New shuffled paths drawn.'); });
        $('savingsPin').addEventListener('click', () => pinCurrent('savings'));
        $('retirementPin').addEventListener('click', () => pinCurrent('retirement'));
        $('handoffButton').addEventListener('click', handoffToRetirement);
        $('goal25x').addEventListener('click', () => {
            const e = readMoney('expenses', NaN);
            if (isNaN(e)) return;
            setMoney('targetAmount', e * 25);
            saveInputsToStorage();
            $('targetAmount').dispatchEvent(new Event('change', { bubbles: true }));
        });
        document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => applyPreset(b.getAttribute('data-preset'))));
    }

    // ============================================
    // INIT
    // ============================================
    document.addEventListener('DOMContentLoaded', function () {
        const urlParams = new URLSearchParams(window.location.search);
        if (![...urlParams.keys()].length) loadInputsFromStorage();

        document.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('change', saveInputsToStorage);
            el.addEventListener('input', saveInputsToStorage);
        });

        showTab('accumulation-tab');
        wireTabs();
        upgradeHints();
        wireMoneyInputs();
        wireSliders();
        setupCheckboxToggle('includeSS', 'ssFields');
        setupCheckboxToggle('includeSpouseSS', 'spouseSSFields');
        setupCheckboxToggle('includeOtherIncome', 'otherIncomeFields');
        wireReturnModeControl('savingsReturnMode', 'savingsSimulationCount', 'savingsReturnModeNote', 'savings');
        wireReturnModeControl('retirementReturnMode', 'simulationCount', 'retirementReturnModeNote', 'retirement');
        wireDialogs();
        wireSegmented();
        wireTables();
        wireShare();
        wireActions();
        wirePeek();
        refreshBadges();
        applySharedParameters();
        wireLiveUpdates();
    });

    window.FirecalcApp = { state, runAccumulationSimulation, runRetirementSimulation, retirementAssumptionSentences };

    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js').catch(error => {
                console.log('ServiceWorker registration failed: ', error);
            });
        });
    }
})();
