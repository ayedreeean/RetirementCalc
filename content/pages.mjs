// Static copy for the guide and calculator pages.
// Numbers are filled from content/scenarios.mjs when the pages are rendered.
// The published HTML is what the site serves. This file does not run in the browser.

export const CARDS = {
    'when-can-i-retire': ['/guides/when-can-i-retire', 'When can I retire?', 'Years to a goal in today’s dollars.'],
    'retire-on-one-million': ['/guides/retire-on-one-million', 'Retire on $1 million', 'The same savings question at three round goals.'],
    'fire-calculator-for-families': ['/guides/fire-calculator-for-families', 'FIRE for families', 'One household spending number, plus a spouse’s benefit.'],
    'coast-fire': ['/guides/coast-fire', 'Coast FIRE', 'Stop contributing and see whether the portfolio still arrives.'],
    'four-percent-rule': ['/guides/four-percent-rule', 'The 4% rule', 'A historical-window test, plus the named stress packs.'],
    'lean-fire': ['/guides/lean-fire', 'Lean FIRE', 'A small spending number, then a long withdrawal test.'],
    'fat-fire': ['/guides/fat-fire', 'Fat FIRE', 'The same test at a high budget.'],
    'barista-fire': ['/guides/barista-fire', 'Barista FIRE', 'Part-time pay next to a portfolio that is not enough on its own.'],
    'retire-at-40': ['/guides/retire-at-40', 'Retire at 40', 'A 50-year horizon has one complete window in this sample.'],
    'retire-at-45': ['/guides/retire-at-45', 'Retire at 45', 'What 25× spending looks like with eleven years to save.'],
    'retire-at-50': ['/guides/retire-at-50', 'Retire at 50', 'A 40-year retirement and the savings path that reaches it.'],
    'sequence-of-returns': ['/guides/sequence-of-returns', 'Sequence of returns', 'Same plan, eleven start years, very different endings.'],
    'roth-conversion-ladder': ['/guides/roth-conversion-ladder', 'Roth conversion ladder', 'The five-year rule, and the tax the portfolio has to fund.'],
    'retiring-early-with-kids': ['/guides/retiring-early-with-kids', 'Retiring early with kids', 'College and health premiums live inside the spending number.'],
    'safe-withdrawal-rate': ['/guides/safe-withdrawal-rate', 'Safe withdrawal rate', '4%, 3.5%, 3.25%, and 3% on one portfolio.'],
    'fire-number': ['/guides/fire-number', 'What is my FIRE number?', 'Spending divided by the withdrawal rate you are willing to test.'],
    'social-security-early-retirement': ['/guides/social-security-early-retirement', 'Social Security', 'Claiming at 62, 67, or 70 after years with no check.'],
    'market-crash-at-retirement': ['/guides/market-crash-at-retirement', 'A crash in year one', '2000, 2008, and 2022 replayed on one plan.'],
    'coast-fire-calculator': ['/coast-fire-calculator', 'Coast FIRE calculator', 'Opens the savings tool with new contributions at zero.'],
    'fire-number-calculator': ['/fire-number-calculator', 'FIRE number calculator', 'Opens a $48,000 spending example, filled in.'],
    'lean-fire-calculator': ['/lean-fire-calculator', 'Lean FIRE calculator', 'Opens the $32,000 spending example.'],
    'barista-fire-calculator': ['/barista-fire-calculator', 'Barista FIRE calculator', 'Opens the part-time-income example.']
};

function card(id) {
    const [href, title, blurb] = CARDS[id];
    return { href, title, blurb };
}

function facts(pairs) {
    return `<dl class="plan-facts">${pairs.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join('')}</dl>`;
}

function shufSave(ctx, s) {
    return `On seed ${ctx.SEED}, the median path takes ${s.median} years, age ${s.ageMedian}. The faster 10% are there by ${s.p10} years, age ${s.ageP10}. The slower 10% take at least ${s.p90} years, age ${s.ageP90}. ${s.reached.toLocaleString('en-US')} of ${s.n.toLocaleString('en-US')} shuffled paths reached the goal inside 50 years.`;
}

function histSave(s) {
    return `${s.reached} of ${s.n} start years reach the goal before the sample ends. The median of all ${s.n} start years is ${s.median} years. The faster 10% are there by ${s.p10} years. Starts near 2024 have only a few years of data, so the slower tail includes windows that run out of history.`;
}

function shufRet(r) {
    return `${r.successes} of ${r.n.toLocaleString('en-US')} shuffled paths kept a balance above zero for every year of the horizon.`;
}

function histRet(r) {
    return `${r.successes} of ${r.n} complete windows kept a balance above zero at the end of every year.`;
}

function sampleNote(windows) {
    return `A ${windows === 1 ? '50-year' : ''} retirement of this length has ${windows} complete ${windows === 1 ? 'window' : 'windows'} in the 1975–2024 table.`.replace('A  retirement', 'A retirement');
}

function signedPct(fraction) {
    const value = fraction * 100;
    const text = Math.abs(value).toFixed(2) + '%';
    if (value < 0) return '−' + text;
    if (value > 0) return '+' + text;
    return text;
}

export function buildPages(ctx) {
    const pages = [];
    const add = (page) => pages.push(page);

    const leanS = ctx.S('leanSave');
    const leanH = ctx.S('leanSaveHist');
    const leanR = ctx.R('leanRet');
    const leanRs = ctx.R('leanRetShuf');
    const lean35 = ctx.R('leanRet35');

    add({
        id: 'lean-fire',
        kind: 'guide',
        path: '/guides/lean-fire',
        file: 'guides/lean-fire.html',
        source: 'lean-fire',
        targetQuery: 'lean FIRE calculator',
        title: 'Lean FIRE calculator: a small budget, tested — FIREcalc',
        description: 'Lean FIRE is a small annual spending number, not a separate engine. See an $800,000 portfolio and $32,000 of spending on 1975–2024 returns.',
        crumb: 'Lean FIRE',
        eyebrow: 'Small budget',
        h1: 'Lean FIRE: how small a budget still holds up?',
        lede: `Lean FIRE means the spending you need in retirement is deliberately low, so the portfolio that covers it can be smaller. In this calculator that is an ordinary withdrawal test. $32,000 a year is 4% of $800,000. On a 45-year horizon, ${histRet(leanR)} Shuffled years, seed ${ctx.SEED}, are a different statistic: ${shufRet(leanRs)}`,
        primary: ctx.link('retirement', 'leanRet'),
        links: [
            { href: ctx.link('retirement', 'leanRet'), label: 'Open the $32,000 example' },
            { href: ctx.link('retirement', 'leanRetShuf'), label: 'Same plan, shuffled years' },
            { href: ctx.link('accumulation', 'leanSave'), label: 'Years to reach $800,000', ghost: true }
        ],
        hint: 'The first button is a 45-year retirement: age 45, $800,000, $32,000 of spending, 70% stocks, 0% tax, Social Security off. The savings button is a different person, still working, saving toward that portfolio.',
        related: ['lean-fire-calculator', 'fat-fire', 'safe-withdrawal-rate', 'fire-number'],
        faqs: [
            { q: 'Is there a separate lean FIRE calculator?', a: 'No. Type the small spending number and the portfolio that matches it. The engine is the same one the other guides use.' },
            { q: 'What counts as lean?', a: 'Whatever annual spending you can actually live on. This page uses $32,000 as an example, which is 4% of $800,000. It is not a definition of a lean lifestyle.' },
            { q: 'Why is a 45-year test thinner than a 30-year test?', a: `The table runs from 1975 through 2024. A 45-year retirement has ${leanR.n} complete windows. A 30-year retirement has 21. Shuffled years redraw from the same 50 rows and are not historical cohorts.` },
            { q: 'Does lean FIRE include Social Security?', a: 'Not in this example. Social Security stays off unless you turn it on. Turning it on means the success count is no longer a portfolio-only test.' }
        ],
        body: `
            <p>People use “lean FIRE” for a retirement spent well below a typical household budget. The label does not change the math. You still need a spending number you can live on, a portfolio, a mix of stocks and Treasuries, and a horizon long enough to cover the years before a later benefit might start. This example leaves Social Security off so the result is the portfolio alone.</p>
            <h2>The withdrawal example</h2>
            <p>Age 45, $800,000 invested, $32,000 of spending in the first year, raised with CPI after that. Stocks 70%, 10-year Treasuries 30%. Tax rate 0%, so the portfolio draw is $32,000, which is 4%. Horizon 45 years, to age 90. ${sampleNote(leanR.n)} ${histRet(leanR)} Those windows are 1975–2019 through 1980–2024. They do not include 1966 or 1973–74.</p>
            ${facts([['Portfolio', ctx.money(800000)], ['Spending', ctx.money(32000)], ['Rate', '4%'], ['Stocks', '70%'], ['Horizon', '45 years'], ['Historical', `${leanR.successes} of ${leanR.n}`]])}
            <p>${shufRet(leanRs)} The earliest of those failures ran out in year ${leanRs.earliest}. At $28,000 of spending, which is 3.5% of the same $800,000, ${lean35.successes} of ${lean35.n.toLocaleString('en-US')} shuffled paths kept a balance above zero for every year of the horizon. The lower rate failed less often on these paths. It is still this sample, not a promise.</p>
            <h2>Getting to $800,000</h2>
            <p>A second sketch is the savings path. Age 33, $45,000 invested, $68,000 of income, $40,000 of spending. The gap is $28,000 a year, and pay rises 1% a year above inflation. Working-life spending is higher than the $32,000 retirement budget. The goal is $800,000 in today’s dollars. Stocks are 80%.</p>
            <p>${shufSave(ctx, leanS)} ${histSave(leanH)} Reaching the goal while you are still spending $40,000 does not mean the retirement at $32,000 has been tested. Run the withdrawal link once the balance is real.</p>
            <p class="callout">Lean fails in this tool the same way any other plan fails: spending is high relative to the portfolio, the horizon is long, or the path draws a bad sequence. A small budget only helps if you can keep it. Fees, a glide path, and markets before 1975 are not in the engine. This is a planning sketch, not advice. The <a href="/lean-fire-calculator">lean FIRE calculator</a> opens the same withdrawal example.</p>
            <h2>Questions people ask next</h2>`
    });

    const fatS = ctx.S('fatSave');
    const fatH = ctx.S('fatSaveHist');
    const fatR = ctx.R('fatRet');
    const fatRs = ctx.R('fatRetShuf');

    add({
        id: 'fat-fire',
        kind: 'guide',
        path: '/guides/fat-fire',
        file: 'guides/fat-fire.html',
        source: 'fat-fire',
        targetQuery: 'fat FIRE calculator',
        title: 'Fat FIRE calculator: a high spending number — FIREcalc',
        description: 'Fat FIRE is the same withdrawal test at a high budget. This example uses $4.5 million and $180,000 a year on the 1975–2024 sample.',
        crumb: 'Fat FIRE',
        eyebrow: 'High budget',
        h1: 'Fat FIRE: does a high budget change the test?',
        lede: `Fat FIRE is a large annual spending number, so the portfolio has to be large too. $180,000 is 4% of $4,500,000. The percentage test is the same one a lean plan uses. On a 40-year horizon, ${histRet(fatR)} Shuffled years, seed ${ctx.SEED}: ${shufRet(fatRs)}`,
        primary: ctx.link('retirement', 'fatRet'),
        links: [
            { href: ctx.link('retirement', 'fatRet'), label: 'Open the $180,000 example' },
            { href: ctx.link('retirement', 'fatRetShuf'), label: 'Same plan, shuffled years' },
            { href: ctx.link('accumulation', 'fatSave'), label: 'Years to reach $4.5 million', ghost: true }
        ],
        hint: 'Age 51 on the withdrawal link is the age this savings example’s median path arrives. The success count does not use Social Security, so the age field is a label for the 40-year span.',
        related: ['lean-fire', 'fire-number', 'safe-withdrawal-rate', 'four-percent-rule'],
        faqs: [
            { q: 'Is fat FIRE a different formula?', a: 'No. It is a higher spending number divided by the withdrawal rate you want to test. Four percent of $4.5 million is $180,000. Four percent of $800,000 is $32,000. The engine treats them the same way.' },
            { q: 'Why can a high budget still show a high success count?', a: 'Because the portfolio is scaled to the spending. A 4% withdrawal on a large balance is still 4%. What changes is whether you can save the larger balance, and whether taxes make the draw bigger than 4%.' },
            { q: 'Does this include a 15% tax?', a: 'No. The tax rate is 0% so the portfolio draw stays at $180,000. A simple tax rate grosses spending up by dividing by 1 minus the rate. At 15% the draw would be larger than 4%.' },
            { q: 'How long did the savings example take?', a: `On seed ${ctx.SEED}, the median path takes ${fatS.median} years. The faster 10% are there by ${fatS.p10} years. The slower 10% take at least ${fatS.p90} years.` }
        ],
        body: `
            <p>Fat FIRE is the community name for retiring on a spending level that is high by ordinary standards: travel, a costly city, help around the house. None of that is a field in the calculator. You type the dollars. If those dollars are 4% of the portfolio, you are running a 4% test, whatever you call it.</p>
            <h2>Saving toward $4.5 million</h2>
            <p>Age 42, $1,500,000 already invested, $320,000 of income, $180,000 of spending. The gap is $140,000 a year. Real raises are 1%. The goal is $4,500,000 in today’s dollars, which is 25× the spending. Stocks are 70%.</p>
            ${facts([['Age', '42'], ['Invested', ctx.money(1500000)], ['Saved each year', ctx.money(140000)], ['Goal', ctx.money(4500000)], ['Stocks', '70%'], ['Real raises', '1%']])}
            <p>${shufSave(ctx, fatS)} ${histSave(fatH)} Most of this sketch is the balance that is already there. The contribution still matters, and so does which years the path draws.</p>
            <h2>Spending $180,000 for 40 years</h2>
            <p>The withdrawal link starts at age ${51}, with the $4,500,000 already in hand, and runs 40 years. Stocks 60%, Treasuries 40%, tax 0%, Social Security off, spending raised with inflation. ${sampleNote(fatR.n).replace('A retirement of this length', 'A 40-year retirement')} ${histRet(fatR)} ${shufRet(fatRs)} The earliest shuffled failure lasted ${fatRs.earliest} years. Eleven historical windows that all begin in 1975–1985 are not the late-1960s retirements in the published 4% studies. The <a href="/guides/four-percent-rule">4% rule page</a> says the same thing about the smaller textbook case.</p>
            <p class="callout">A fat plan is fragile in the savings phase if the income that funds the $140,000 gap stops. It is fragile in retirement if spending rises above the figure you typed, or if taxes turn a 4% draw into something larger. Change one field on the open calculator and read the new count. This is an illustration, not advice.</p>
            <h2>Questions people ask next</h2>`
    });

    const barOff = ctx.R('barOff');
    const barOffS = ctx.R('barOffShuf');
    const barOn = ctx.R('barOn');
    const barOnS = ctx.R('barOnShuf');
    const barFails = barOff.windows.filter(row => row.out);

    add({
        id: 'barista-fire',
        kind: 'guide',
        path: '/guides/barista-fire',
        file: 'guides/barista-fire.html',
        source: 'barista-fire',
        targetQuery: 'barista FIRE calculator',
        title: 'Barista FIRE calculator: part-time pay and a portfolio — FIREcalc',
        description: 'See a $700,000 portfolio and $48,000 of spending with and without $1,500 a month of part-time income, on 1975–2024 returns.',
        crumb: 'Barista FIRE',
        eyebrow: 'Part-time income',
        h1: 'Barista FIRE: what does part-time pay actually cover?',
        lede: `Barista FIRE means the portfolio does not pay the whole budget. A part-time job covers the rest. Without that income, this example keeps a balance on ${barOff.successes} of ${barOff.n} historical windows and ${barOffS.successes} of ${barOffS.n.toLocaleString('en-US')} shuffled paths. With $1,500 a month for 15 years, the same plan keeps a balance on ${barOn.successes} of ${barOn.n} windows and ${barOnS.successes} of ${barOnS.n.toLocaleString('en-US')} shuffled paths.`,
        primary: ctx.link('retirement', 'barOn'),
        links: [
            { href: ctx.link('retirement', 'barOn'), label: 'Open the part-time example' },
            { href: ctx.link('retirement', 'barOff'), label: 'Same portfolio, no side income' },
            { href: '/barista-fire-calculator', label: 'Barista FIRE calculator', ghost: true }
        ],
        hint: 'Other income in this tool stays flat in nominal dollars, and this example stops after 15 years. Spending still rises with CPI. There is no barista switch.',
        related: ['coast-fire', 'lean-fire', 'social-security-early-retirement', 'barista-fire-calculator'],
        faqs: [
            { q: 'Where do I enter the part-time job?', a: 'Under Social Security and other income, as other monthly income, with a duration. Leave the spending field as the full budget. Subtracting the job from spending and also entering it as income counts it twice.' },
            { q: 'Does the side income rise with inflation?', a: 'No. Other income and a pension stay flat in nominal dollars. Spending rises with CPI when that box is on. A job whose pay rises would be a larger number than this example uses.' },
            { q: 'Why did two historical windows fail without the job?', a: `The ${barFails.map(row => row.start).join(' and ')} windows ran out of money. $48,000 is 6.9% of $700,000. The part-time pay cuts the first-year portfolio draw to $30,000.` },
            { q: 'Is Coast FIRE the same thing?', a: 'No. Coast FIRE, on this site, is a savings question with new contributions at zero. Barista FIRE is a retirement question: you are already spending, and a job covers part of it. The coast guide shows the zero-contribution check.' }
        ],
        body: `
            <p>The usual barista sketch is a portfolio that is too small for the full budget, plus a job with benefits or a paycheck that covers the gap. FIREcalc has no barista switch. The retirement calculator already has “other income,” with a start that is immediate and a duration you type. That is the field this page uses.</p>
            <h2>One portfolio, two runs</h2>
            <p>Age 45, $700,000, spending $48,000, raised with inflation. Stocks 60%, tax 0%, horizon 45 years, Social Security off. $48,000 is 6.9% of $700,000. ${histRet(barOff)} ${barFails.map(row => `The ${row.start} window ran out in year ${row.years}, at age ${45 + row.years}.`).join(' ')} ${shufRet(barOffS)}</p>
            <p>The second run adds $1,500 a month, $18,000 a year, for 15 years (age 45 through 59). The first-year portfolio draw falls to $30,000, which is 4.3% of $700,000. ${histRet(barOn)} ${shufRet(barOnS)} The job did not make the shuffled paths safe. It moved the count from ${barOffS.successes} of ${barOffS.n.toLocaleString('en-US')} to ${barOnS.successes} of ${barOnS.n.toLocaleString('en-US')}.</p>
            ${facts([['Portfolio', ctx.money(700000)], ['Spending', ctx.money(48000)], ['Side income', '$1,500/mo'], ['Duration', '15 years'], ['Without it', `${barOff.successes} of ${barOff.n}`], ['With it, shuffled', `${barOnS.successes} of ${barOnS.n.toLocaleString('en-US')}`]])}
            <h2>What this model leaves out</h2>
            <ul>
                <li><strong>Inflation on the paycheck.</strong> The $18,000 never rises. The spending number does. Each year the job covers less of the budget, and at age 60 it covers nothing.</li>
                <li><strong>Health insurance from the job.</strong> If the job is how you get coverage, losing it means the spending number has to rise. Put that premium in spending. The engine will not price it.</li>
                <li><strong>A tax on the paycheck.</strong> The tax rate here is 0%. A simple tax rate grosses the spending figure up before other income is subtracted.</li>
            </ul>
            <p class="callout">Type the pay you would actually earn, and the number of years you would actually work. A coast check, with savings at zero and no withdrawals yet, is a different question. It is on the <a href="/guides/coast-fire">Coast FIRE guide</a>.</p>
            <h2>Questions people ask next</h2>`
    });

    const r40s = ctx.S('r40Save');
    const r40h = ctx.S('r40SaveHist');
    const r40 = ctx.R('r40Ret');
    const r40sh = ctx.R('r40RetShuf');
    const r40b = ctx.R('r40Ret35');

    add({
        id: 'retire-at-40',
        kind: 'guide',
        path: '/guides/retire-at-40',
        file: 'guides/retire-at-40.html',
        source: 'retire-at-40',
        targetQuery: 'how much do I need to retire at 40',
        title: 'How much do I need to retire at 40? — FIREcalc',
        description: 'A 4% sketch for $62,000 of spending is $1.55 million, then a 50-year test. This sample has one complete 50-year window. Open the example.',
        crumb: 'Retire at 40',
        eyebrow: 'Age 40',
        h1: 'How much do I need to retire at 40?',
        lede: `For $62,000 a year, a 4% sketch is $1,550,000. That is 25 times spending. The hard part at 40 is the length: a retirement to age 90 is 50 years, and this table has ${r40.n} complete 50-year window. ${histRet(r40)} That single window is 1975–2024. Shuffled years, which redraw the same 50 rows, kept a balance on ${r40sh.successes} of ${r40sh.n.toLocaleString('en-US')} paths.`,
        primary: ctx.link('retirement', 'r40RetShuf'),
        links: [
            { href: ctx.link('retirement', 'r40RetShuf'), label: 'Open the age-40 withdrawal' },
            { href: ctx.link('accumulation', 'r40Save'), label: 'Can this savings rate get there?' },
            { href: ctx.link('retirement', 'r40Ret35'), label: 'Same spending at a 3.5% portfolio', ghost: true }
        ],
        hint: 'The withdrawal button uses shuffled years because one historical window is not a study. The 3.5% button raises the portfolio to $1,771,429 and keeps spending at $62,000.',
        related: ['retire-at-45', 'retire-at-50', 'safe-withdrawal-rate', 'social-security-early-retirement'],
        faqs: [
            { q: 'Why not trust the one historical window?', a: 'It is a single path, 1975 through 2024. It survived on this plan. A success rate needs more than one cohort, and the hardest US start years are before this table.' },
            { q: 'Does the savings example arrive by 40?', a: `On seed ${ctx.SEED}, the median path takes ${r40s.median} years, which is age ${r40s.ageMedian}. The faster 10% are there by ${r40s.p10} years. The slower 10% take at least ${r40s.p90} years.` },
            { q: 'What is the 3.5% portfolio for the same spending?', a: '$62,000 divided by 0.035 is $1,771,429. The shuffled test of that larger portfolio is on the third button. Spending does not change.' },
            { q: 'Where is Social Security?', a: 'Off. Someone retiring at 40 may not claim for more than twenty years, and the benefit itself depends on the earnings record, which this tool does not compute. The Social Security guide shows a later example with the benefit turned on.' }
        ],
        body: `
            <p>Retiring at 40 is two questions. The savings question is whether the portfolio reaches a number while you still have a paycheck. The withdrawal question is whether that number can pay your bills for about half a century. A 30-year 4% study does not answer the second one.</p>
            <h2>The number, then the 50-year test</h2>
            <p>$62,000 × 25 = $1,550,000. Stocks on the withdrawal are 75%, tax is 0%, spending rises with inflation, Social Security is off. ${histRet(r40)} Read that as “the only complete window in the file survived,” not as a success rate. ${shufRet(r40sh)} The earliest shuffled failure ran out in year ${r40sh.earliest}.</p>
            <p>At 3.5%, the portfolio for the same $62,000 is $1,771,429. ${shufRet(r40b)} Moving from 4% to 3.5% meant saving more before 40. It did not change the fact that the historical file contains one 50-year span.</p>
            ${facts([['Spending', ctx.money(62000)], ['4% portfolio', ctx.money(1550000)], ['3.5% portfolio', ctx.money(1771429)], ['Horizon', '50 years'], ['Historical windows', `${r40.successes} of ${r40.n}`], ['Shuffled, 4%', `${r40sh.successes} of ${r40sh.n.toLocaleString('en-US')}`]])}
            <h2>A savings path that is aiming at 40</h2>
            <p>Age 30, $180,000 invested, $125,000 of income, $62,000 of spending, so $63,000 a year is saved. Real raises are 2%. Stocks are 80%. The goal is the 4% portfolio, $1,550,000 in today’s dollars.</p>
            <p>${shufSave(ctx, r40s)} Age ${r40s.ageMedian} is ${r40s.ageMedian - 40} year after 40 on this example. The faster 10% arrive at age ${r40s.ageP10}. The slower 10% are age ${r40s.ageP90} or later. ${histSave(r40h)} If the median is past the birthday you care about, the plan is the savings rate or the spending number, not a different label.</p>
            <p class="callout">Compare this with <a href="/guides/retire-at-45">retiring at 45</a> and <a href="/guides/retire-at-50">retiring at 50</a>, where the historical sample has more than one window. The withdrawal-rate page compares 4%, 3.5%, and 3.25% on a fixed $1 million.</p>
            <h2>Questions people ask next</h2>`
    });

    const r45s = ctx.S('r45Save');
    const r45h = ctx.S('r45SaveHist');
    const r45 = ctx.R('r45Ret');
    const r45sh = ctx.R('r45RetShuf');

    add({
        id: 'retire-at-45',
        kind: 'guide',
        path: '/guides/retire-at-45',
        file: 'guides/retire-at-45.html',
        source: 'retire-at-45',
        targetQuery: 'how much do I need to retire at 45',
        title: 'How much do I need to retire at 45? — FIREcalc',
        description: 'Retiring at 45 on $70,000 a year is a $1.75 million sketch at 4%, then a 45-year withdrawal test on 1975–2024 returns.',
        crumb: 'Retire at 45',
        eyebrow: 'Age 45',
        h1: 'How much do I need to retire at 45?',
        lede: `For $70,000 a year, 25 times spending is $1,750,000. A retirement from 45 to 90 is 45 years. This table has ${r45.n} complete windows of that length. ${histRet(r45)} Shuffled years on the same inputs: ${shufRet(r45sh)}`,
        primary: ctx.link('retirement', 'r45Ret'),
        links: [
            { href: ctx.link('accumulation', 'r45Save'), label: 'Open the savings path to 45' },
            { href: ctx.link('retirement', 'r45Ret'), label: 'Test $1.75 million for 45 years' },
            { href: ctx.link('retirement', 'r45RetShuf'), label: 'Shuffled years', ghost: true }
        ],
        hint: 'The savings example starts at age 34. Its median path reaches $1.75 million at the birthday this page is about. The withdrawal links assume you already have the portfolio.',
        related: ['retire-at-40', 'retire-at-50', 'fire-number', 'sequence-of-returns'],
        faqs: [
            { q: 'How many historical windows is 45 years?', a: `${r45.n} complete windows, 1975–2019 through 1980–2024. That is the whole sample. It is not a full-history study of every US retirement.` },
            { q: 'Does the example savings rate hit 45?', a: `On seed ${ctx.SEED}, the median path takes ${r45s.median} years, age ${r45s.ageMedian}. The faster 10% are there by ${r45s.p10} years. The slower 10% take at least ${r45s.p90} years.` },
            { q: 'Is $1.75 million enough if I spend more than $70,000?', a: 'No. The portfolio is 25 times $70,000. Higher spending is a higher withdrawal rate, or a higher goal. Change the spending field and read the new count.' },
            { q: 'What should I open first, savings or retirement?', a: 'Savings, if you do not have the portfolio yet. Retirement, if you do. A balance that reaches the goal can still run out later. Both links are on this page.' }
        ],
        body: `
            <p>Forty-five is a common early-retirement target because it is far enough from a traditional career to matter, and the saving years from a mid-30s start are still a decade rather than two. The dollars are still spending times a multiple, and the multiple is only as good as the horizon you test.</p>
            <h2>Eleven years of saving, on this example</h2>
            <p>Age 34, $280,000 invested, $140,000 of income, $70,000 of spending. The contribution is $70,000 a year. Real raises are 1%. Stocks are 75%. The goal is $1,750,000 in today’s dollars.</p>
            ${facts([['Age now', '34'], ['Invested', ctx.money(280000)], ['Saved each year', ctx.money(70000)], ['Goal', ctx.money(1750000)], ['Stocks', '75%'], ['Median age', String(r45s.ageMedian)]])}
            <p>${shufSave(ctx, r45s)} The median lands on age 45. The slower 10% land at age ${r45s.ageP90} or later, which is not 45. ${histSave(r45h)} Plan closer to the slower figure if missing the birthday would break the plan.</p>
            <h2>Then 45 years of withdrawals</h2>
            <p>Age 45, the $1,750,000 in hand, $70,000 of spending, 70% stocks, 0% tax, inflation adjustments on, Social Security off. ${histRet(r45)} ${shufRet(r45sh)} Six surviving windows from the late 1970s and 1980 are a real result of this file. They are a poor stand-in for a retirement that starts in a crash this table does not contain. The <a href="/guides/sequence-of-returns">sequence of returns</a> page shows how much the ending balance moves even when every window survives.</p>
            <p class="callout">If you want the same spending with a lower rate, divide $70,000 by 0.035. That portfolio is $2,000,000. This page does not run that larger balance. The <a href="/guides/safe-withdrawal-rate">withdrawal-rate guide</a> compares the rates on $1 million so the only change is the spending.</p>
            <h2>Questions people ask next</h2>`
    });

    const r50s = ctx.S('r50Save');
    const r50h = ctx.S('r50SaveHist');
    const r50 = ctx.R('r50Ret');
    const r50sh = ctx.R('r50RetShuf');
    const r5035 = ctx.R('r50Ret35');

    add({
        id: 'retire-at-50',
        kind: 'guide',
        path: '/guides/retire-at-50',
        file: 'guides/retire-at-50.html',
        source: 'retire-at-50',
        targetQuery: 'how much do I need to retire at 50',
        title: 'How much do I need to retire at 50? — FIREcalc',
        description: 'Retiring at 50 on $80,000 a year is a $2 million sketch at 4%, with a 40-year horizon. See the shuffled paths and the historical windows.',
        crumb: 'Retire at 50',
        eyebrow: 'Age 50',
        h1: 'How much do I need to retire at 50?',
        lede: `For $80,000 a year, a 4% sketch is $2,000,000. From 50 to 90 is 40 years, and this table has ${r50.n} complete 40-year windows. ${histRet(r50)} ${shufRet(r50sh)} Spending $70,000 instead, a 3.5% draw on the same portfolio, kept a balance on ${r5035.successes} of ${r5035.n.toLocaleString('en-US')} shuffled paths.`,
        primary: ctx.link('retirement', 'r50Ret'),
        links: [
            { href: ctx.link('accumulation', 'r50Save'), label: 'Open the path to $2 million' },
            { href: ctx.link('retirement', 'r50Ret'), label: 'Test the 40-year retirement' },
            { href: ctx.link('retirement', 'r50Ret35'), label: 'Spend $70,000 instead', ghost: true }
        ],
        hint: 'The savings example is age 40 with $520,000 already invested. The median path reaches the goal at 50. The $70,000 button keeps the portfolio and lowers spending.',
        related: ['retire-at-45', 'retire-at-40', 'safe-withdrawal-rate', 'market-crash-at-retirement'],
        faqs: [
            { q: 'How is retiring at 50 different from retiring at 65 in this tool?', a: `The horizon. A 30-year retirement has 21 complete windows here. A 40-year retirement has ${r50.n}. The extra decade is the part a standard 4% write-up does not cover.` },
            { q: 'Does this savings example make it by 50?', a: `On seed ${ctx.SEED}, the median path takes ${r50s.median} years, age ${r50s.ageMedian}. The faster 10% are there by ${r50s.p10} years. The slower 10% take at least ${r50s.p90} years.` },
            { q: 'What does spending $70,000 change?', a: `It is 3.5% of $2 million instead of 4%. On the shuffled paths, the count moves from ${r50sh.successes} of ${r50sh.n.toLocaleString('en-US')} to ${r5035.successes} of ${r5035.n.toLocaleString('en-US')}.` },
            { q: 'Should I turn Social Security on?', a: 'If you want the success count to include a benefit, yes, and then say so when you quote the result. This page leaves it off. Someone retiring at 50 still has a long gap before a claim at 67.' }
        ],
        body: `
            <p>Age 50 is often the first birthday where a household both has a large portfolio and still faces a retirement longer than the 30-year studies. The calculator can hold that horizon. It cannot invent earnings history, a pension, or a health premium. Those have to be inside the numbers you type, or left off on purpose.</p>
            <h2>From 40 to the $2 million goal</h2>
            <p>Age 40, $520,000 invested, $150,000 of income, $80,000 of spending. The gap is $70,000 a year. Real raises are 1%. Stocks are 70%. The goal is $2,000,000 in today’s dollars, 25× spending.</p>
            <p>${shufSave(ctx, r50s)} The median age is 50. The slower 10% are 53 or older. ${histSave(r50h)}</p>
            <h2>A 40-year retirement at 4%, and at a lower spend</h2>
            <p>The withdrawal example is age 50, $2,000,000, $80,000, 60% stocks, 0% tax, inflation on, Social Security off. ${histRet(r50)} ${shufRet(r50sh)} The earliest shuffled failure lasted ${r50sh.earliest} years.</p>
            <p>The third button keeps $2,000,000 and spends $70,000. That is 3.5%. ${shufRet(r5035)} Same history, same mix, lower bills. If your spending cannot fall, the matching move is a larger portfolio, which is the savings question again.</p>
            ${facts([['4% spending', ctx.money(80000)], ['3.5% spending', ctx.money(70000)], ['Portfolio', ctx.money(2000000)], ['Windows', `${r50.n}`], ['Shuffled, 4%', `${r50sh.successes} of 1,000`], ['Shuffled, 3.5%', `${r5035.successes} of 1,000`]])}
            <p class="callout">The <a href="/guides/market-crash-at-retirement">crash page</a> replays 2000, 2008, and 2022 on a 4% plan so you can see the first years, not only the final count. None of this is advice.</p>
            <h2>Questions people ask next</h2>`
    });

    const seq = ctx.R('seq');
    const seqS = ctx.R('seqShuf');
    const seqRows = seq.windows;
    const seqLow = seqRows.reduce((a, b) => a.endReal < b.endReal ? a : b);
    const seqHigh = seqRows.reduce((a, b) => a.endReal > b.endReal ? a : b);
    const seqTable = `<table class="year-table"><thead><tr><th>Start</th><th>Low, today’s $</th><th>Low year</th><th>Ending, today’s $</th></tr></thead><tbody>${seqRows.map(row => `<tr><td>${row.start}</td><td>${row.lowPct}%</td><td>${row.lowYear}</td><td>${ctx.money(row.endReal)}</td></tr>`).join('')}</tbody></table>`;

    add({
        id: 'sequence-of-returns',
        kind: 'guide',
        path: '/guides/sequence-of-returns',
        file: 'guides/sequence-of-returns.html',
        source: 'sequence-of-returns',
        targetQuery: 'sequence of returns risk retirement',
        title: 'Sequence of returns risk in early retirement — FIREcalc',
        description: 'The same $1 million and $40,000 plan finishes in very different places depending on the start year. See every 40-year window from 1975 to 1985.',
        crumb: 'Sequence of returns',
        eyebrow: 'Order of returns',
        h1: 'Sequence of returns risk: same plan, different start year',
        lede: `Sequence of returns risk is the damage from bad returns early, while you are withdrawing, even if the average return over the whole retirement would have been fine. On this $1 million, $40,000, 60/40 plan, all ${seq.n} complete 40-year windows survived. The ${seqLow.start} window finished at ${ctx.money(seqLow.endReal)} in today’s dollars. The ${seqHigh.start} window finished at ${ctx.money(seqHigh.endReal)}.`,
        primary: ctx.link('retirement', 'seq'),
        links: [
            { href: ctx.link('retirement', 'seq'), label: 'Open the historical windows' },
            { href: ctx.link('retirement', 'seqShuf'), label: 'Shuffle the same years' },
            { href: '/guides/market-crash-at-retirement', label: 'Replay 2000, 2008, and 2022', ghost: true }
        ],
        hint: 'Historical cycles mode walks each start year in order. Shuffled years pull each year independently, which destroys the sequence on purpose. Use both.',
        related: ['market-crash-at-retirement', 'four-percent-rule', 'safe-withdrawal-rate', 'retire-at-50'],
        faqs: [
            { q: 'Did anyone run out of money?', a: `Not in these ${seq.n} historical windows. ${shufRet(seqS)} Survival is not the same as an ending balance. The endings on this page differ by millions of today’s dollars.` },
            { q: 'Why is the 1977 start the painful one here?', a: `It is the complete 40-year window with the lowest ending balance in today’s dollars, ${ctx.money(seqLow.endReal)}, and its purchasing power fell to ${seqLow.lowPct}% of the start in ${seqLow.lowYear}. The 1982 start never fell below the starting balance.` },
            { q: 'Is this the famous 1966 retiree?', a: 'No. The table starts in 1975. A 1966 or 1973–74 retirement is not a window here. The spread you see is inside the years the file actually has.' },
            { q: 'What should I do with the gap between endings?', a: 'Treat the worse window as information about order, not as a forecast of your retirement. Spending, the stock share, and a lower withdrawal rate move the whole set. Change one of them in the open calculator.' }
        ],
        body: `
            <p>Two retirees can earn the same average return and end in different places if one of them gets the bad years first. Withdrawals turn a temporary loss into a permanent one, because you sell shares while prices are down and those shares are not there for the recovery. That is the sequence problem. A shuffled-year success rate, which draws each year independently, is a useful stress test and a bad picture of this particular risk.</p>
            <h2>Eleven real 40-year sequences</h2>
            <p>Portfolio $1,000,000. First-year spending $40,000, then raised with CPI. Stocks 60%, 10-year Treasuries 40%. Tax 0%. Social Security off. Horizon 40 years. ${histRet(seq)} The start years that fit are 1975 through 1985.</p>
            ${facts([['Portfolio', ctx.money(1000000)], ['Spending', ctx.money(40000)], ['Mix', '60 / 40'], ['Lowest ending', ctx.money(seqLow.endReal)], ['Highest ending', ctx.money(seqHigh.endReal)], ['Shuffled', `${seqS.successes} of 1,000`]])}
            <p>The ${seqLow.start} window is the low ending: ${ctx.money(seqLow.endReal)} in today’s dollars, after a trough of ${seqLow.lowPct}% of the starting balance in ${seqLow.lowYear}. The ${seqHigh.start} window finished at ${ctx.money(seqHigh.endReal)}, and its lowest point was ${seqHigh.lowPct}% of the start. Both paid the same $40,000 bills. The order of the years did the rest. Ending balances are purchasing power, portfolio divided by cumulative CPI, not a nominal scoreboard.</p>
            ${seqTable}
            <p>${shufRet(seqS)} Those paths are not the rows above. Each shuffled year is an independent draw, so a bad year is not followed by the year that actually followed it.</p>
            <p class="callout">The named stress packs on the <a href="/guides/market-crash-at-retirement">crash page</a> are one path each, including stretches shorter than 40 years. They answer “what did this specific bad start do,” which is the sequence question in a single window.</p>
            <h2>Questions people ask next</h2>`
    });

    const tax0 = ctx.R('tax0');
    const tax12 = ctx.R('tax12');
    const tax22 = ctx.R('tax22');
    const tax0h = ctx.R('tax0Hist');
    const tax12h = ctx.R('tax12Hist');
    const tax22h = ctx.R('tax22Hist');
    const gross12 = Math.round(40000 / 0.88);
    const gross22 = Math.round(40000 / 0.78);

    add({
        id: 'roth-conversion-ladder',
        kind: 'guide',
        path: '/guides/roth-conversion-ladder',
        file: 'guides/roth-conversion-ladder.html',
        source: 'roth-conversion-ladder',
        targetQuery: 'Roth conversion ladder',
        title: 'Roth conversion ladder basics for early retirement — FIREcalc',
        description: 'How a Roth conversion ladder uses the five-year rule, and what FIREcalc can test. The calculator does not track IRA accounts, clocks, or the 10% additional tax.',
        crumb: 'Roth conversion ladder',
        eyebrow: 'Accounts and tax',
        h1: 'Roth conversion ladder: the rule, and what this calculator can test',
        lede: `A Roth conversion ladder is a way some early retirees get at traditional IRA money before age 59½: convert a slice each year, pay income tax on the conversion, and withdraw that slice after its own five-year period. FIREcalc does not track accounts, conversion years, or the 10% additional tax. It can show what happens when the portfolio also pays a simple tax on the spending.`,
        primary: ctx.link('retirement', 'tax0'),
        links: [
            { href: ctx.link('retirement', 'tax0'), label: 'Open $40,000 with 0% tax' },
            { href: ctx.link('retirement', 'tax12'), label: 'Same plan at a 12% simple rate' },
            { href: ctx.link('retirement', 'tax22'), label: 'Same plan at 22%', ghost: true }
        ],
        hint: 'A 12% or 22% rate is a typed stress, not the tax a real conversion would owe. Simple mode divides spending by 1 minus the rate. It is not a bracket calculation and not a ladder.',
        related: ['four-percent-rule', 'safe-withdrawal-rate', 'social-security-early-retirement', 'retiring-early-with-kids'],
        faqs: [
            { q: 'Does FIREcalc run a Roth conversion ladder?', a: 'No. It does not keep a traditional balance and a Roth balance, it does not age a five-year clock, and the early-withdrawal penalty is not in the engine. The counts below are a flat tax on spending.' },
            { q: 'What is the five-year rule on a conversion?', a: 'IRS Publication 590-B says a separate five-year period applies to each conversion. Withdrawing the taxable part of that conversion inside the period can bring the 10% additional tax if you are under 59½. That clock is not the same five-year period that decides whether a distribution is qualified.' },
            { q: 'What order does a Roth distribution come out in?', a: 'Publication 590-B’s ordering rules for a nonqualified distribution are regular contributions first, then conversions and rollovers first-in first-out (taxable portion of each conversion first), then earnings.' },
            { q: 'Why did a 22% rate fail more often?', a: `Because the portfolio draw rose from $40,000 to ${ctx.money(gross22)}. On the shuffled paths the count moved from ${tax0.successes} of 1,000 to ${tax22.successes} of 1,000. That is the cost of paying tax from the portfolio in this simple model, not a computed ladder.` }
        ],
        body: `
            <p>Money in a traditional IRA is generally taxed when it comes out. A distribution before age 59½ is also generally subject to a 10% additional tax unless an exception applies. A conversion to a Roth IRA moves the money, and the amount you convert is included in income for that year. The planning habit called a ladder is to convert about one year of future spending each year, pay that income tax, and spend the converted dollars after the conversion’s own five-year period, instead of taking a penalized traditional withdrawal.</p>
            <h2>The two five-year rules</h2>
            <p><a href="https://www.irs.gov/publications/p590b">IRS Publication 590-B</a> describes both clocks. A distribution is qualified, and earnings can come out tax-free, only after a five-year period that starts with the first Roth contribution and only if you are 59½, disabled, deceased, or using the first-home exception. Separately, each conversion has its own five-year period, starting on the first day of the tax year of that conversion. Take out the taxable portion of a conversion inside that period, while you are under 59½, and the 10% additional tax can apply to that portion even though you already included the conversion in income. Publication 590-B says these two periods are not necessarily the same.</p>
            <p>The ordering rules in that publication, for a distribution that is not qualified, are: regular contributions, then conversion and rollover contributions oldest first, and within each conversion the taxable portion before the nontaxable portion, then earnings. A ladder spends the conversion layer, not the earnings. This page is a sketch of those public rules, not a tax opinion and not a worksheet for your Form 8606.</p>
            <h2>What the engine can show: tax paid from the portfolio</h2>
            <p>If the tax on a conversion is paid by selling from the same portfolio, the portfolio has to fund spending plus tax. Simple tax mode does a blunt version of that. It divides spending by 1 minus the rate. It does not know that a ladder often converts in a low-income year, and it does not know your bracket. The rates below are stresses you can type, not a computed tax.</p>
            <p>Age 45, $1,000,000, $40,000 of spending, 60% stocks, 40-year horizon, Social Security off. At 0%, the draw is $40,000. ${shufRet(tax0)} ${histRet(tax0h)}</p>
            <p>At a 12% simple rate the draw is ${ctx.money(gross12)}. ${shufRet(tax12)} ${histRet(tax12h)} At 22% the draw is ${ctx.money(gross22)}. ${shufRet(tax22)} ${histRet(tax22h)} The historical windows still all survived. The shuffled paths, which are the wider stress, did not.</p>
            ${facts([['Spending', ctx.money(40000)], ['Draw at 12%', ctx.money(gross12)], ['Draw at 22%', ctx.money(gross22)], ['Shuffled, 0%', `${tax0.successes} of 1,000`], ['Shuffled, 12%', `${tax12.successes} of 1,000`], ['Shuffled, 22%', `${tax22.successes} of 1,000`]])}
            <p class="callout">Detailed tax mode in the calculator uses 2025 federal brackets on a withdrawal. It still does not track a conversion clock, and “optimize withdrawal order” does not change the result, because separate account balances are not tracked. Pay the tax from cash outside the portfolio and this illustration overstates the damage. This is not tax advice.</p>
            <h2>Questions people ask next</h2>`
    });

    const kidS = ctx.S('kidsSave');
    const kidH = ctx.S('kidsSaveHist');
    const kid70 = ctx.R('kids70');
    const kid95 = ctx.R('kids95');
    const kid95ss = ctx.R('kids95ss');
    const kid95h = ctx.R('kids95Hist');

    add({
        id: 'retiring-early-with-kids',
        kind: 'guide',
        path: '/guides/retiring-early-with-kids',
        file: 'guides/retiring-early-with-kids.html',
        source: 'retiring-early-with-kids',
        targetQuery: 'retiring early with kids',
        title: 'Retiring early with kids: spending, 529s, and health coverage — FIREcalc',
        description: 'Fold kids, a college set-aside, and health premiums into one spending number. FIREcalc has no 529 balance and no ACA premium module.',
        crumb: 'Retiring with kids',
        eyebrow: 'Household',
        h1: 'Retiring early with kids',
        lede: `Kids show up in this calculator as spending. There is no per-child field, no 529 balance, and no health-insurance premium. A household that puts a college set-aside and a health premium into the annual number is testing a higher withdrawal. On this example, $70,000 of base spending survived on ${kid70.successes} of ${kid70.n.toLocaleString('en-US')} shuffled paths. $95,000, with $25,000 a year typed on top for those costs, survived on ${kid95.successes} of ${kid95.n.toLocaleString('en-US')}.`,
        primary: ctx.link('retirement', 'kids95'),
        links: [
            { href: ctx.link('retirement', 'kids95'), label: 'Open the $95,000 household' },
            { href: ctx.link('retirement', 'kids70'), label: 'Base spending only, $70,000' },
            { href: ctx.link('retirement', 'kids95ss'), label: 'Add both Social Security benefits', ghost: true }
        ],
        hint: 'The extra $25,000 is an example the household typed, spread across every year of a 40-year retirement. It is not a tuition quote and not an ACA premium. College does not actually last 40 years. This is the conservative way to type a cost the engine cannot turn off later.',
        related: ['fire-calculator-for-families', 'social-security-early-retirement', 'roth-conversion-ladder', 'retire-at-50'],
        faqs: [
            { q: 'Where do the kids go in the form?', a: 'In annual spending. The family guide says the same thing. A 529, a college year, and a child who moves out are not separate inputs.' },
            { q: 'What is a 529 in this model?', a: 'Nothing. IRS Topic 313 describes qualified tuition programs: contributions are not federally deductible, and distributions used for qualified education expenses are not taxed federally. The calculator never sees that account. Spending the retirement portfolio on college means the tuition has to be inside the withdrawal you typed.' },
            { q: 'How do I handle health insurance before Medicare?', a: 'Add the premium you expect to pay to annual spending. The premium tax credit depends on household income, and a Roth conversion can raise that income. This tool does not compute a credit. Medicare eligibility is generally at 65, which leaves a gap if you retire earlier.' },
            { q: 'Did Social Security erase the extra spending?', a: `Not entirely. With both benefits on at 67, the $95,000 plan survived on ${kid95ss.successes} of ${kid95ss.n.toLocaleString('en-US')} shuffled paths, against ${kid95.successes} of ${kid95.n.toLocaleString('en-US')} with the benefits off. The benefits are inputs, not a computed household benefit.` }
        ],
        body: `
            <p>A household retiring while children are still home has a higher bill and a messier one: childcare that ends, a college bill that arrives later, and health coverage that a job used to provide. The engine has one spending number for the whole horizon, raised with inflation every year. It will not drop the college line when the youngest finishes, and it will not price a marketplace plan.</p>
            <h2>Put the temporary costs in the number, and know that you did</h2>
            <p>Two honest ways to type a cost that will not last 40 years: raise spending for the whole retirement, which overstates the later years, or leave it out and keep a separate pile of money, which this calculator will not watch. This example does the first, and labels it.</p>
            <p>The base budget is $70,000. The household then types $12,000 for health premiums and $13,000 as a flat college set-aside. Those two figures are assumptions for the sketch, not published premiums or tuition. The total is $95,000. Portfolio $2,200,000, age 50, 40 years, 60% stocks, tax 0%.</p>
            ${facts([['Base spending', ctx.money(70000)], ['With the set-aside', ctx.money(95000)], ['Portfolio', ctx.money(2200000)], ['Shuffled, $70k', `${kid70.successes} of 1,000`], ['Shuffled, $95k', `${kid95.successes} of 1,000`], ['$95k plus SS', `${kid95ss.successes} of 1,000`]])}
            <p>${shufRet(kid70)} That is the $70,000 run. ${shufRet(kid95)} That is $95,000. ${histRet(kid95h)} Historical windows in this file are a kinder sample than the shuffle. Do not quote 11 of 11 as the reason the extra $25,000 is fine.</p>
            <h2>A 529 and the premium tax credit sit outside the engine</h2>
            <p>A section 529 plan is a separate account. <a href="https://www.irs.gov/taxtopics/tc313">IRS Topic 313</a> is the public description: contributions are not deductible on the federal return, earnings are not taxed while they stay in the program, and a distribution used for qualified education expenses is not taxed federally. If the 529 pays for college, leave the college dollars out of the retirement withdrawal. If it does not, the retirement portfolio is paying, and the spending number has to say so.</p>
            <p>Health coverage from retirement until Medicare is a bill. The federal premium tax credit depends on household income. A conversion that raises income can shrink that credit in the same year. FIREcalc will not estimate either effect. The Social Security Administration tells people who delay a retirement benefit to sign up for Medicare at 65 anyway. The years before that are the gap you type as spending.</p>
            <p>The third button turns on two benefits at 67: $2,100 a month and $1,400 a month, before the tool’s claiming-age factor. At 67 the factor is 1, so those are the amounts that enter the model, and they rise with the CPI series afterward. ${shufRet(kid95ss)} Quote that count as a plan with Social Security inside it. The <a href="/guides/fire-calculator-for-families">family guide</a> makes the same point with a different household.</p>
            <p class="callout">This is a planning sketch, not advice about taxes, insurance, or college savings. Change the $95,000 if your premium or your tuition assumption is different. The result belongs to the number you leave in the form.</p>
            <h2>Questions people ask next</h2>`
    });

    const rates = [0.04, 0.035, 0.0325, 0.03];
    const swrRows = [];
    for (const rate of rates) {
        const withdrawal = Math.round(1000000 * rate);
        const h30 = ctx.swr(withdrawal, 30, 'historical');
        const s30 = ctx.swr(withdrawal, 30, 'shuffled');
        const h40 = ctx.swr(withdrawal, 40, 'historical');
        const s40 = ctx.swr(withdrawal, 40, 'shuffled');
        swrRows.push({ rate, withdrawal, h30, s30, h40, s40 });
    }
    const rateLabel = (rate) => `${(rate * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
    const count = (n) => n.toLocaleString('en-US');
    const swrTable = `<table class="year-table"><thead><tr><th>First-year rate</th><th>Spending</th><th>30-year windows</th><th>30-year shuffled</th><th>40-year windows</th><th>40-year shuffled</th></tr></thead><tbody>${swrRows.map(row => `<tr><td>${rateLabel(row.rate)}</td><td>${ctx.money(row.withdrawal)}</td><td>${row.h30.successes} of ${row.h30.n}</td><td>${count(row.s30.successes)} of 1,000</td><td>${row.h40.successes} of ${row.h40.n}</td><td>${count(row.s40.successes)} of 1,000</td></tr>`).join('')}</tbody></table>`;
    const four30 = swrRows[0];
    const threeHalf40 = swrRows[1];
    const threeQ40 = swrRows[2];

    add({
        id: 'safe-withdrawal-rate',
        kind: 'guide',
        path: '/guides/safe-withdrawal-rate',
        file: 'guides/safe-withdrawal-rate.html',
        source: 'safe-withdrawal-rate',
        targetQuery: 'safe withdrawal rate vs 4% rule',
        title: 'Safe withdrawal rate vs the 4% rule (3.5% and 3.25%) — FIREcalc',
        description: 'Compare 4%, 3.5%, 3.25%, and 3% on the same $1 million portfolio, for 30 and 40 years. This is the 1975–2024 sample, not the full Trinity study.',
        crumb: 'Withdrawal rate',
        eyebrow: 'Spending rate',
        h1: 'Safe withdrawal rate: 4%, 3.5%, and 3.25% on one portfolio',
        lede: `A safe withdrawal rate is the first-year spending, as a share of the portfolio, that you are willing to test with later years raised for inflation. On $1 million and a 60/40 mix, a 4% spend is $40,000. In this 1975–2024 sample, ${four30.h30.successes} of ${four30.h30.n} thirty-year windows survived, and ${four30.s30.successes} of 1,000 shuffled 30-year paths survived. Stretch the horizon to 40 years and the shuffled count is ${four30.s40.successes} of 1,000. This is not a full-history Trinity study.`,
        primary: ctx.link('retirement', null, ctx.swrPlan(40000, 40, 'historical')),
        links: [
            { href: ctx.link('retirement', null, ctx.swrPlan(40000, 40, 'historical')), label: 'Open 4% for 40 years' },
            { href: ctx.link('retirement', null, ctx.swrPlan(35000, 40, 'historical')), label: 'Open 3.5% for 40 years' },
            { href: ctx.link('retirement', null, ctx.swrPlan(32500, 40, 'shuffled')), label: 'Open 3.25%, shuffled', ghost: true }
        ],
        hint: 'Every row is the same $1 million, 60% stocks, 0% tax, inflation on, Social Security off. Only spending and the horizon change. Tax at 0% is what keeps the draw equal to the rate.',
        related: ['four-percent-rule', 'sequence-of-returns', 'fire-number', 'retire-at-40'],
        faqs: [
            { q: 'Is 3.5% safer than 4% here?', a: `On the shuffled paths, yes for this portfolio. At 40 years, 4% survived on ${four30.s40.successes} of 1,000 and 3.5% survived on ${threeHalf40.s40.successes} of 1,000. The historical windows survived at both rates, and those windows omit 1966 and 1973–74.` },
            { q: 'Why do all the historical windows survive?', a: 'Because every complete window in this file starts in 1975 or later. The published 4% research included worse start years than this table has. A perfect historical score here is not a repeat of that research.' },
            { q: 'What is the Trinity study?', a: 'The 1998 paper by Cooley, Hubbard, and Walz, and Bengen’s 1994 paper before it, studied historical US stock and bond cohorts and an inflation-adjusted withdrawal. People summarize that work as the 4% rule for a 30-year retirement. FIREcalc does not rerun their data set.' },
            { q: 'Does a 15% tax still count as 3.5%?', a: 'No. Simple tax grosses the withdrawal up. A rate test on this page uses a 0% tax, or you type a smaller spending number so the pre-tax draw is the rate you meant.' }
        ],
        body: `
            <p>Bengen’s 1994 paper and the Trinity study (Cooley, Hubbard, and Walz, 1998) are why people say “4%.” They looked at historical US retirements, including bad starts in the late 1960s, and an inflation-adjusted withdrawal. A 4% first year, raised with inflation after that, is the figure that work made famous for a 30-year retirement. Early retirees often test 3.5% or 3.25% because their horizon is longer than 30 years and because that older sample is not a forecast.</p>
            <p>FIREcalc can run the arithmetic. It cannot rerun Trinity. The file starts in 1975.</p>
            <h2>One million dollars, four rates, two lengths</h2>
            <p>Stocks 60%, 10-year Treasuries 40%, tax 0%, Social Security off, spending raised with CPI from year two. The 30-year runs use retirement age 65. The 40-year runs use age 50. Age does not change these counts, because no benefit turns on. The horizon does.</p>
            ${swrTable}
            <p>At 3.25%, spending is $32,500. The 40-year shuffled count is ${threeQ40.s40.successes} of 1,000, against ${four30.s40.successes} of 1,000 at 4%. At 3%, spending is $30,000. Read the table across a row before you treat a round number as safe. Then open the button and change the stock share. A different mix is a different result, and the Treasury series is not a total-bond fund. It lost 17.83% in 2022.</p>
            ${facts([['Portfolio', ctx.money(1000000)], ['4%', ctx.money(40000)], ['3.5%', ctx.money(35000)], ['3.25%', ctx.money(32500)], ['30-year windows', String(four30.h30.n)], ['40-year windows', String(four30.h40.n)]])}
            <p class="callout">The <a href="/guides/four-percent-rule">4% rule page</a> uses a 50/50 mix and walks the six named stress packs. This page uses 60/40 and compares rates. Neither one is the Trinity data set. This is an illustration, not advice.</p>
            <h2>Questions people ask next</h2>`
    });

    const fnS = ctx.S('fnSave');
    const fnH = ctx.S('fnSaveHist');
    const fnR = ctx.R('fnRet');
    const fnRs = ctx.R('fnRetShuf');
    const fn35 = ctx.R('fn35');
    const fn35portfolio = Math.round(48000 / 0.035);

    add({
        id: 'fire-number',
        kind: 'guide',
        path: '/guides/fire-number',
        file: 'guides/fire-number.html',
        source: 'fire-number',
        targetQuery: 'FIRE number calculator',
        title: 'FIRE number calculator: 25 times spending, then a test — FIREcalc',
        description: 'A FIRE number is annual spending divided by the withdrawal rate you will test. See $48,000 of spending at 4% and at 3.5%, then the savings path.',
        crumb: 'FIRE number',
        eyebrow: 'The number',
        h1: 'What is my FIRE number?',
        lede: `Your FIRE number is the portfolio that matches a spending level and a withdrawal rate. $48,000 divided by 0.04 is $1,200,000. $48,000 divided by 0.035 is ${ctx.money(fn35portfolio)}. The 4% portfolio, tested for 40 years on this sample, survived on ${fnR.successes} of ${fnR.n} historical windows and ${fnRs.successes} of ${fnRs.n.toLocaleString('en-US')} shuffled paths. The number is the start of the test, not the result.`,
        primary: ctx.link('accumulation', 'fnSave'),
        links: [
            { href: ctx.link('accumulation', 'fnSave'), label: 'Years to reach $1.2 million' },
            { href: ctx.link('retirement', 'fnRet'), label: 'Test $1.2 million for 40 years' },
            { href: '/fire-number-calculator', label: 'FIRE number calculator', ghost: true }
        ],
        hint: 'The savings goal is today’s purchasing power. A nominal balance can pass $1.2 million while purchasing power has not.',
        related: ['fire-number-calculator', 'safe-withdrawal-rate', 'when-can-i-retire', 'retire-on-one-million'],
        faqs: [
            { q: 'Is the FIRE number always 25 times spending?', a: 'Only if you are testing 4%. Twenty-five times spending is 1 divided by 0.04. A 3.5% test is about 28.6 times spending. Pick the rate, then multiply.' },
            { q: 'How long did $1.2 million take in the example?', a: `On seed ${ctx.SEED}, the median path takes ${fnS.median} years, age ${fnS.ageMedian}. The faster 10% are there by ${fnS.p10} years. The slower 10% take at least ${fnS.p90} years.` },
            { q: 'Does hitting the number mean I can retire?', a: `It means the savings goal was reached. The withdrawal test is separate. On the 4% portfolio, ${shufRet(fnRs)}` },
            { q: 'What about the larger 3.5% portfolio?', a: `${ctx.money(fn35portfolio)} with the same $48,000 of spending survived on ${fn35.successes} of ${fn35.n.toLocaleString('en-US')} shuffled 40-year paths. You have to save the extra ${ctx.money(fn35portfolio - 1200000)} first.` }
        ],
        body: `
            <p>The shortcut is famous because the arithmetic is short. Choose the annual spending you need in today’s dollars. Divide by the withdrawal rate you are willing to put through a long test. Four percent gives 25 times spending. Three and a half percent gives a larger pile. Then test the pile, because a multiple copied from a 30-year study is not yet your retirement.</p>
            <h2>Two numbers for $48,000 of spending</h2>
            ${facts([['Spending', ctx.money(48000)], ['At 4%', ctx.money(1200000)], ['At 3.5%', ctx.money(fn35portfolio)], ['40-year windows, 4%', `${fnR.successes} of ${fnR.n}`], ['Shuffled, 4%', `${fnRs.successes} of 1,000`], ['Shuffled, 3.5%', `${fn35.successes} of 1,000`]])}
            <p>${histRet(fnR)} ${shufRet(fnRs)} The 3.5% portfolio is ${ctx.money(fn35portfolio)}, and spending stays $48,000, so the rate is the only change. ${shufRet(fn35)} Both tests use 60% stocks, 0% tax, inflation adjustments, Social Security off, and a 40-year horizon. ${sampleNote(fnR.n).replace('A retirement of this length', 'A 40-year retirement')}</p>
            <h2>How long the 4% number took to save</h2>
            <p>Age 36, $160,000 invested, $115,000 of income, $67,000 of spending. The gap is $48,000 a year, which happens to equal the retirement budget and is not the same thing as the withdrawal. Real raises are 2%. Stocks are 75%. The goal is $1,200,000 in today’s dollars.</p>
            <p>${shufSave(ctx, fnS)} ${histSave(fnH)} Open the retirement link when you want the success count, not another year count. The <a href="/fire-number-calculator">calculator page</a> starts from the same pair of examples.</p>
            <p class="callout">Taxes, a pension, and Social Security all change the portfolio you need. Leave them off and the number is a portfolio-only sketch. Turn them on and say that you did. The <a href="/guides/when-can-i-retire">when-can-I-retire guide</a> is the same savings question with a different household.</p>
            <h2>Questions people ask next</h2>`
    });

    const ssOff = ctx.R('ssOff');
    const ss62 = ctx.R('ss62');
    const ss67 = ctx.R('ss67');
    const ss70 = ctx.R('ss70');
    const ssH = ctx.R('ssOffHist');
    const b62 = ctx.claim(2000, 62);
    const b67 = ctx.claim(2000, 67);
    const b70 = ctx.claim(2000, 70);

    add({
        id: 'social-security-early-retirement',
        kind: 'guide',
        path: '/guides/social-security-early-retirement',
        file: 'guides/social-security-early-retirement.html',
        source: 'social-security-early-retirement',
        targetQuery: 'Social Security and early retirement',
        title: 'Social Security and early retirement — FIREcalc',
        description: 'Early retirement spends years with no Social Security check. Compare claiming at 62, 67, and 70 on one $900,000 example. The benefit stays off until you turn it on.',
        crumb: 'Social Security',
        eyebrow: 'Claiming age',
        h1: 'Social Security and early retirement',
        lede: `Retiring at 55 means twelve years before a claim at 67, and the portfolio pays the whole bill until then. On this example the benefit is an input of $2,000 a month at full retirement age, not a computed benefit. With Social Security off, ${shufRet(ssOff)} Claiming at 62, 67, and 70 landed on ${ss62.successes}, ${ss67.successes}, and ${ss70.successes} of 1,000 shuffled paths. They are close to each other, and all three are well above the run with the benefit off.`,
        primary: ctx.link('retirement', 'ss67'),
        links: [
            { href: ctx.link('retirement', 'ss67'), label: 'Open a claim at 67' },
            { href: ctx.link('retirement', 'ss62'), label: 'Claim at 62' },
            { href: ctx.link('retirement', 'ss70'), label: 'Claim at 70', ghost: true }
        ],
        hint: 'The $2,000 is what you would type as the full-retirement-age benefit. The tool multiplies by 0.70 at 62 and by 1.24 at 70. It does not compute a primary insurance amount, and it does not apply the earnings test.',
        related: ['retire-at-50', 'retire-at-40', 'retiring-early-with-kids', 'four-percent-rule'],
        faqs: [
            { q: 'Are 62, 67, and 70 very different on this plan?', a: `Not on the survival count. Shuffled paths: ${ss62.successes} of 1,000 at 62, ${ss67.successes} of 1,000 at 67, and ${ss70.successes} of 1,000 at 70. Off, the count is ${ssOff.successes} of 1,000. A different portfolio could separate the claiming ages more.` },
            { q: 'Where do 70%, 100%, and 124% come from?', a: 'The Social Security Administration’s early-claim reduction and delayed retirement credits, for a full retirement age of 67. Claiming at 62 is a 30% reduction. Each year of delay after full retirement age adds 8%, up to age 70, which is 124%. FIREcalc uses those three factors and does not model months in between.' },
            { q: 'Does the check start at retirement?', a: 'No. The model pays nothing until the claiming age. From 55 to 62 this example has no Social Security income at all, even on the age-62 button.' },
            { q: 'Is the cost-of-living adjustment the real Social Security COLA?', a: 'No. Once the benefit has started, this tool raises it with the CPI rate on that year’s market row. That is not the Social Security Administration’s COLA formula.' }
        ],
        body: `
            <p>An early retirement and a Social Security claim are different dates. The portfolio covers every year before the claim, and a smaller or larger check afterward depending on the age you pick. The calculator will not estimate your benefit from earnings. You type the monthly amount at full retirement age. If you leave the box off, the success count is the portfolio alone, which is what the other guides on this site do unless they say otherwise.</p>
            <h2>The factors this tool actually uses</h2>
            <p>For someone whose full retirement age is 67, the <a href="https://www.ssa.gov/benefits/retirement/planner/agereduction.html">Social Security Administration’s age-reduction table</a> shows a benefit at 62 of 70% of the full amount. Delayed retirement credits for people born in 1943 or later are 8% a year, and the <a href="https://www.ssa.gov/benefits/retirement/planner/1960-delay.html">age-70 table for a full retirement age of 67</a> shows 124%. FIREcalc stores 0.70, 1.00, and 1.24. A typed $2,000 at full retirement age becomes ${ctx.money(b62)} a month at 62, ${ctx.money(b67)} at 67, and ${ctx.money(b70)} at 70. Annual figures: ${ctx.money(b62 * 12)}, ${ctx.money(b67 * 12)}, and ${ctx.money(b70 * 12)}.</p>
            <h2>One plan, four switches</h2>
            <p>Age 55, $900,000, spending $52,000, 55% stocks, tax 0%, horizon 35 years (to age 90). The benefit field is $2,000, used only when the box is on.</p>
            ${facts([['Off', `${ssOff.successes} of 1,000`], ['Claim at 62', `${ss62.successes} of 1,000`], ['Claim at 67', `${ss67.successes} of 1,000`], ['Claim at 70', `${ss70.successes} of 1,000`], ['Historical, off', `${ssH.successes} of ${ssH.n}`], ['Monthly at 62', ctx.money(b62)]])}
            <p>${shufRet(ssOff)} That is the gap with no benefit at all. ${histRet(ssH)} The historical file is ${ssH.n} complete 35-year windows, and they all survived even with the benefit off, which is another reason not to quote this sample as a full history.</p>
            <p>Turning the benefit on moved the shuffled count into the mid-900s at all three claiming ages. On this particular portfolio the three ages did not separate by much: 62 was ${ss62.successes} of 1,000, 67 was ${ss67.successes} of 1,000, and 70 was ${ss70.successes} of 1,000. Waiting until 70 pays a larger check and leaves the portfolio alone for eight more years than a claim at 62. On these paths, that trade was close. It is not a finding that one claiming age is right. The earnings test, spousal benefits, and taxation of benefits are not in the model. Social Security taxability in detailed tax mode uses married-filing-jointly thresholds even if you pick single.</p>
            <p class="callout">Type your own full-retirement-age estimate. The $2,000 figure is an example input, not an average benefit. SSA’s planner is the place to estimate the check. This page only shows what the calculator does with a number you give it.</p>
            <h2>Questions people ask next</h2>`
    });

    const crashH = ctx.R('crash');
    const crashS = ctx.R('crashShuf');
    const packs = ctx.packs('crash');
    const packById = Object.fromEntries(packs.map(pack => [pack.id, pack]));
    const y2000 = ctx.mix(2000);
    const y2008 = ctx.mix(2008);
    const y2022 = ctx.mix(2022);
    const packLine = (id) => {
        const pack = packById[id];
        const endWord = pack.verdict === 'ahead' ? `finished at ${pack.endPct}% of the starting balance, ahead in today’s dollars` : `finished at ${pack.endPct}% of the starting balance, smaller in today’s dollars`;
        return `<li><strong>${pack.name}, ${pack.start}–${pack.end}, ${pack.years} years.</strong> The path survived. Purchasing power fell to ${pack.lowPct}% of the start in ${pack.lowYear}, and the path ${endWord}. <a href="${ctx.link('retirement', 'crash', { pack: id })}">Open it</a>.</li>`;
    };

    add({
        id: 'market-crash-at-retirement',
        kind: 'guide',
        path: '/guides/market-crash-at-retirement',
        file: 'guides/market-crash-at-retirement.html',
        source: 'market-crash-at-retirement',
        targetQuery: 'what if the market crashes the year I retire',
        title: 'What if the market crashes the year I retire? — FIREcalc',
        description: 'Replay 2000, 2008, and 2022 on one 4% retirement plan. A stress pack is one real path inside 1975–2024, not a success rate.',
        crumb: 'A crash in year one',
        eyebrow: 'Bad first years',
        h1: 'What if the market crashes the year I retire?',
        lede: `A crash in the first year hurts because you withdraw while prices are down. On a 60/40 mix in this table, 2008 was a −14.16% portfolio year and 2022 was −17.96%. The year 2000 was not: Treasuries rose enough that the same mix was up 1.20%, and the damage came in the years after. None of the six named stress packs ran out of money on the $1.2 million, $48,000 plan below. Several of them are shorter than 30 years, so “did not run out” is not a 30-year verdict.`,
        primary: ctx.link('retirement', 'crash'),
        links: [
            { href: ctx.link('retirement', 'crash', { pack: 'gfc' }), label: 'Open the 2008 path' },
            { href: ctx.link('retirement', 'crash', { pack: 'dotcom' }), label: 'Open 2000–2024' },
            { href: ctx.link('retirement', 'crash', { pack: 'rate-shock-22' }), label: 'Open 2022', ghost: true }
        ],
        hint: 'Each button carries this plan’s inputs plus one pack. A pack replays one real stretch, in order, and stops at 2024 if the stretch is shorter than the 30-year horizon.',
        related: ['sequence-of-returns', 'four-percent-rule', 'safe-withdrawal-rate', 'retire-at-50'],
        faqs: [
            { q: 'Did the 2008 path run out of money?', a: `No, inside the years the file has. The GFC pack is ${packById.gfc.start}–${packById.gfc.end}, ${packById.gfc.years} years. The balance fell to ${packById.gfc.lowPct}% of the start in ${packById.gfc.lowYear} and finished at ${packById.gfc.endPct}% of the start. Seventeen years is not a full retirement.` },
            { q: 'Was 2000 a crash for a 60/40 portfolio?', a: `Not in year one. Stocks were ${signedPct(y2000.stocks)} and 10-year Treasuries were ${signedPct(y2000.bonds)}, so the mix was ${signedPct(y2000.mix)}. The pack still finished smaller than it started, at ${packById.dotcom.endPct}% of the start, with a low of ${packById.dotcom.lowPct}% in ${packById.dotcom.lowYear}.` },
            { q: 'Why was 2022 different?', a: `Stocks and Treasuries fell together: ${signedPct(y2022.stocks)} and ${signedPct(y2022.bonds)}. The 60/40 mix was ${signedPct(y2022.mix)}. The pack is only three years long, ${packById['rate-shock-22'].start}–${packById['rate-shock-22'].end}.` },
            { q: 'What about a full 30-year success rate?', a: `${histRet(crashH)} ${shufRet(crashS)} The packs are single paths. The success counts are the other statistic. Neither one includes 1966 or 1973–74.` }
        ],
        body: `
            <p>The year you retire gets more attention than it deserves as a single number, and less attention than it deserves as a sequence. One down year does not decide a 30-year retirement. It does force a withdrawal at bad prices, and the following years decide whether that bite heals. This page replays the bad stretches the file actually contains.</p>
            <h2>The plan the packs use</h2>
            <p>Age 55, $1,200,000, spending $48,000, which is 4%. Stocks 60%, 10-year Treasuries 40%, tax 0%, inflation on, Social Security off, horizon 30 years when the pack is long enough. ${histRet(crashH)} ${shufRet(crashS)}</p>
            ${facts([['Portfolio', ctx.money(1200000)], ['Spending', ctx.money(48000)], ['2008 mix', signedPct(y2008.mix)], ['2022 mix', signedPct(y2022.mix)], ['2000 mix', signedPct(y2000.mix)], ['Shuffled', `${crashS.successes} of 1,000`]])}
            <p>In 2008 the table’s stocks were ${signedPct(y2008.stocks)} and Treasuries were ${signedPct(y2008.bonds)}. The 60/40 mix was ${signedPct(y2008.mix)}. In 2022 stocks were ${signedPct(y2022.stocks)} and Treasuries were ${signedPct(y2022.bonds)}, so the mix was ${signedPct(y2022.mix)}. Bonds did not cushion that year. In 2000 stocks were ${signedPct(y2000.stocks)} and Treasuries were ${signedPct(y2000.bonds)}, so the mix was ${signedPct(y2000.mix)}. Calling 2000 a first-year crash is wrong for this mix. Calling the following decade fine is also wrong, which is why the pack exists.</p>
            <h2>The six packs on this plan</h2>
            <ul>
                ${packLine('dotcom')}
                ${packLine('gfc')}
                ${packLine('rate-shock-22')}
                ${packLine('stagflation')}
                ${packLine('rate-wall-81')}
                ${packLine('bond-rout-94')}
            </ul>
            <p>A challenge link such as <a href="/?pack=gfc">/?pack=gfc</a> names the pack only. The browser then uses whatever plan is already saved on that device. The buttons above pin this page’s inputs so the path is the one described here. The <a href="/guides/sequence-of-returns">sequence page</a> shows the same idea across every complete 40-year window, not only the named villains.</p>
            <p class="callout">Surviving a pack that ends in 2024 is not evidence about a retirement that still has years to go. The dot-com pack is 25 years. The GFC pack is 17. The 2022 pack is 3. This is a planning sketch, not advice.</p>
            <h2>Questions people ask next</h2>`
    });

    const coast = ctx.S('coast');
    const coastH = ctx.S('coastHist');
    add({
        id: 'coast-fire-calculator',
        kind: 'landing',
        path: '/coast-fire-calculator',
        file: 'coast-fire-calculator.html',
        source: 'coast-fire-calculator',
        targetQuery: 'coast FIRE calculator',
        title: 'Coast FIRE calculator — FIREcalc',
        description: 'Check Coast FIRE by setting new savings to zero. FIREcalc does not solve for a coast number. Open a $450,000 example and edit the balance.',
        crumb: 'Coast FIRE calculator',
        eyebrow: 'Calculator',
        h1: 'Coast FIRE calculator',
        lede: `Coast FIRE means the portfolio you already have can reach your number with no new savings. This calculator does that check by setting income equal to spending and real raises to 0%. It does not solve for the balance you would need today. On the example, seed ${ctx.SEED}, the median path takes ${coast.median} years.`,
        primary: ctx.link('accumulation', 'coast'),
        links: [
            { href: ctx.link('accumulation', 'coast'), label: 'Open the coast example' },
            { href: ctx.link('accumulation', 'coastHist'), label: 'Replay historical cycles' },
            { href: '/guides/coast-fire', label: 'Read the Coast FIRE guide', ghost: true }
        ],
        hint: 'If real raises stay above 0% while income starts equal to spending, pay outgrows spending and contributions resume. That is no longer a coast test.',
        related: ['coast-fire', 'barista-fire', 'fire-number', 'lean-fire'],
        faqs: [
            { q: 'Does this solve for my Coast FIRE number?', a: 'No. Change “invested today” and run it again until the slower paths arrive on time. The tool times a balance. It does not search for one.' },
            { q: 'What did the example do?', a: `Age 40, $450,000, income and spending both $85,000, goal $1,500,000, 80% stocks. The median path takes ${coast.median} years. The faster 10% are there by ${coast.p10} years. The slower 10% take at least ${coast.p90} years. ${coast.reached} of ${coast.n.toLocaleString('en-US')} shuffled paths reached the goal.` },
            { q: 'What about historical cycles?', a: `${coastH.reached} of ${coastH.n} start years reach the goal before the sample ends. The median of all ${coastH.n} start years is ${coastH.median} years.` },
            { q: 'Is barista FIRE on this page?', a: 'No. A coast check has no withdrawals yet. Part-time income during retirement is the barista guide, using other income on the retirement calculator.' }
        ],
        body: `
            <p>Set the goal to the portfolio you want in today’s dollars, often 25 times the spending you expect after you stop working. Set today’s income equal to today’s spending. Set real raises to 0%. The contribution stays at zero because both sides rise only with CPI. The median years are how long this balance takes with market returns alone.</p>
            ${facts([['Age', '40'], ['Invested', ctx.money(450000)], ['New savings', ctx.money(0)], ['Goal', ctx.money(1500000)], ['Stocks', '80%'], ['Median', `${coast.median} years`]])}
            <p>${shufSave(ctx, coast)} ${histSave(coastH)} The slower 10% at age ${coast.ageP90} are the figure to respect if you needed the money sooner. The <a href="/guides/coast-fire">full guide</a> walks the same example and explains why the model will not print a coast number.</p>
            <p class="callout">When the date arrives, test the withdrawal. Coast FIRE is about getting to the number. It is not the retirement. This is a planning sketch, not advice.</p>
            <h2>Questions people ask next</h2>`
    });

    add({
        id: 'fire-number-calculator',
        kind: 'landing',
        path: '/fire-number-calculator',
        file: 'fire-number-calculator.html',
        source: 'fire-number-calculator',
        targetQuery: 'FIRE number calculator',
        title: 'FIRE number calculator — FIREcalc',
        description: 'Turn annual spending into a FIRE number, then test that portfolio. The $48,000 example opens in the free calculator with the inputs filled in.',
        crumb: 'FIRE number calculator',
        eyebrow: 'Calculator',
        h1: 'FIRE number calculator',
        lede: `Divide annual spending by the withdrawal rate you want to test. $48,000 at 4% is $1,200,000. $48,000 at 3.5% is ${ctx.money(fn35portfolio)}. The buttons open those portfolios in the calculator. On the 4% portfolio, ${shufRet(fnRs)}`,
        primary: ctx.link('retirement', 'fnRetShuf'),
        links: [
            { href: ctx.link('retirement', 'fnRet'), label: 'Test the 4% number' },
            { href: ctx.link('accumulation', 'fnSave'), label: 'Years to save $1.2 million' },
            { href: '/guides/fire-number', label: 'How the number is built', ghost: true }
        ],
        hint: 'Replace $48,000 with your spending before you treat either portfolio as yours. The savings link uses a different person’s income and an existing $160,000 balance.',
        related: ['fire-number', 'safe-withdrawal-rate', 'lean-fire-calculator', 'when-can-i-retire'],
        faqs: [
            { q: 'What withdrawal rate is the default here?', a: '4%, which is 25 times spending, and a second portfolio at 3.5%. Neither rate is a recommendation. The withdrawal-rate guide compares them on $1 million.' },
            { q: 'How long is the retirement test?', a: `40 years, 60% stocks, 0% tax, Social Security off. ${histRet(fnR)} ${shufRet(fnRs)}` },
            { q: 'Why is the goal in today’s dollars?', a: 'The savings model compares the portfolio divided by cumulative inflation to the goal. A nominal balance can cross $1.2 million earlier.' },
            { q: 'Can I type a pension or Social Security?', a: 'Yes, after the page opens, in the retirement form. Turn them on only if you want them inside the success count. They are off on these links.' }
        ],
        body: `
            ${facts([['Spending', ctx.money(48000)], ['4% number', ctx.money(1200000)], ['3.5% number', ctx.money(fn35portfolio)], ['Shuffled, 4%', `${fnRs.successes} of 1,000`], ['Shuffled, 3.5%', `${fn35.successes} of 1,000`], ['Median years to $1.2M', String(fnS.median)]])}
            <p>${shufSave(ctx, fnS)} That savings path is age 36, $160,000 invested, $115,000 of income, $67,000 of spending, 75% stocks. ${histSave(fnH)} The longer explanation, including what 25× does and does not mean, is the <a href="/guides/fire-number">FIRE number guide</a>.</p>
            <p class="callout">A number you have not tested is a multiple, not a plan. Open the retirement button and change one input. Calculations run in your browser. This is not advice.</p>
            <h2>Questions people ask next</h2>`
    });

    add({
        id: 'lean-fire-calculator',
        kind: 'landing',
        path: '/lean-fire-calculator',
        file: 'lean-fire-calculator.html',
        source: 'lean-fire-calculator',
        targetQuery: 'lean FIRE calculator',
        title: 'Lean FIRE calculator — FIREcalc',
        description: 'Test a lean retirement budget against 1975–2024 stock and Treasury returns. The example is $32,000 of spending and an $800,000 portfolio.',
        crumb: 'Lean FIRE calculator',
        eyebrow: 'Calculator',
        h1: 'Lean FIRE calculator',
        lede: `Lean FIRE in this tool is a small spending number. The example is $32,000 a year and an $800,000 portfolio, a 4% draw, for 45 years. ${histRet(leanR)} ${shufRet(leanRs)}`,
        primary: ctx.link('retirement', 'leanRet'),
        links: [
            { href: ctx.link('retirement', 'leanRet'), label: 'Open the lean example' },
            { href: ctx.link('retirement', 'leanRet35'), label: 'Spend $28,000 instead' },
            { href: '/guides/lean-fire', label: 'Read the lean FIRE guide', ghost: true }
        ],
        hint: 'There is no lean switch. The $28,000 button is 3.5% of the same $800,000. Edit spending to your own budget after the page opens.',
        related: ['lean-fire', 'fat-fire', 'barista-fire-calculator', 'safe-withdrawal-rate'],
        faqs: [
            { q: 'What is prefilled?', a: 'Age 45, $800,000, $32,000 of spending, 70% stocks, 0% tax, 45-year horizon, Social Security off, historical cycles. The second button changes only the spending, to $28,000, and uses shuffled years.' },
            { q: 'How often did $28,000 survive the shuffle?', a: `${shufRet(lean35)} The $32,000 shuffle was ${leanRs.successes} of ${leanRs.n.toLocaleString('en-US')}.` },
            { q: 'Does a lower budget need a different data set?', a: 'No. The same 1975–2024 stock and Treasury table runs every plan. The sample still omits 1966 and 1973–74.' },
            { q: 'How do I model getting to $800,000?', a: 'Use the savings button on the lean FIRE guide. This page is the withdrawal test.' }
        ],
        body: `
            ${facts([['Portfolio', ctx.money(800000)], ['Spending', ctx.money(32000)], ['Lower spend', ctx.money(28000)], ['Horizon', '45 years'], ['Historical, $32k', `${leanR.successes} of ${leanR.n}`], ['Shuffled, $32k', `${leanRs.successes} of 1,000`]])}
            <p>Six historical windows are a thin sample for a 45-year retirement. The shuffled count is the wider stress, and it is not a historical cohort. The <a href="/guides/lean-fire">guide</a> also times a savings path from age 33 toward the $800,000 goal. Fat FIRE is the same engine at a high budget, on the <a href="/guides/fat-fire">fat FIRE page</a>.</p>
            <p class="callout">Keep the spending number honest. A lean plan that only works if you later spend more is a different plan. This is a sketch, not advice.</p>
            <h2>Questions people ask next</h2>`
    });

    add({
        id: 'barista-fire-calculator',
        kind: 'landing',
        path: '/barista-fire-calculator',
        file: 'barista-fire-calculator.html',
        source: 'barista-fire-calculator',
        targetQuery: 'barista FIRE calculator',
        title: 'Barista FIRE calculator — FIREcalc',
        description: 'Test part-time income beside a portfolio. The example spends $48,000 from a $700,000 balance, with $1,500 a month for 15 years.',
        crumb: 'Barista FIRE calculator',
        eyebrow: 'Calculator',
        h1: 'Barista FIRE calculator',
        lede: `Enter the full budget as spending and the job as other income. On this example the job is $1,500 a month for 15 years. Without it, ${barOff.successes} of ${barOff.n} historical windows survived. With it, ${barOn.successes} of ${barOn.n} did. Shuffled paths moved from ${barOffS.successes} of 1,000 to ${barOnS.successes} of 1,000.`,
        primary: ctx.link('retirement', 'barOn'),
        links: [
            { href: ctx.link('retirement', 'barOn'), label: 'Open the barista example' },
            { href: ctx.link('retirement', 'barOff'), label: 'Turn the job off' },
            { href: '/guides/barista-fire', label: 'Read the barista guide', ghost: true }
        ],
        hint: 'The paycheck does not rise with inflation, and it stops after 15 years. Spending does rise with inflation. Change the monthly amount and the duration to match the job you would actually do.',
        related: ['barista-fire', 'coast-fire-calculator', 'lean-fire', 'social-security-early-retirement'],
        faqs: [
            { q: 'Which fields does the button set?', a: 'Retirement age 45, $700,000, $48,000 spending, 60% stocks, 0% tax, 45-year horizon, other income $1,500 a month for 15 years, Social Security off.' },
            { q: 'What failed without the income?', a: `The ${barFails.map(row => row.start).join(' and ')} windows. ${shufRet(barOffS)}` },
            { q: 'Can the job last the whole retirement?', a: 'Set the duration to 0. In this tool, 0 means the other income continues for the whole horizon. It still will not rise with inflation.' },
            { q: 'Is this Coast FIRE?', a: 'No. Coast FIRE is zero new savings before you retire. This page is a retirement that still has a paycheck. The coast calculator is a separate page.' }
        ],
        body: `
            ${facts([['Portfolio', ctx.money(700000)], ['Spending', ctx.money(48000)], ['Job', '$1,500/mo'], ['Duration', '15 years'], ['Historical, with job', `${barOn.successes} of ${barOn.n}`], ['Shuffled, with job', `${barOnS.successes} of 1,000`]])}
            <p>${shufRet(barOnS)} That is with the job. The guide explains why two historical windows ran out when the job was removed, and why a nominal paycheck shrinks against an inflation-adjusted budget. Health insurance that depends on the job is not priced here. Add that premium to spending if losing the job would mean paying it yourself.</p>
            <p class="callout">Open the button, then replace $1,500 and 15 years with your own figures. The count belongs to the inputs on the screen. This is not advice.</p>
            <h2>Questions people ask next</h2>`
    });

    const hubOrder = [
        ['Calculators', 'These open the same engine with an example filled in. The math runs in your browser.', ['coast-fire-calculator', 'fire-number-calculator', 'lean-fire-calculator', 'barista-fire-calculator']],
        ['When and how much', 'Savings years and the portfolio those years are aiming at.', ['when-can-i-retire', 'fire-number', 'retire-at-40', 'retire-at-45', 'retire-at-50', 'retire-on-one-million', 'lean-fire', 'fat-fire', 'coast-fire']],
        ['Withdrawals and bad years', 'Rates, sequences, and the named crashes inside 1975–2024.', ['four-percent-rule', 'safe-withdrawal-rate', 'sequence-of-returns', 'market-crash-at-retirement']],
        ['Family, work, and tax', 'Kids, part-time pay, Social Security, and the conversion ladder.', ['fire-calculator-for-families', 'retiring-early-with-kids', 'barista-fire', 'social-security-early-retirement', 'roth-conversion-ladder']]
    ];

    add({
        id: 'guides-index',
        kind: 'hub',
        path: '/guides',
        file: 'guides/index.html',
        source: null,
        targetQuery: 'FIRE calculator guides',
        title: 'FIRE and early-retirement guides — FIREcalc',
        description: 'Guides for lean FIRE, fat FIRE, barista FIRE, retiring at 40, 45, or 50, withdrawal rates, Social Security, and market crashes. Each one opens the calculator.',
        crumb: 'Guides',
        eyebrow: 'Guides',
        h1: 'FIRE and early-retirement guides',
        lede: 'Each page answers one question and opens the calculator with an example filled in. The simulation runs in your browser. Nothing on these pages is a server-side calculator, and none of it is advice.',
        primary: null,
        links: [
            { href: '/', label: 'Open a blank calculator' },
            { href: '/fire-number-calculator', label: 'FIRE number calculator' },
            { href: '/llms-full.txt', label: 'Methodology', ghost: true }
        ],
        hint: 'The sample is US large-cap stocks and 10-year Treasury total returns for 1975–2024. It does not include 1966 or 1973–74.',
        related: [],
        groups: hubOrder,
        faqs: [
            { q: 'Do these pages calculate on a server?', a: 'No. A guide is static HTML. The button is a share link. The browser runs the plan.' },
            { q: 'Which page is the 4% rule?', a: 'The 4% rule guide tests a textbook 30-year case and the six stress packs. The safe withdrawal rate guide compares 4%, 3.5%, 3.25%, and 3% on one portfolio.' },
            { q: 'Where is Coast FIRE?', a: 'The Coast FIRE guide explains the zero-contribution check. The Coast FIRE calculator opens that example directly.' },
            { q: 'Is this financial advice?', a: 'No. FIREcalc is a planning sketch. The limits of the data set are on every page and in the methodology note.' }
        ],
        body: hubOrder.map(([title, sub, ids]) => `<section class="guide-group"><h2>${title}</h2><p>${sub}</p><ul class="guide-grid">${ids.map(id => {
            const item = card(id);
            return `<li><a class="guide-card" href="${item.href}"><strong>${item.title}</strong><span>${item.blurb}</span></a></li>`;
        }).join('')}</ul></section>`).join('') + '<h2>Questions people ask next</h2>'
    });

    return pages.map(page => ({ ...page, cards: (page.related || []).map(card) }));
}
