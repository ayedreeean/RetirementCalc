// Annual market table for FIREcalc.
// Stocks: S&P 500 total return (dividends included). 1975–2020 is the series this
// app already shipped (rounded total returns). 2021–2024 were price returns and are
// now Damodaran S&P 500 total returns: 28.47%, -18.04%, 26.06%, 24.88%.
// Bonds: Aswath Damodaran, NYU Stern, "Historical Returns on Stocks, Bonds and Bills"
// (January 2026), column "US T. Bond (10-year)" total return. Not the Bloomberg
// Aggregate. This series can be negative. It is more volatile than a total-bond fund.
// Inflation: the CPI rates already paired with each stock year in the original table.
// The sample starts in 1975, so retirement windows do not include 1966 or 1973–74.
(function (root) {
    const historicalData = [
        {year:1975, marketReturn:0.3710, bondReturn:0.0361, inflation:0.070},
        {year:1976, marketReturn:0.2380, bondReturn:0.1598, inflation:0.048},
        {year:1977, marketReturn:-0.0710, bondReturn:0.0129, inflation:0.067},
        {year:1978, marketReturn:0.0640, bondReturn:-0.0078, inflation:0.090},
        {year:1979, marketReturn:0.1840, bondReturn:0.0067, inflation:0.113},
        {year:1980, marketReturn:0.3230, bondReturn:-0.0299, inflation:0.135},
        {year:1981, marketReturn:-0.0490, bondReturn:0.0820, inflation:0.103},
        {year:1982, marketReturn:0.2150, bondReturn:0.3281, inflation:0.062},
        {year:1983, marketReturn:0.2240, bondReturn:0.0320, inflation:0.032},
        {year:1984, marketReturn:0.0630, bondReturn:0.1373, inflation:0.043},
        {year:1985, marketReturn:0.3180, bondReturn:0.2571, inflation:0.036},
        {year:1986, marketReturn:0.1860, bondReturn:0.2428, inflation:0.019},
        {year:1987, marketReturn:0.0560, bondReturn:-0.0496, inflation:0.036},
        {year:1988, marketReturn:0.1670, bondReturn:0.0822, inflation:0.041},
        {year:1989, marketReturn:0.3150, bondReturn:0.1769, inflation:0.047},
        {year:1990, marketReturn:-0.0320, bondReturn:0.0624, inflation:0.054},
        {year:1991, marketReturn:0.3040, bondReturn:0.1500, inflation:0.042},
        {year:1992, marketReturn:0.0760, bondReturn:0.0936, inflation:0.030},
        {year:1993, marketReturn:0.1000, bondReturn:0.1421, inflation:0.030},
        {year:1994, marketReturn:0.0130, bondReturn:-0.0804, inflation:0.026},
        {year:1995, marketReturn:0.3730, bondReturn:0.2348, inflation:0.028},
        {year:1996, marketReturn:0.2290, bondReturn:0.0143, inflation:0.030},
        {year:1997, marketReturn:0.3330, bondReturn:0.0994, inflation:0.023},
        {year:1998, marketReturn:0.2860, bondReturn:0.1492, inflation:0.016},
        {year:1999, marketReturn:0.2110, bondReturn:-0.0825, inflation:0.022},
        {year:2000, marketReturn:-0.0910, bondReturn:0.1666, inflation:0.034},
        {year:2001, marketReturn:-0.1190, bondReturn:0.0557, inflation:0.028},
        {year:2002, marketReturn:-0.2200, bondReturn:0.1512, inflation:0.016},
        {year:2003, marketReturn:0.2870, bondReturn:0.0038, inflation:0.023},
        {year:2004, marketReturn:0.1090, bondReturn:0.0449, inflation:0.027},
        {year:2005, marketReturn:0.0490, bondReturn:0.0287, inflation:0.034},
        {year:2006, marketReturn:0.1560, bondReturn:0.0196, inflation:0.032},
        {year:2007, marketReturn:0.0550, bondReturn:0.1021, inflation:0.028},
        {year:2008, marketReturn:-0.3700, bondReturn:0.2010, inflation:0.038},
        {year:2009, marketReturn:0.2660, bondReturn:-0.1112, inflation:-0.004},
        {year:2010, marketReturn:0.1530, bondReturn:0.0846, inflation:0.016},
        {year:2011, marketReturn:0.0210, bondReturn:0.1604, inflation:0.032},
        {year:2012, marketReturn:0.1600, bondReturn:0.0297, inflation:0.021},
        {year:2013, marketReturn:0.3230, bondReturn:-0.0910, inflation:0.015},
        {year:2014, marketReturn:0.1360, bondReturn:0.1075, inflation:0.016},
        {year:2015, marketReturn:0.0150, bondReturn:0.0128, inflation:0.001},
        {year:2016, marketReturn:0.1190, bondReturn:0.0069, inflation:0.013},
        {year:2017, marketReturn:0.2180, bondReturn:0.0280, inflation:0.021},
        {year:2018, marketReturn:-0.0430, bondReturn:-0.0002, inflation:0.024},
        {year:2019, marketReturn:0.3150, bondReturn:0.0964, inflation:0.018},
        {year:2020, marketReturn:0.1840, bondReturn:0.1133, inflation:0.012},
        {year:2021, marketReturn:0.2847, bondReturn:-0.0442, inflation:0.047},
        {year:2022, marketReturn:-0.1804, bondReturn:-0.1783, inflation:0.080},
        {year:2023, marketReturn:0.2606, bondReturn:0.0388, inflation:0.034},
        {year:2024, marketReturn:0.2488, bondReturn:-0.0164, inflation:0.029}
    ];

    function portfolioReturn(year, stockAllocation) {
        const bond = year.bondReturn;
        return (year.marketReturn * stockAllocation) + (bond * (1 - stockAllocation));
    }

    // Small seeded PRNG (mulberry32). Same seed + same inputs = same shuffled paths,
    // so a change in the result comes from the change in the inputs, not from new draws.
    function seededRandom(seed) {
        let a = (seed >>> 0) || 1;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function buildSequences(data, mode, maxYears, simCount, requireFullWindow, rng) {
        const random = typeof rng === 'function' ? rng : Math.random;
        const series = data || historicalData;
        const horizon = Math.max(1, maxYears | 0);
        if (mode === 'historical') {
            const seqs = [];
            if (requireFullWindow) {
                for (let start = 0; start + horizon <= series.length; start++) {
                    seqs.push(series.slice(start, start + horizon));
                }
            } else {
                for (let start = 0; start < series.length; start++) {
                    const take = Math.min(horizon, series.length - start);
                    if (take > 0) seqs.push(series.slice(start, start + take));
                }
            }
            return seqs;
        }
        const n = Math.max(1, simCount | 0);
        const seqs = [];
        for (let i = 0; i < n; i++) {
            const seq = [];
            for (let y = 0; y < horizon; y++) {
                seq.push(series[Math.floor(random() * series.length)]);
            }
            seqs.push(seq);
        }
        return seqs;
    }

    // Savings path. The typed target is today's purchasing power.
    // realBalance = nominal portfolio / cumulative CPI since the start.
    function runAccumulationTrial(input, sequence) {
        const maxYears = input.maxYears;
        let portfolio = input.currentSavings;
        let cpi = 1;
        let currentIncome = input.income;
        let currentExpenses = input.expenses;
        const yearlyData = [];
        let nominalCrossYear = null;

        if (input.currentSavings >= input.targetAmount) {
            return {
                yearsToTarget: 0,
                reachedGoal: true,
                finalBalance: portfolio,
                finalRealBalance: portfolio,
                nominalCrossYear: 0,
                yearlyData: [],
                startYear: sequence[0] ? sequence[0].year : null
            };
        }

        const limit = Math.min(maxYears, sequence.length);
        for (let years = 0; years < limit; years++) {
            const yearData = sequence[years];
            const ret = portfolioReturn(yearData, input.stockAllocation);
            portfolio = portfolio * (1 + ret);
            cpi = cpi * (1 + yearData.inflation);
            currentExpenses = currentExpenses * (1 + yearData.inflation);
            currentIncome = currentIncome * (1 + input.incomeGrowth) * (1 + yearData.inflation);
            const contribution = Math.max(0, currentIncome - currentExpenses);
            portfolio += contribution;
            const realBalance = portfolio / cpi;
            if (nominalCrossYear === null && portfolio >= input.targetAmount) {
                nominalCrossYear = years + 1;
            }
            yearlyData.push({
                year: input.currentAge + years,
                calendarYear: yearData.year,
                balance: portfolio,
                realBalance: realBalance,
                cpi: cpi,
                return: ret,
                inflation: yearData.inflation,
                income: currentIncome,
                expenses: currentExpenses,
                contribution: contribution
            });
            if (realBalance >= input.targetAmount) break;
        }

        let yearsToTarget = null;
        for (let i = 0; i < yearlyData.length; i++) {
            if (yearlyData[i].realBalance >= input.targetAmount) {
                yearsToTarget = i + 1;
                break;
            }
        }

        return {
            yearsToTarget: yearsToTarget,
            reachedGoal: yearsToTarget !== null,
            finalBalance: portfolio,
            finalRealBalance: portfolio / cpi,
            nominalCrossYear: nominalCrossYear,
            yearlyData: yearlyData,
            startYear: sequence[0] ? sequence[0].year : null
        };
    }

    // Retirement path. Return is applied first, then the year's withdrawal.
    // Balances are future (nominal) dollars. preTaxFn(afterTaxSpend, incomeBreakdown)
    // returns the pre-tax draw; without it, spending is grossed up by 1 / (1 - taxRate).
    function runRetirementTrial(input, sequence, preTaxFn) {
        let portfolio = input.retirementSavings;
        let years = 0;
        let ranOutOfMoney = false;
        const yearlyData = [];
        let currentWithdrawal = input.annualWithdrawal;
        let totalWithdrawn = 0;
        let totalIncomeReceived = 0;
        let cpi = 1;

        let currentSSBenefit = input.ssAnnualBase || 0;
        let currentSpouseSSBenefit = input.spouseSSAnnualBase || 0;
        let yearsWithOtherIncome = 0;

        while (years < sequence.length && !ranOutOfMoney) {
            const yearData = sequence[years];
            const currentAge = input.retirementAge + years;
            const ret = portfolioReturn(yearData, input.stockAllocation);

            portfolio = portfolio * (1 + ret);
            cpi = cpi * (1 + yearData.inflation);

            if (input.adjustForInflation && years > 0) {
                currentWithdrawal = currentWithdrawal * (1 + yearData.inflation);
            }

            if (years > 0) {
                currentSSBenefit = currentSSBenefit * (1 + yearData.inflation);
                currentSpouseSSBenefit = currentSpouseSSBenefit * (1 + yearData.inflation);
            }

            let ssIncome = 0;
            if (input.includeSS && currentAge >= input.ssClaimingAge) {
                ssIncome += currentSSBenefit;
            }
            if (input.includeSpouseSS && currentAge >= input.spouseSSClaimingAge) {
                ssIncome += currentSpouseSSBenefit;
            }

            let pensionInc = 0;
            let otherInc = 0;
            if (input.includeOtherIncome) {
                if (currentAge >= input.pensionStartAge) {
                    pensionInc = input.annualPension;
                }
                if (input.otherIncomeDuration === 0 || yearsWithOtherIncome < input.otherIncomeDuration) {
                    otherInc = input.annualOtherIncome;
                    if (input.annualOtherIncome > 0) yearsWithOtherIncome++;
                }
            }

            const totalIncome = ssIncome + pensionInc + otherInc;
            totalIncomeReceived += totalIncome;

            const preTaxWithdrawal = typeof preTaxFn === 'function'
                ? preTaxFn(currentWithdrawal, { socialSecurity: ssIncome, pension: pensionInc, otherOrdinary: otherInc })
                : currentWithdrawal / (1 - input.taxRate);

            const neededFromPortfolio = Math.max(0, preTaxWithdrawal - totalIncome);
            portfolio -= neededFromPortfolio;
            totalWithdrawn += currentWithdrawal;

            yearlyData.push({
                age: currentAge,
                calendarYear: yearData.year,
                balance: Math.max(0, portfolio),
                cpi: cpi,
                return: ret,
                inflation: yearData.inflation,
                withdrawal: neededFromPortfolio,
                afterTaxWithdrawal: currentWithdrawal,
                ssIncome: ssIncome,
                otherIncome: pensionInc + otherInc,
                totalIncome: totalIncome
            });

            if (portfolio <= 0) {
                ranOutOfMoney = true;
                portfolio = 0;
            }
            years++;
        }

        return {
            ranOutOfMoney: ranOutOfMoney,
            yearsLasted: ranOutOfMoney ? years : input.lifeExpectancy,
            finalBalance: portfolio,
            finalRealBalance: portfolio / cpi,
            yearlyData: yearlyData,
            totalWithdrawn: totalWithdrawn,
            totalIncomeReceived: totalIncomeReceived,
            startYear: sequence[0] ? sequence[0].year : null
        };
    }

    root.FIRECALC_HISTORICAL = historicalData;
    root.FirecalcSim = {
        portfolioReturn: portfolioReturn,
        buildSequences: buildSequences,
        seededRandom: seededRandom,
        runAccumulationTrial: runAccumulationTrial,
        runRetirementTrial: runRetirementTrial
    };
})(typeof window !== "undefined" ? window : globalThis);
