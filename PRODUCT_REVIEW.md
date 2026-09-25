# FIREcalc.ai — product and engineering review

Reviewed from this repo (`main` at the time of writing) and checked against the live site on 25 Sep 2026. Production `https://firecalc.ai/app.js` is the same byte length as `app.js` in this repo (139,112). The live HTML still contains the help sentences and defaults cited below. There is no `market-data.js`; the return series lives inline in `app.js` (about lines 104–155) and is copied again in `tests.html`.

No calculator behavior was changed in this PR. The model fixes below change the numbers users see, so they should land as their own small patches with a before/after check, not as a drive-by refactor.

## Verdict

FIREcalc is sound enough as a free, local sketch of “is this plan in the right neighborhood?” It is not sound enough to pick a FIRE date from. Both calculators shuffle individual historical years instead of replaying historical sequences, the non-stock sleeve is a flat 3% with no down years, and the savings goal never rises with inflation while contributions do. The retirement defaults quietly include $2,000/month of Social Security behind a collapsed panel, then celebrate a success rate that a portfolio-only 4% test would not have earned. The help text describes a different engine (bond index, today’s dollars, data through 2020) than the one that runs. Use the tool to explore. Do not treat the headline number as a Trinity-style success rate.

## What is already strong

- The core simulation stays in the browser. Savings, age, and Social Security estimates are not required to create an account. That matches the privacy policy’s main claim.
- Each draw keeps that year’s stock return and that year’s inflation together. Crashes are not paired with random inflation.
- The retirement model has the pieces FIRE users ask for first: inflation-adjusted withdrawals, a flat tax gross-up, Social Security with claiming-age factors and a COLA, a pension that stays nominal, and a second earner. The Social Security tooltip correctly says the input is the benefit at full retirement age (67). The age factors match the usual full-retirement-age-67 schedule (62 → 70%, 67 → 100%, 70 → 124%).
- Simple tax mode is internally consistent: spending is grossed up by `1 / (1 - rate)`, and other income reduces that gross need. With a 15% rate, $40,000 of spending is a $47,059 pre-tax need.
- The detailed tax module is a real 2025 federal sketch: progressive brackets, standard deduction, long-term gains stacked on ordinary income, single vs married filing jointly. With no other income, a 100% pre-tax withdrawal is sized so after-tax spending matches the target.
- Success is defined in a way a planner can say out loud: the share of trials in which the portfolio is still positive at the end of every year of the chosen horizon. The FAQ states that.
- Inputs are validated for empty, negative, and absurd magnitudes. Scenarios can be encoded in the query string, including tax settings. `localStorage` restores the form.
- The February 2026 UX pass added a skip link, tab roles, visible focus, and mobile layout overrides. Recent commits fixed the fixed header covering content on small screens.

## How the model actually works

Both simulators do this for every year of every trial:

1. Pick one year at random from the 50-row table (1975–2024), with replacement. The next year is independent.
2. Portfolio return = `stock return × stock weight + 3% × (1 - stock weight)`.
3. Apply that return to the balance, then (savings) inflate income and expenses and add `max(0, income - expenses)`, or (retirement) inflate the withdrawal and subtract it.

There is no historical-sequence mode, no fee, no glide path, and no cash bucket. Rebalancing is implicit: the stock weight is reapplied to the whole balance every year. The bond side of that rebalance cannot lose money, because it is not a bond return.

On the embedded stock series itself (not a market-history claim):

- 50 years, 1975 through 2024. Nine negative years: 1977, 1981, 1990, 2000–2002, 2008, 2018, 2022. The worst row is 2008 at −37.0%.
- Arithmetic mean of the stock column: 13.54%. Geometric mean: 12.23%.
- Arithmetic mean of the inflation column: 3.76%. Geometric: 3.72%. Cumulative inflation over the 50 rows: 6.22×. A dollar at the start of this series has about 16 cents of purchasing power at the end.
- A flat 3% nominal bond against that 3.72% inflation path is about −0.7% real, with zero nominal volatility.
- A 30-year historical window fits in this table 21 times. A 40-year window fits 11 times. A 50-year window fits once. The shuffler instead manufactures 1,000 paths.

A spot check against Slickcharts’ S&P 500 price-vs-total table (a secondary compilation, not a full audit): rows through 2020 line up with total return including dividends (2008 is −37.0%, 2020 is 18.4%). The 2021–2024 rows line up with price return instead (26.9%, −19.4%, 24.2%, 23.3%). The help text says the series is the total-return index through 2020. The array continues through 2024 and has no source comment. Missing dividends in the last four years is a small pessimism. The larger hole is the missing bad cohorts before 1975. Published S&P total-return figures include 1973 at about −15%, 1974 at about −26%, and 1966 at about −10%. Those are the starts that dominate 30- and 40-year safe-withdrawal studies. This table begins in 1975, after that crash.

What serious FIRE planning usually does, at the level of the published methods (Bengen 1994, the Trinity study, and the historical-window calculators in that family): walk forward through actual subsequent years for each retirement start date, using historical stock and bond returns, an inflation-adjusted withdrawal, and a success count equal to the share of start dates that survive the horizon. Fees, a bond index with real drawdowns, and a sample that includes the 1960s–70s are part of that expectation. This repo discloses random sampling in one help paragraph and then describes sequence-of-returns risk, a bond index, and today’s dollars as if the engine did those things.

Shuffling years does create unlucky paths, so it is not “no risk.” It does not reproduce inflation that stays high for a decade, or a multi-year bear market, at the rate those things actually occurred. It also invents repeated 2008s that never happened. With only 21 real 30-year windows in the file, a historical mode would be a thin sample and should be labeled as one. It would still answer the question users think they are asking.

## Where a FIRE user gets misled

**Savings target is nominal.** Income and expenses inflate. The $1,000,000 goal does not. The code stops at `portfolio >= targetAmount`. Charts and the milestone cards then show those nominal balances. The help line “All values are in today’s dollars when adjusted for inflation” is false for the portfolio.

One chronological path through the table (not a shuffled trial, so it is reproducible) using the default savings inputs — age 30, $50,000 saved, $90,000 income, $70,000 spending, 2% real raises, 70% stocks, $1,000,000 goal — crosses $1,000,000 nominal in year index 10. Cumulative inflation by then is 2.15×, so that balance is about $535,000 in starting dollars. The same path reaches $1,000,000 of starting purchasing power in year index 16. The UI would label the nominal crossing as 10 years, because it stores the array index. The shuffled median will differ, and it will be optimistic in the same direction whenever inflation is positive.

**Retirement defaults include Social Security that the screen does not show.** `includeSS` is checked, the benefit is $2,000/month, claiming age is 67, and the Income Sources panel is collapsed. Retirement age is 65, savings $1,000,000, withdrawal $40,000, tax 15%, stocks 60%, horizon 30 years, inflation adjustment on.

- Before Social Security, the portfolio must fund $40,000 / 0.85 = $47,059 a year (4.7% of the portfolio, not 4%).
- Social Security starts at age 67 ($24,000, then COLA). The portfolio need falls to about $23,059 (2.3%) and both sides then inflate.
- The success-rate card, the confetti (threshold is 80%), and the “plan looks very secure” banner do not mention that income.
- The AI prompt reports withdrawal rate as `annualWithdrawal / retirementSavings` (4.00%) and does not include the Social Security inputs, while the success rate it sends was produced with Social Security on.

A user who wanted a portfolio-only 4% test has to open a collapsed section and uncheck a box they may not know is on. The FAQ tells people who have rental or part-time income to lower the withdrawal by hand, which is a second, conflicting way to model the same thing.

**The non-stock sleeve cannot crash.** The slider tooltip is honest (“3% annual return”). The help section is not: it says bond returns are the Bloomberg US Aggregate Bond Index for 1975–2020. A 60/40 in this tool never has a year when both sides fall. 2022-style balanced-portfolio damage is impossible here. Over a long horizon the 3% assumption is also a low average real return versus historical investment-grade bonds, so expected growth and crash risk are biased in opposite directions. The allocation slider cannot answer “how much should I hold in bonds?”

**“Percentile” does not mean what the help says.** Savings computes a 10th and 90th percentile of years-to-goal and never displays them. The only headline is the median, and a second assignment replaces `"12 years"` with the bare number `12` (or `>50` if the median trial never hits). Milestones use the same index, so the year you arrive is labeled as your age at the start of that year.

The retirement chart picks three entire trials by ending balance and labels them 10th, median, and 90th. A path that finishes poor can have been ahead for most of the horizon. It is not the 10th percentile of wealth at each age. “Worst case ending age” is the 10th percentile of the failures only. If 3 of 1,000 trials fail, that statistic is the worst failure, labeled as a 10th percentile.

**Success rate is a full-horizon survival rate on shuffled years.** That is a fair definition, and the FAQ says so. It is a different statistic from the historical-cohort success rate in the Trinity / Bengen literature. End-of-year withdrawal (return first, then spend) is a bit kinder than withdrawing at the start of the year. The first year’s inflation is not applied to the withdrawal or to Social Security, because both only inflate when `years > 0`. Fees are absent, so a 0.20%–0.50% expense ratio never shows up over a 40- or 50-year horizon.

**Detailed taxes are a sketch, and one checkbox does nothing.** “Optimize withdrawal order” requires `settings.portfolioBalances`. Nothing sets that field, so the box always falls through to a constant percentage split. Account balances are not tracked, so the mix never shifts as one account runs out. Half of every taxable withdrawal is assumed to be gain. Social Security taxability always uses the married-filing-jointly thresholds, including for single filers. Brackets and the standard deduction stay in 2025 dollars while withdrawals inflate, so long retirements are pushed into higher brackets that current law indexes away. No early-withdrawal penalty, RMD, NIIT, IRMAA, or ACA subsidy. With other income, the solver taxes a portfolio withdrawal and then the simulator subtracts that income from the withdrawal, so the tax was computed on a larger distribution than the one that occurs. On a $40,000 spend, $24,000 of Social Security, and a 100% pre-tax mix, that over-withdraws on the order of a few thousand dollars a year. Simple mode does not have this bug. No-other-income detailed mode hits the spending target.

## Product and UX

Defaults worth stating on the result card, not only in a tooltip:

- Savings: 30 years old, $50k saved, $90k after-tax income, $70k spending, 2% real raises, $1M goal, 70% stocks, 1,000 shuffles.
- Retirement: as above, plus Social Security on. Retirement-age input `min` is 40, which fights the product name even though typed values below 40 are not blocked in JavaScript (`MAX_AGE` is only an upper bound).

Share links are implemented and then hidden. `#shareContainer` is `display: none` and no script shows it. Help still lists “Share Feature” for both calculators. The encoder itself is in good shape (active tab, Social Security, pension, tax mode). Shared URLs put income, savings, and benefit amounts in the query string. The live site sends `Referrer-Policy: strict-origin-when-cross-origin`, which avoids leaking that query to other sites. The URL still sits in browser history and in host logs. The privacy policy (14 May 2025) says calculator data is not transmitted. A share link is a transmission. `localStorage` keys `firecalc_inputs` and `firecalc_tax_settings` are also unmentioned; they stay on device, which is fine, but the policy should say so.

Results that are easy to misread:

- Median years has no unit after the overwrite, and failures say `>50` while an earlier dead assignment said `25+ years`.
- Balances are nominal dollars with no label.
- Total withdrawals are accumulated from the after-tax spending figure. The card says “Median scenario (pre-tax).”
- Income-coverage divides other income by (portfolio withdrawal + other income), which is a share of gross cash sources, not a share of the spending target.
- Confetti and a security banner at 80% train people to treat a comfortable shuffle as a decision.
- The year-by-year modal always uses the savings “current age” (default 30) for the Age column, including retirement trials. The body also inserts an income cell the header does not have, so Balance slides into an unlabeled column.
- Retirement “View Details” looks up the trial in `allSimulations`, which only the savings run fills, so the title falls back to “Simulation 1.”
- The savings and retirement tables render every trial (500–5,000 rows). Pagination buttons are referenced from JavaScript and are not in the page. Column-sort listeners are added again on every run, so after one simulation a header click toggles sort twice and nothing appears to happen. Filter buttons accumulate listeners the same way.

Mobile: header overlap was fixed in recent commits (`padding-top` 80px desktop, 66px under 768px). Grids collapse under 640px. This review did not re-run a device lab. Canvas charts have no text alternative. Tooltips are hover-only, with no `aria-describedby`. Tab clicks update `.active` and do not update `aria-selected`, so the retirement tab stays `aria-selected="false"` while it is showing. Modals have no focus trap (already noted in `ux-report.md`). Status in the retirement table is an emoji.

SEO: the title is “FIREcalc”. There is no meta description, canonical URL, or Open Graph text. The FAQ is real HTML, which is the best on-page content, and it is inside a modal. The name sits next to the long-running historical calculator people already mean by “FIRECalc.” The page should say, in the first screen, that this one shuffles years.

PWA: `manifest.json` is a standalone app. `service-worker.js` (`firecalc-v4`) is cache-first and only precaches `/` and `/index.html`. It does not cache `app.js`, `tax-engine.js`, or `styles.css`, logs every fetch, calls `skipWaiting()`, and on a network failure resolves `respondWith` with `undefined`. Offline, the shell can appear and the scripts cannot. A later HTML change that does not bump `CACHE_NAME` leaves installed clients on the old document while `app.js` (not in the cache list, and cached for 4 hours at the CDN) moves on. The same service worker backs the Trusted Web Activity in `.well-known/assetlinks.json` (`ai.firecalc.twa`). Icons use `purpose: "any maskable"` on artwork that was not padded for the maskable safe zone.

## Engineering, reliability, security

| Area | What the code does |
| --- | --- |
| OpenAI proxy | `functions/openai-proxy.js` accepts any POST body as the user prompt, calls `gpt-4-turbo-preview` with the server key, `temperature: 0.7`, `max_tokens: 1500`, returns the raw JSON, and sets `Access-Control-Allow-Origin: *`. No auth, no rate limit, no prompt-size cap, no `OPTIONS` handler. Same-origin browser use works. Any HTTP client can spend the key. The client then does `marked.parse` into `innerHTML`. `marked` is loaded unpinned from jsDelivr, so whether model HTML is escaped depends on the CDN’s current build. |
| CSP | Live responses have `X-Content-Type-Options: nosniff` and a strict referrer policy. They have no Content-Security-Policy. Scripts come from jsDelivr with no integrity hashes. `html2canvas` is injected from `html2canvas.hertzen.com` on AI setup. |
| Privacy copy | Core math is local. AI is opt-in and disclosed. Share URLs and `localStorage` are not. |
| Tests | `tests.html` is a manual browser page. It duplicates the series and the loop instead of calling `app.js`. The “4% rule” case turns inflation off and tax to 0, then expects survival above 90%. That is not the inflation-adjusted rule the FAQ describes, and it would stay green if the real withdrawal path broke. The Roth and simple-mode tests assert `true` without calling `tax-engine.js`. Nothing covers the nominal target, the no-op optimizer, share links, or the proxy. |
| Dead weight | `index_original.html` is a 222KB monolith still in the site root. `forceFieldPosition` plus a `MutationObserver` on `document.body` looks for `label[for="annualIncome"]`, which does not exist. `#simulation-detail-modal` is not the modal the detail button opens. |
| Deploy | No `package.json`, no CI, no `_headers`. Cloudflare Pages is implied by `functions/`. `app.js` is served with `cache-control: public, max-age=14400`. |

Edge cases worth knowing: a tax rate of 100% divides by zero (the HTML max is 50; JavaScript does not check). Money fields strip every character except digits and dots, so a leading minus is silently dropped. `simulationCount` of 0 would divide the success rate by zero. Negative savings during the working years is floored at zero contribution, so a plan that spends more than it earns never draws the portfolio down.

## Recommendations

### P0 — correctness and trust

1. **Inflate the savings goal, or compare in today’s dollars.**  
   What: the goal is a fixed nominal number; contributions inflate. Years-to-FIRE and the milestone ages are short of the purchasing power the user typed.  
   Why: this is the number on the savings result card.  
   Fix: keep a CPI index in the savings loop (it already exists for retirement withdrawals). Compare `portfolio / cpi` to the typed goal, and label the chart “today’s dollars.” Show nominal as a secondary figure if you want it.

2. **Make the retirement result say what it assumed. Stop defaulting Social Security to on while the panel is shut.**  
   What: the stock scenario is a ~4.7% pre-tax draw for two years, then ~2.3% plus a COLA’d $24,000 benefit. The card shows one success rate. Confetti fires at 80%. The AI prompt calls it a 4% withdrawal and omits Social Security.  
   Why: users will screenshot the success rate.  
   Fix: default `includeSS` to off. When it is on, print one line under the success rate: benefit, claiming age, and the portfolio withdrawal before and after that income. Put the same facts in the AI prompt. Raise or remove the confetti, or tie it to a portfolio-only case.

3. **Stop describing an engine the code does not run.**  
   What: help says Bloomberg aggregate bonds, CPI and returns for 1975–2020, today’s dollars, and optimistic/conservative percentiles. The code uses a flat 3%, rows through 2024, nominal balances, and a median only.  
   Why: this is the methodology page. It is live.  
   Fix: rewrite that section to match the loop in one sitting. Say “shuffled historical years,” “non-stock return is a constant 3% nominal,” and “balances are nominal.” Delete the percentile planning advice until those percentiles are on screen.

4. **Add a historical-cycles mode beside the shuffler. Give the non-stock sleeve a real series.**  
   What: independent draws are not sequence-of-returns analysis. A constant 3% cannot fall, so stock/bond crashes never happen. The sample starts in 1975.  
   Why: this is the gap versus the planning method FIRE users think this name implies.  
   Fix: do not rewrite the app. Add a second loop: for each start index where `start + horizon <= 50`, walk forward one year at a time. Report `successes / windows`, and show the worst start year. Label the current loop “shuffled years.” Add a `bondReturn` on each row (even a rough total-return series) and use it in the same formula that today uses `0.03`. Say plainly that 21 windows of 30 years, starting in 1975, is a short US large-cap sample and omits 1966 and 1973–74. Extending the table backward is the follow-up, not a requirement for the first patch.

5. **Close the OpenAI proxy.**  
   What: unauthenticated `POST /openai-proxy` spends the server key on any prompt. The browser inserts the markdown with `innerHTML`. The model name is the old `gpt-4-turbo-preview` snapshot.  
   Why: cost and abuse, plus a content-injection path into the page.  
   Fix: require a bot check or a short-lived token, cap the body to the structured scenario (ignore client-supplied freeform prompts), rate-limit, return only the message string, pin a current model, and set a billing cap. Sanitize markdown before inserting it (DOMPurify, or render text). Add a CSP that locks scripts to known hosts, with hashes or pinned versions instead of bare jsDelivr URLs.

### P1 — high leverage, after the P0s

6. **Fix the savings headline math and the retirement summary labels.** Store years-to-goal as `index + 1`. Remove the second `textContent` write so the unit survives. Display the 10th / 50th / 90th of years-to-goal, with “10th = faster” written on the card. Build the retirement fan as the percentile of balance at each age, or label the current lines “three sample paths ranked by ending value.” Compute “worst case” from all trials, counting successes as the full horizon. Rename total withdrawals to after-tax spending. Label nominal vs real on every balance.

7. **Either implement withdrawal order or uncheck the box.** Track three balances. If “optimize” is on, draw taxable, then pre-tax, then Roth, and stop when the account is empty. If it is off, draw in proportion and reduce each balance. Force the mix to 100% before running. Index the brackets by the same CPI path, or label them “2025 brackets, not adjusted for later inflation.” Use single Social Security thresholds when filing status is single. Keep the 50% gains assumption, and print it next to the control.

8. **Show the share button, and paginate the tables.** Unhide `#shareContainer` after a run; the encoder already works. Render 20 rows at a time using the `page` argument `displaySimulationTable` already accepts. Register sort and filter listeners once. Point retirement detail ages at `retirementAge`. Add the income column to the modal header, or stop emitting that cell. Write retirement trials into the array the export uses, and stop sorting `allSimulations` in place inside `generateExportData`.

9. **Make the service worker safe for the next deploy.** Precache nothing on a cache-first navigation. Use network-first for HTML, with the cache as offline fallback. Bump the cache name whenever `app.js` changes, or drop the custom worker until the offline story is real. Remove the per-request `console.log`.

10. **Test the functions that ship.** Load `tax-engine.js` and a small extracted simulation module from `tests.html` instead of a second copy of the loop. Add one inflation-adjusted withdrawal case, one nominal-vs-real goal case, and one assertion that the optimizer changes the account it draws when balances exist. The current 4% test, with inflation off, should be renamed so it cannot be quoted as the Trinity result.

### P2 — worth doing, not first

11. **Expense ratio.** One numeric input, subtracted from the annual portfolio return. Default it to something small and visible (for example 0.10% or whatever you choose to disclose), including in historical-cycles mode.

12. **Spending flexibility.** A floor and a ceiling, or a simple “cut 10% after a down year” switch. Constant inflation-adjusted spending is why sequence risk hurts; guardrails are how many early retirees actually spend.

13. **Coast and barista as modes, not FAQ advice.** A part-time income field already exists (`monthlyOtherIncome` plus a duration). Surface “cover half of spending from work until 60” as a preset instead of telling people to edit the withdrawal downward, which double-counts if Social Security is also on.

14. **Glide path.** Optional: stock weight steps down at a chosen age. The current constant mix can stay the default.

15. **Cash versus bonds.** Once bond returns exist, a third sleeve at T-bill or cash returns stops the slider from meaning “bonds and cash are the same 3%.”

16. **Reproducible trials.** A seed in the share URL so two people opening the same link see the same success rate. Shuffled results move a little between clicks at 1,000 trials.

17. **Early-retiree tax edges, only after the sketch is honest:** penalty before 59½, RMDs, and a note that ACA and IRMAA are not modeled. A Roth conversion ladder is mentioned in the FAQ and not simulated; delete that sentence until it exists.

18. **SEO and accessibility leftovers.** Meta description, canonical `https://firecalc.ai/`, and a visible one-paragraph method under the title. Arrow keys between tabs, `aria-selected` kept in sync, focus trap in the modals, tooltips on keyboard focus. Text next to the success and failure emoji.

19. **Repo hygiene.** Remove or stop publishing `index_original.html`. Delete the `annualIncome` mutation observer. Add a `_headers` file for CSP when the script hosts are pinned.

## Suggested order of work

1. Rewrite the help text to match the code (P0.3). One file, no math change, immediate trust gain.  
2. Turn default Social Security off and print the income assumption on the result (P0.2).  
3. Compare the savings goal in today’s dollars (P0.1) and correct the year index (P1.6).  
4. Lock down the proxy (P0.5) before spending more on the AI button.  
5. Add historical cycles plus a bond column (P0.4). That is the feature that makes the success rate mean what FIRE planners expect, and it can sit next to the current shuffler rather than replacing it.
