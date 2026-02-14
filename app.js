        // ============================================
        // CONSTANTS
        // ============================================
        const DEFAULT_INFLATION = 0.03;
        const DEFAULT_BOND_RETURN = 0.03;
        const SIMULATIONS_DEFAULT = 1000;
        const MAX_ACCUMULATION_YEARS = 50;
        const MAX_INPUT_VALUE = 999999999;
        const MAX_AGE = 90;

        // Social Security claiming age adjustment factors
        const SS_AGE_FACTORS = {
            62: 0.70, 63: 0.75, 64: 0.80, 65: 0.8667,
            66: 0.9333, 67: 1.00, 68: 1.08, 69: 1.16, 70: 1.24
        };

        // ============================================
        // GLOBAL STATE
        // ============================================
        let allSimulations = [];
        let currentPage = 1;
        const rowsPerPage = 10;
        let currentSortColumn = null;
        let currentSortDirection = 'asc';
        let activeSimulator = 'accumulation';
        
        // ============================================
        // UTILITY FUNCTIONS
        // ============================================
        function formatCurrency(amount) {
            if (amount == null || isNaN(amount)) return '$0.00';
            const isNegative = amount < 0;
            const abs = Math.abs(amount);
            const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            return isNegative ? `-$${formatted}` : `$${formatted}`;
        }

        function showValidationError(message) {
            // Create a styled error toast instead of alert
            const existing = document.getElementById('validationToast');
            if (existing) existing.remove();
            const toast = document.createElement('div');
            toast.id = 'validationToast';
            toast.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:#ef4444;color:white;padding:12px 24px;border-radius:8px;z-index:10000;font-size:0.95rem;max-width:90%;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
        }

        // ============================================
        // LOCAL STORAGE PERSISTENCE
        // ============================================
        const STORAGE_KEY = 'firecalc_inputs';

        function saveInputsToStorage() {
            const inputs = {};
            const fields = [
                'currentAge', 'currentSavings', 'income', 'expenses', 'targetAmount',
                'stockAllocation', 'incomeGrowth', 'savingsSimulationCount',
                'retirementAge', 'retirementSavings', 'annualWithdrawal',
                'retirementStockAllocation', 'withdrawalAdjustment', 'taxRate',
                'simulationCount', 'retirementLifeExpectancy',
                'includeSS', 'ssMonthlyBenefit', 'ssClaimingAge',
                'includeSpouseSS', 'spouseSSMonthlyBenefit', 'spouseSSClaimingAge',
                'includeOtherIncome', 'monthlyPension', 'pensionStartAge',
                'monthlyOtherIncome', 'otherIncomeDuration'
            ];
            fields.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    inputs[id] = el.type === 'checkbox' ? el.checked : el.value;
                }
            });
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs)); } catch(e) {}
        }

        function loadInputsFromStorage() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
                if (!saved) return;
                Object.keys(saved).forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        if (el.type === 'checkbox') {
                            el.checked = saved[id];
                        } else {
                            el.value = saved[id];
                        }
                        // Update range slider labels
                        if (id === 'stockAllocation') {
                            const label = document.getElementById('stockAllocationValue');
                            if (label) label.textContent = saved[id];
                        }
                        if (id === 'retirementStockAllocation') {
                            const label = document.getElementById('retirementStockAllocationValue');
                            if (label) label.textContent = saved[id];
                        }
                    }
                });
            } catch(e) {}
        }

        // Define historical market data in the global scope
        const historicalData = [
            {year: 1975, marketReturn: 0.371, inflation: 0.070},
            {year: 1976, marketReturn: 0.238, inflation: 0.048},
            {year: 1977, marketReturn: -0.071, inflation: 0.067},
            {year: 1978, marketReturn: 0.064, inflation: 0.090},
            {year: 1979, marketReturn: 0.184, inflation: 0.113},
            {year: 1980, marketReturn: 0.323, inflation: 0.135},
            {year: 1981, marketReturn: -0.049, inflation: 0.103},
            {year: 1982, marketReturn: 0.215, inflation: 0.062},
            {year: 1983, marketReturn: 0.224, inflation: 0.032},
            {year: 1984, marketReturn: 0.063, inflation: 0.043},
            {year: 1985, marketReturn: 0.318, inflation: 0.036},
            {year: 1986, marketReturn: 0.186, inflation: 0.019},
            {year: 1987, marketReturn: 0.056, inflation: 0.036},
            {year: 1988, marketReturn: 0.167, inflation: 0.041},
            {year: 1989, marketReturn: 0.315, inflation: 0.047},
            {year: 1990, marketReturn: -0.032, inflation: 0.054},
            {year: 1991, marketReturn: 0.304, inflation: 0.042},
            {year: 1992, marketReturn: 0.076, inflation: 0.030},
            {year: 1993, marketReturn: 0.100, inflation: 0.030},
            {year: 1994, marketReturn: 0.013, inflation: 0.026},
            {year: 1995, marketReturn: 0.373, inflation: 0.028},
            {year: 1996, marketReturn: 0.229, inflation: 0.030},
            {year: 1997, marketReturn: 0.333, inflation: 0.023},
            {year: 1998, marketReturn: 0.286, inflation: 0.016},
            {year: 1999, marketReturn: 0.211, inflation: 0.022},
            {year: 2000, marketReturn: -0.091, inflation: 0.034},
            {year: 2001, marketReturn: -0.119, inflation: 0.028},
            {year: 2002, marketReturn: -0.220, inflation: 0.016},
            {year: 2003, marketReturn: 0.287, inflation: 0.023},
            {year: 2004, marketReturn: 0.109, inflation: 0.027},
            {year: 2005, marketReturn: 0.049, inflation: 0.034},
            {year: 2006, marketReturn: 0.156, inflation: 0.032},
            {year: 2007, marketReturn: 0.055, inflation: 0.028},
            {year: 2008, marketReturn: -0.370, inflation: 0.038},
            {year: 2009, marketReturn: 0.266, inflation: -0.004},
            {year: 2010, marketReturn: 0.153, inflation: 0.016},
            {year: 2011, marketReturn: 0.021, inflation: 0.032},
            {year: 2012, marketReturn: 0.160, inflation: 0.021},
            {year: 2013, marketReturn: 0.323, inflation: 0.015},
            {year: 2014, marketReturn: 0.136, inflation: 0.016},
            {year: 2015, marketReturn: 0.015, inflation: 0.001},
            {year: 2016, marketReturn: 0.119, inflation: 0.013},
            {year: 2017, marketReturn: 0.218, inflation: 0.021},
            {year: 2018, marketReturn: -0.043, inflation: 0.024},
            {year: 2019, marketReturn: 0.315, inflation: 0.018},
            {year: 2020, marketReturn: 0.184, inflation: 0.012},
            {year: 2021, marketReturn: 0.269, inflation: 0.047},
            {year: 2022, marketReturn: -0.194, inflation: 0.080},
            {year: 2023, marketReturn: 0.242, inflation: 0.034},
            {year: 2024, marketReturn: 0.233, inflation: 0.029}
        ];
        
        // Add any other global variables/functions needed by both calculators here
        
        let globalTargetAmount = 0;

        // Add this function to update the global variable
        function updateGlobalTargetAmount() {
            const targetInput = document.getElementById('targetAmount');
            if (targetInput) {
                globalTargetAmount = parseFloat(targetInput.value.replace(/[^\d.-]/g, '')) || 0;
                console.log("Target amount updated to: " + globalTargetAmount);
            }
        }
        
        // Tab navigation without page refresh
        document.addEventListener('DOMContentLoaded', function() {
            // === CONSOLIDATED DOMContentLoaded ===

            // Load saved inputs (before URL params override)
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.size === 0) {
                loadInputsFromStorage();
            }

            // Auto-save inputs on change
            document.querySelectorAll('input, select').forEach(el => {
                el.addEventListener('change', saveInputsToStorage);
                el.addEventListener('input', saveInputsToStorage);
            });

            // Show the default tab (accumulation)
            showTab('accumulation-tab');
            
            // Add event listeners to all nav links (both .nav-link and .header-nav-link)
            document.querySelectorAll('.nav-link, .header-nav-link').forEach(link => {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    
                    // Remove active class from all navigation links
                    document.querySelectorAll('.nav-link, .header-nav-link').forEach(el => {
                        el.classList.remove('active');
                    });
                    
                    // Add active class to clicked link
                    this.classList.add('active');
                    
                    // Get the tab ID and show that tab
                    const tabId = this.getAttribute('data-tab');
                    showTab(tabId);
                });
            });
            
            // Initialize filter buttons if they exist
            if (document.querySelector('.filter-btn')) {
                setupFilterButtons();
            }
            
            // Circular help button
            const helpButton = document.getElementById('helpButton');
            if (helpButton) {
                helpButton.addEventListener('click', function() {
                    const helpModal = document.getElementById('helpModal');
                    if (helpModal) {
                        helpModal.style.display = 'block';
                    }
                });
            }
            
            // Close help modal when clicking X
            const closeHelpModal = document.getElementById('closeHelpModal');
            if (closeHelpModal) {
                closeHelpModal.addEventListener('click', function() {
                    document.getElementById('helpModal').style.display = 'none';
                });
            }
            
            // Close help modal when clicking outside
            window.addEventListener('click', function(event) {
                const helpModal = document.getElementById('helpModal');
                if (helpModal && event.target === helpModal) {
                    helpModal.style.display = 'none';
                }
            });
            
            // Income Sources collapsible toggle
            const incomeToggle = document.getElementById('incomeSourcesToggle');
            const incomeContent = document.getElementById('incomeSourcesContent');
            if (incomeToggle && incomeContent) {
                incomeToggle.addEventListener('click', function() {
                    const expanded = this.getAttribute('aria-expanded') === 'true';
                    this.setAttribute('aria-expanded', !expanded);
                    incomeContent.style.display = expanded ? 'none' : 'block';
                });
            }

            // Checkbox show/hide for income sub-fields
            function setupCheckboxToggle(checkboxId, fieldsId) {
                const cb = document.getElementById(checkboxId);
                const fields = document.getElementById(fieldsId);
                if (cb && fields) {
                    const update = () => { fields.style.display = cb.checked ? 'block' : 'none'; };
                    cb.addEventListener('change', update);
                    update();
                }
            }
            setupCheckboxToggle('includeSS', 'ssFields');
            setupCheckboxToggle('includeSpouseSS', 'spouseSSFields');
            setupCheckboxToggle('includeOtherIncome', 'otherIncomeFields');

            // Setup AI Analysis (once)
            setupAiAnalysis();

            // Setup share button
            setupShareButton();

            // Apply shared parameters from URL
            function applySharedParameters() {
                const params = new URLSearchParams(window.location.search);
                if (params.size === 0) return;
                
                const tab = params.get('tab');
                
                if (tab === 'retirement') {
                    // Switch to retirement tab
                    showTab('retirement-tab');
                    document.querySelectorAll('.nav-link, .header-nav-link').forEach(el => el.classList.remove('active'));
                    document.querySelector('[data-tab="retirement-tab"]')?.classList.add('active');
                    
                    if (params.has('retirementAge')) document.getElementById('retirementAge').value = params.get('retirementAge');
                    if (params.has('retirementSavings')) document.getElementById('retirementSavings').value = params.get('retirementSavings');
                    if (params.has('annualWithdrawal')) document.getElementById('annualWithdrawal').value = params.get('annualWithdrawal');
                    if (params.has('retirementStockAllocation')) {
                        document.getElementById('retirementStockAllocation').value = params.get('retirementStockAllocation');
                        const label = document.getElementById('retirementStockAllocationValue');
                        if (label) label.textContent = params.get('retirementStockAllocation');
                    }
                    if (params.has('withdrawalAdjustment')) document.getElementById('withdrawalAdjustment').checked = params.get('withdrawalAdjustment') === 'true';
                    if (params.has('taxRate')) document.getElementById('taxRate').value = params.get('taxRate');
                    if (params.has('retirementLifeExpectancy')) document.getElementById('retirementLifeExpectancy').value = params.get('retirementLifeExpectancy');
                    if (params.has('simulationCount')) document.getElementById('simulationCount').value = params.get('simulationCount');
                    // Income sources
                    if (params.has('includeSS')) document.getElementById('includeSS').checked = params.get('includeSS') === 'true';
                    if (params.has('ssMonthlyBenefit')) document.getElementById('ssMonthlyBenefit').value = params.get('ssMonthlyBenefit');
                    if (params.has('ssClaimingAge')) document.getElementById('ssClaimingAge').value = params.get('ssClaimingAge');
                    if (params.has('includeSpouseSS')) document.getElementById('includeSpouseSS').checked = params.get('includeSpouseSS') === 'true';
                    if (params.has('spouseSSMonthlyBenefit')) document.getElementById('spouseSSMonthlyBenefit').value = params.get('spouseSSMonthlyBenefit');
                    if (params.has('spouseSSClaimingAge')) document.getElementById('spouseSSClaimingAge').value = params.get('spouseSSClaimingAge');
                    if (params.has('includeOtherIncome')) document.getElementById('includeOtherIncome').checked = params.get('includeOtherIncome') === 'true';
                    if (params.has('monthlyPension')) document.getElementById('monthlyPension').value = params.get('monthlyPension');
                    if (params.has('pensionStartAge')) document.getElementById('pensionStartAge').value = params.get('pensionStartAge');
                    if (params.has('monthlyOtherIncome')) document.getElementById('monthlyOtherIncome').value = params.get('monthlyOtherIncome');
                    if (params.has('otherIncomeDuration')) document.getElementById('otherIncomeDuration').value = params.get('otherIncomeDuration');
                    runRetirementSimulation();
                } else {
                    // Accumulation tab (default)
                    if (params.has('currentAge')) document.getElementById('currentAge').value = params.get('currentAge');
                    if (params.has('currentSavings')) document.getElementById('currentSavings').value = params.get('currentSavings');
                    if (params.has('income')) document.getElementById('income').value = params.get('income');
                    if (params.has('expenses')) document.getElementById('expenses').value = params.get('expenses');
                    if (params.has('targetAmount')) document.getElementById('targetAmount').value = params.get('targetAmount');
                    if (params.has('stockAllocation')) {
                        document.getElementById('stockAllocation').value = params.get('stockAllocation');
                        const label = document.getElementById('stockAllocationValue');
                        if (label) label.textContent = params.get('stockAllocation');
                    }
                    if (params.has('incomeGrowth')) document.getElementById('incomeGrowth').value = params.get('incomeGrowth');
                    if (params.has('savingsSimulationCount')) document.getElementById('savingsSimulationCount').value = params.get('savingsSimulationCount');
                    runAccumulationSimulation();
                }
            }
            applySharedParameters();

            // Update global target amount + listen for changes
            const targetInput = document.getElementById('targetAmount');
            if (targetInput) {
                targetInput.addEventListener('change', updateGlobalTargetAmount);
                updateGlobalTargetAmount();
            }

            // Initialize table sorting after a delay
            setTimeout(initializeTableSorting, 1000);

            // Close simulation detail modal
            const closeButton = document.getElementById('closeSimDetailModal');
            if (closeButton) {
                closeButton.addEventListener('click', function() {
                    document.getElementById('simulation-detail-modal').style.display = 'none';
                });
            }
            window.addEventListener('click', function(event) {
                const modal = document.getElementById('simulation-detail-modal');
                if (modal && event.target === modal) {
                    modal.style.display = 'none';
                }
            });

            // Pagination buttons
            const prevPageBtn = document.getElementById('prevPageBtn');
            if (prevPageBtn) {
                prevPageBtn.addEventListener('click', function() {
                    if (currentPage > 1) {
                        displaySimulationTable(currentPage - 1);
                    }
                });
            }
            const nextPageBtn = document.getElementById('nextPageBtn');
            if (nextPageBtn) {
                nextPageBtn.addEventListener('click', function() {
                    if (currentPage < Math.ceil(allSimulations.length / rowsPerPage)) {
                        displaySimulationTable(currentPage + 1);
                    }
                });
            }

            // Force income growth field position
            function forceFieldPosition() {
                const incomeGrowthDiv = document.querySelector('div:has(label[for="incomeGrowth"])');
                const annualIncomeDiv = document.querySelector('div:has(label[for="annualIncome"])');
                if (incomeGrowthDiv && annualIncomeDiv && annualIncomeDiv.nextElementSibling !== incomeGrowthDiv) {
                    if (incomeGrowthDiv.parentNode) {
                        incomeGrowthDiv.parentNode.removeChild(incomeGrowthDiv);
                    }
                    annualIncomeDiv.insertAdjacentElement('afterend', incomeGrowthDiv);
                }
            }
            forceFieldPosition();
            setTimeout(forceFieldPosition, 100);
            setTimeout(forceFieldPosition, 500);

            // MutationObserver for field position fix
            try {
                const observer = new MutationObserver(mutations => {
                    forceFieldPosition();
                });
                observer.observe(document.body, { childList: true, subtree: true });
            } catch (error) {
                console.log("Error setting up mutation observer:", error);
            }
        });
        
        // Function to show a specific tab and hide others
        function showTab(tabId) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.style.display = 'none';
            });
            
            // Show the selected tab
            const selectedTab = document.getElementById(tabId);
            if (selectedTab) {
                selectedTab.style.display = 'block';
            }
        }

        // Function to run the accumulation simulation
        function runAccumulationSimulation() {
            // Update global target amount at the start of simulation
            updateGlobalTargetAmount();
            
            // Get the button element
            const button = document.getElementById('runSimulation');
            const originalButtonText = button.textContent;
            
            // Disable button and show loading state
            button.disabled = true;
            button.textContent = 'Running Simulation...';
            
            // Get input values
            const currentAge = parseInt(document.getElementById('currentAge').value);
            const currentSavings = parseFloat(document.getElementById('currentSavings').value.replace(/[^0-9.]/g, ''));
            const income = parseFloat(document.getElementById('income').value.replace(/[^0-9.]/g, ''));
            const expenses = parseFloat(document.getElementById('expenses').value.replace(/[^0-9.]/g, ''));
            const targetAmount = parseFloat(document.getElementById('targetAmount').value.replace(/[^0-9.]/g, ''));
            const stockAllocation = parseInt(document.getElementById('stockAllocation').value) / 100;
            const incomeGrowth = parseFloat(document.getElementById('incomeGrowth').value) / 100;
            const simulationCount = parseInt(document.getElementById('savingsSimulationCount').value);
            
            // Validate inputs
            if (isNaN(currentAge) || isNaN(currentSavings) || isNaN(income) || 
                isNaN(expenses) || isNaN(targetAmount) || isNaN(stockAllocation) || isNaN(incomeGrowth) || isNaN(simulationCount)) {
                showValidationError('Please fill in all fields with valid numbers.');
                button.disabled = false;
                button.textContent = originalButtonText;
                return;
            }
            if (currentAge < 0 || currentSavings < 0 || income < 0 || expenses < 0 || targetAmount < 0) {
                showValidationError('Values cannot be negative.');
                button.disabled = false;
                button.textContent = originalButtonText;
                return;
            }
            if (currentAge > MAX_AGE) { showValidationError(`Current age seems too high (max ${MAX_AGE}).`); button.disabled = false; button.textContent = originalButtonText; return; }
            if (currentSavings > MAX_INPUT_VALUE || income > MAX_INPUT_VALUE || expenses > MAX_INPUT_VALUE || targetAmount > MAX_INPUT_VALUE) {
                showValidationError(`One or more values exceed the maximum allowed (${formatCurrency(MAX_INPUT_VALUE)}).`); button.disabled = false; button.textContent = originalButtonText; return;
            }
            if (expenses > income * 2) { showValidationError('Warning: Your expenses are more than double your income. Please verify your inputs.'); }
            if (targetAmount < currentSavings) { showValidationError('Warning: Your target amount is less than your current savings. You have already reached your goal!'); }
            
            // Run simulation with small delay to allow UI to update
            setTimeout(() => {
                const maxYears = 50;
                const simulationResults = [];
                
                for (let i = 0; i < simulationCount; i++) {
                    let portfolio = currentSavings;
                    let years = 0;
                    let reachedGoal = false;
                    const yearlyData = [];
                    
                    let currentIncome = income;
                    let currentExpenses = expenses;
                    
                    while (years < maxYears && !reachedGoal) {
                        // Get random market return and inflation
                        const yearData = historicalData[Math.floor(Math.random() * historicalData.length)];
                        
                        // Calculate portfolio return based on allocation
                        const portfolioReturn = (yearData.marketReturn * stockAllocation) + 
                                              (DEFAULT_BOND_RETURN * (1 - stockAllocation));
                        
                        // Update portfolio value with returns
                        portfolio = portfolio * (1 + portfolioReturn);
                        
                        // Update income and expenses with inflation and growth
                        currentExpenses = currentExpenses * (1 + yearData.inflation);
                        currentIncome = currentIncome * (1 + incomeGrowth) * (1 + yearData.inflation);
                        
                        // Calculate annual savings (income - expenses)
                        const annualSavings = Math.max(0, currentIncome - currentExpenses);
                        
                        // Add annual savings to portfolio
                        portfolio += annualSavings;
                        
                        // Store data for this year
                        yearlyData.push({
                            year: currentAge + years,
                            balance: portfolio,
                            return: portfolioReturn,
                            inflation: yearData.inflation,
                            income: currentIncome,
                            expenses: currentExpenses,
                            contribution: annualSavings
                        });
                        
                        // Check if goal has been reached
                        if (portfolio >= targetAmount) {
                            reachedGoal = true;
                        }
                        
                        years++;
                    }
                    
                    // Store simulation results
                    simulationResults.push({
                        yearsToGoal: reachedGoal ? years : null,
                        reachedGoal: reachedGoal,
                        finalBalance: portfolio,
                        yearlyData: yearlyData
                    });
                }
                
                // Calculate years to target for each simulation
                simulationResults.forEach(simulation => {
                    let yearsToTarget = null;
                    for (let i = 0; i < simulation.yearlyData.length; i++) {
                        if (simulation.yearlyData[i].balance >= targetAmount) {
                            yearsToTarget = i; // This is years from start, not the absolute year
                            break;
                        }
                    }
                    simulation.yearsToTarget = yearsToTarget;
                });
                
                // Sort simulations by time to reach target (properly handling cases where target isn't reached)
                const sortedSimulations = [...simulationResults].sort((a, b) => {
                    if (!a.yearsToTarget && !b.yearsToTarget) return 0;
                    if (!a.yearsToTarget) return 1; // Simulations that don't reach target go last
                    if (!b.yearsToTarget) return -1;
                    return a.yearsToTarget - b.yearsToTarget;
                });
                
                console.log("Savings simulations completed:", simulationResults.length);
                
                // Find the median years to target
                const medianIndex = Math.floor(sortedSimulations.length * 0.5);
                const medianSimulation = sortedSimulations[medianIndex];
                const median = medianSimulation.yearsToTarget !== null ? medianSimulation.yearsToTarget : ">50";
                
                // Also update these to use the same sorted array
                const p10 = sortedSimulations[Math.floor(sortedSimulations.length * 0.1)].yearsToTarget;
                const p90 = sortedSimulations[Math.floor(sortedSimulations.length * 0.9)].yearsToTarget;
                
                // Store the median simulation for other functions to use
                window.medianSimulation = medianSimulation;
                
                // Update UI with results
                document.getElementById('yearsToGoal').textContent = 
                    typeof median === 'number' ? `${median} years` : "25+ years";
                
                // Safely update resultTargetAmount if it exists
                const resultTargetElement = document.getElementById('resultTargetAmount');
                if (resultTargetElement) {
                    resultTargetElement.textContent = '$' + targetAmount.toLocaleString();
                }
                
                // Create charts (with error handling)
                try { createContributionImpactChart(simulationResults); } catch(e) { console.error('Chart error (contribution):', e); }
                try { createYearsDistributionChart(sortedSimulations.map(sim => sim.yearsToTarget)); } catch(e) { console.error('Chart error (distribution):', e); }
                try { createMilestones(simulationResults); } catch(e) { console.error('Chart error (milestones):', e); }
                
                // Store all simulations for table display
                allSimulations = [...simulationResults];
                
                // Display the first page of simulations
                displaySimulationTable(1);
                
                // Show results
                document.getElementById('results').style.display = 'flex'; // Change to flex
                document.getElementById('results').style.flexDirection = 'column'; // Add flex-direction
                // document.getElementById('results').style.gridTemplateColumns = '1fr'; // Remove grid style
                
                // Reset button
                button.disabled = false;
                button.textContent = originalButtonText;
                
                // Update this line to use the new ID "yearsToGoal" instead of "medianYearsToGoal"
                document.getElementById('yearsToGoal').textContent = median;
                initializeTableSorting(); // Initialize sorting after table is created
                
                // Scroll to the results section, accounting for the fixed header
                const resultsElement = document.getElementById('results');
                const header = document.querySelector('.app-header');
                const headerHeight = header ? header.offsetHeight : 0;
                
                // Calculate target scroll position
                const elementPosition = resultsElement.getBoundingClientRect().top + window.pageYOffset;
                const offsetPosition = elementPosition - headerHeight - 10; // 10px padding

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }, 50);
        }

        // Function to run the retirement simulation
        function runRetirementSimulation() {
            console.log("Running retirement simulation...");
            
            // Get the button element
            const button = document.getElementById('runRetirementSimulation');
            const originalButtonText = button.textContent;
            
            // Disable button and show loading state
            button.disabled = true;
            button.textContent = 'Running Simulation...';
            
            // Get input values
            const retirementAge = parseInt(document.getElementById('retirementAge').value);
            const retirementSavings = parseFloat(document.getElementById('retirementSavings').value.replace(/[^0-9.]/g, ''));
            const annualWithdrawal = parseFloat(document.getElementById('annualWithdrawal').value.replace(/[^0-9.]/g, ''));
            const adjustForInflation = document.getElementById('withdrawalAdjustment').checked;
            const taxRate = parseFloat(document.getElementById('taxRate').value) / 100;
            const stockAllocation = parseInt(document.getElementById('retirementStockAllocation').value) / 100;
            const simulationCount = parseInt(document.getElementById('simulationCount').value);
            const lifeExpectancy = parseInt(document.getElementById('retirementLifeExpectancy').value);

            // Income sources
            const includeSS = document.getElementById('includeSS').checked;
            const ssMonthlyBenefit = parseFloat((document.getElementById('ssMonthlyBenefit').value || '0').replace(/[^0-9.]/g, '')) || 0;
            const ssClaimingAge = parseInt(document.getElementById('ssClaimingAge').value) || 67;
            const includeSpouseSS = document.getElementById('includeSpouseSS').checked;
            const spouseSSMonthlyBenefit = parseFloat((document.getElementById('spouseSSMonthlyBenefit').value || '0').replace(/[^0-9.]/g, '')) || 0;
            const spouseSSClaimingAge = parseInt(document.getElementById('spouseSSClaimingAge').value) || 67;
            const includeOtherIncome = document.getElementById('includeOtherIncome').checked;
            const monthlyPension = parseFloat((document.getElementById('monthlyPension').value || '0').replace(/[^0-9.]/g, '')) || 0;
            const pensionStartAge = parseInt(document.getElementById('pensionStartAge').value) || 65;
            const monthlyOtherIncome = parseFloat((document.getElementById('monthlyOtherIncome').value || '0').replace(/[^0-9.]/g, '')) || 0;
            const otherIncomeDuration = parseInt(document.getElementById('otherIncomeDuration').value) || 0;

            // Compute base annual SS benefits adjusted for claiming age
            const ssAnnualBase = ssMonthlyBenefit * (SS_AGE_FACTORS[ssClaimingAge] || 1.0) * 12;
            const spouseSSAnnualBase = spouseSSMonthlyBenefit * (SS_AGE_FACTORS[spouseSSClaimingAge] || 1.0) * 12;
            const annualPension = monthlyPension * 12;
            const annualOtherIncome = monthlyOtherIncome * 12;
            
            // Validate inputs
            if (isNaN(retirementAge) || isNaN(retirementSavings) || isNaN(annualWithdrawal) || 
                isNaN(taxRate) || isNaN(stockAllocation) || isNaN(lifeExpectancy)) {
                showValidationError('Please fill in all fields with valid numbers.');
                button.disabled = false;
                button.textContent = originalButtonText;
                return;
            }
            if (retirementSavings < 0 || annualWithdrawal < 0 || taxRate < 0) {
                showValidationError('Values cannot be negative.');
                button.disabled = false;
                button.textContent = originalButtonText;
                return;
            }
            if (retirementAge > MAX_AGE) { showValidationError(`Retirement age seems too high (max ${MAX_AGE}).`); button.disabled = false; button.textContent = originalButtonText; return; }
            if (retirementSavings > MAX_INPUT_VALUE || annualWithdrawal > MAX_INPUT_VALUE) {
                showValidationError(`One or more values exceed the maximum allowed (${formatCurrency(MAX_INPUT_VALUE)}).`); button.disabled = false; button.textContent = originalButtonText; return;
            }
            if (lifeExpectancy <= 0) { showValidationError('Retirement length must be positive.'); button.disabled = false; button.textContent = originalButtonText; return; }
            
            console.log("Inputs validated, running simulations with:", {
                retirementAge,
                retirementSavings,
                annualWithdrawal,
                adjustForInflation,
                taxRate,
                stockAllocation,
                simulationCount,
                lifeExpectancy
            });
            
            // Run simulation with small delay to allow UI to update
            setTimeout(() => {
                try {
                    const simulationResults = [];
                    
                    for (let i = 0; i < simulationCount; i++) {
                        let portfolio = retirementSavings;
                        let years = 0;
                        let ranOutOfMoney = false;
                        const yearlyData = [];
                        let currentWithdrawal = annualWithdrawal;
                        let totalWithdrawn = 0;
                        let totalIncomeReceived = 0;

                        // COLA-adjusted SS benefits (grow with inflation each year)
                        let currentSSBenefit = ssAnnualBase;
                        let currentSpouseSSBenefit = spouseSSAnnualBase;
                        let yearsWithOtherIncome = 0;
                        
                        while (years < lifeExpectancy && !ranOutOfMoney) {
                            // Get random market return and inflation
                            const randomIndex = Math.floor(Math.random() * historicalData.length);
                            const yearData = historicalData[randomIndex];
                            const currentAge = retirementAge + years;
                            
                            // Calculate portfolio return based on allocation
                            const portfolioReturn = (yearData.marketReturn * stockAllocation) + 
                                                  (DEFAULT_BOND_RETURN * (1 - stockAllocation));
                            
                            // Update portfolio value with returns (at start of year)
                            portfolio = portfolio * (1 + portfolioReturn);
                            
                            // Calculate withdrawal amount (adjusted for inflation if selected)
                            if (adjustForInflation && years > 0) {
                                currentWithdrawal = currentWithdrawal * (1 + yearData.inflation);
                            }

                            // Apply COLA to SS benefits (after year 0)
                            if (years > 0) {
                                currentSSBenefit = currentSSBenefit * (1 + yearData.inflation);
                                currentSpouseSSBenefit = currentSpouseSSBenefit * (1 + yearData.inflation);
                            }

                            // Calculate income from all sources
                            let ssIncome = 0;
                            if (includeSS && currentAge >= ssClaimingAge) {
                                ssIncome += currentSSBenefit;
                            }
                            if (includeSpouseSS && currentAge >= spouseSSClaimingAge) {
                                ssIncome += currentSpouseSSBenefit;
                            }

                            let pensionInc = 0;
                            let otherInc = 0;
                            if (includeOtherIncome) {
                                if (currentAge >= pensionStartAge) {
                                    pensionInc = annualPension; // Fixed, no COLA
                                }
                                if (otherIncomeDuration === 0 || yearsWithOtherIncome < otherIncomeDuration) {
                                    otherInc = annualOtherIncome;
                                    if (annualOtherIncome > 0) yearsWithOtherIncome++;
                                }
                            }

                            const totalIncome = ssIncome + pensionInc + otherInc;
                            totalIncomeReceived += totalIncome;
                            
                            // Calculate pre-tax withdrawal needed (tax-engine integration)
                            let preTaxWithdrawal;
                            if (typeof window.calculateWithdrawalTax === 'function' && typeof window.getTaxSettings === 'function') {
                                const _taxSettings = window.getTaxSettings();
                                const _taxResult = window.calculateWithdrawalTax(currentWithdrawal,
                                    { socialSecurity: ssIncome, pension: pensionInc, otherOrdinary: otherInc }, _taxSettings);
                                preTaxWithdrawal = _taxResult.preTaxWithdrawal;
                            } else {
                                preTaxWithdrawal = currentWithdrawal / (1 - taxRate);
                            }

                            // Reduce portfolio withdrawal by income sources
                            const neededFromPortfolio = Math.max(0, preTaxWithdrawal - totalIncome);
                            
                            // Withdraw from portfolio
                            portfolio -= neededFromPortfolio;
                            totalWithdrawn += currentWithdrawal; // Track after-tax withdrawals
                            
                            // Store data for this year
                            yearlyData.push({
                                age: currentAge,
                                balance: Math.max(0, portfolio),
                                return: portfolioReturn,
                                inflation: yearData.inflation,
                                withdrawal: neededFromPortfolio,
                                afterTaxWithdrawal: currentWithdrawal,
                                ssIncome: ssIncome,
                                otherIncome: pensionInc + otherInc,
                                totalIncome: totalIncome
                            });
                            
                            // Check if ran out of money
                            if (portfolio <= 0) {
                                ranOutOfMoney = true;
                                portfolio = 0;
                            }
                            
                            years++;
                        }
                        
                        // Store simulation results
                        simulationResults.push({
                            ranOutOfMoney: ranOutOfMoney,
                            yearsLasted: ranOutOfMoney ? years : lifeExpectancy,
                            finalBalance: portfolio,
                            yearlyData: yearlyData,
                            totalWithdrawn: totalWithdrawn,
                            totalIncomeReceived: totalIncomeReceived
                        });
                    }
                    
                    console.log("Simulations completed:", simulationResults.length);
                    
                    // Calculate success rate
                    const successfulSimulations = simulationResults.filter(sim => !sim.ranOutOfMoney);
                    const successRate = (successfulSimulations.length / simulationResults.length) * 100;
                    
                    // Update UI with results
                    document.getElementById('successRate').textContent = `${Math.round(successRate)}%`;
                    
                    // Trigger confetti if success rate is over 80%
                    if (successRate >= 80) {
                        // Confetti animation
                        const duration = 3 * 1000;
                        const animationEnd = Date.now() + duration;
                        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };
                        
                        function randomInRange(min, max) {
                            return Math.random() * (max - min) + min;
                        }
                        
                        const interval = setInterval(function() {
                            const timeLeft = animationEnd - Date.now();
                            
                            if (timeLeft <= 0) {
                                return clearInterval(interval);
                            }
                            
                            const particleCount = 50 * (timeLeft / duration);
                            
                            // Since particles fall down, start from the top
                            confetti(Object.assign({}, defaults, { 
                                particleCount, 
                                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
                                colors: ['#4f46e5', '#818cf8', '#3730a3', '#059669']
                            }));
                            confetti(Object.assign({}, defaults, { 
                                particleCount, 
                                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
                                colors: ['#4f46e5', '#818cf8', '#3730a3', '#059669']
                            }));
                        }, 250);
                        
                        // Show success message
                        const successMessage = document.getElementById('success-message');
                        successMessage.style.display = 'block';
                        
                        // Hide success message after 5 seconds
                        setTimeout(() => {
                            successMessage.classList.add('hide');
                            setTimeout(() => {
                                successMessage.style.display = 'none';
                                successMessage.classList.remove('hide');
                            }, 500); // Wait for slide-out animation to complete
                        }, 5000);
                    }
                    
                    // Create retirement charts (with error handling)
                    try { createRetirementBalanceChart(simulationResults, retirementAge, lifeExpectancy); } catch(e) { console.error('Chart error (balance):', e); }
                    try { createSurvivalChart(simulationResults, retirementAge, lifeExpectancy); } catch(e) { console.error('Chart error (survival):', e); }
                    
                    // Update summary statistics
                    updateRetirementSummary(simulationResults, retirementAge);
                    
                    // Show results
                    document.getElementById('retirement-results').style.display = 'flex';
                    document.getElementById('retirement-results').style.flexDirection = 'column';
                    
                    // Scroll to results
                    // document.getElementById('retirement-results').scrollIntoView({ behavior: 'smooth' });
                    
                    // Improved scroll behavior that accounts for fixed header
                    const resultsElement = document.getElementById('retirement-results');
                    const header = document.querySelector('.app-header');
                    const headerHeight = header ? header.offsetHeight : 0;
                    
                    // Calculate target scroll position
                    const elementPosition = resultsElement.getBoundingClientRect().top + window.pageYOffset;
                    const offsetPosition = elementPosition - headerHeight - 20; // 20px additional padding
                    
                    window.scrollTo({
                        top: offsetPosition,
                        behavior: 'smooth'
                    });
                    
                    // Populate the simulations table
                    populateSimulationsTable(simulationResults);
                    
                } catch (error) {
                    console.error("Error in retirement simulation:", error);
                    alert("An error occurred during the simulation. Please check console for details.");
                }
                
                // Reset button
                button.disabled = false;
                button.textContent = originalButtonText;
            }, 50);
        }

        // Make sure all the chart creation functions are also in the global scope
        function createContributionImpactChart(simulationResults) {
            // Use the stored median simulation
            const medianSimulation = window.medianSimulation;
            if (!medianSimulation) return;
            
            // Extract the yearly data
            const yearlyData = medianSimulation.yearlyData;
            
            // Prepare data for stacked area chart
            const labels = yearlyData.map(d => d.year);
            
            // Get initial investment amount
            const initialInvestment = parseFloat(document.getElementById('currentSavings').value) || 0;
            
            // Calculate cumulative contributions and returns
            let cumulativeContributions = 0;
            let cumulativeReturns = 0;
            
            const initialInvestmentData = [];
            const contributionsData = [];
            const returnsData = [];
            const totalData = [];
            
            yearlyData.forEach(yearData => {
                // Initial investment stays constant
                initialInvestmentData.push(initialInvestment);
                
                // Add new contributions for this year
                cumulativeContributions += yearData.contribution;
                contributionsData.push(cumulativeContributions);
                
                // Calculate total balance and returns
                const balance = yearData.balance;
                cumulativeReturns = balance - cumulativeContributions - initialInvestment;
                returnsData.push(Math.max(0, cumulativeReturns)); // Ensure returns don't go negative
                
                // Calculate total for tooltip
                totalData.push(initialInvestment + cumulativeContributions + Math.max(0, cumulativeReturns));
            });
            
            // Create chart
            const ctx = document.getElementById('growthSourcesChart').getContext('2d');
            
            // Check if chart exists before destroying
            if (window.contributionImpactChart && typeof window.contributionImpactChart.destroy === 'function') {
                window.contributionImpactChart.destroy();
            }
            
            window.contributionImpactChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Initial Investment',
                            data: initialInvestmentData,
                            backgroundColor: 'rgba(59, 130, 246, 0.5)', // Blue
                            borderColor: 'rgba(59, 130, 246, 1)',
                            fill: true
                        },
                        {
                            label: 'New Contributions',
                            data: contributionsData,
                            backgroundColor: 'rgba(99, 102, 241, 0.5)', // Indigo/Purple
                            borderColor: 'rgba(99, 102, 241, 1)',
                            fill: true
                        },
                        {
                            label: 'Investment Returns',
                            data: returnsData,
                            backgroundColor: 'rgba(16, 185, 129, 0.5)', // Green
                            borderColor: 'rgba(16, 185, 129, 1)',
                            fill: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Portfolio Growth Components'
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: function(context) {
                                    return context.dataset.label + ': $' + context.parsed.y.toLocaleString();
                                },
                                footer: function(tooltipItems) {
                                    const dataIndex = tooltipItems[0].dataIndex;
                                    const total = totalData[dataIndex];
                                    return 'Total Portfolio: $' + total.toLocaleString();
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Age'
                            }
                        },
                        y: {
                            stacked: true,
                            title: {
                                display: true,
                                text: 'Balance ($)'
                            },
                            ticks: {
                                callback: function(value) {
                                    return '$' + value.toLocaleString();
                                }
                            }
                        }
                    }
                }
            });
        }
        
        function createDistributionChart(yearsArray) {
            // Group by years
            const yearCounts = {};
            yearsArray.forEach(years => {
                if (!yearCounts[years]) yearCounts[years] = 0;
                yearCounts[years]++;
            });
            
            // Sort years and get counts
            const sortedYears = Object.keys(yearCounts).map(Number).sort((a, b) => a - b);
            const counts = sortedYears.map(year => yearCounts[year]);
            
            // Calculate percentages
            const percentages = counts.map(count => (count / yearsArray.length) * 100);
            
            // Create chart
            const ctx = document.getElementById('distributionChart').getContext('2d');
            
            // Clear previous chart if exists
            if (window.distributionChart && typeof window.distributionChart.destroy === 'function') {
                window.distributionChart.destroy();
            }
            
            window.distributionChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: sortedYears.map(year => year + ' years'),
                    datasets: [{
                        label: 'Percentage of Simulations',
                        data: percentages,
                        backgroundColor: 'rgba(99, 102, 241, 0.7)',
                        borderColor: 'rgba(99, 102, 241, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Years to Reach Retirement Goal'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.raw.toFixed(1) + '% of simulations';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Years'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Percentage of Simulations'
                            },
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // Fix the age calculation in the createMilestones function
        function createMilestones(simulationResults) {
            // Use the stored median simulation rather than recalculating it
            const medianSimulation = window.medianSimulation;
            if (!medianSimulation) return;
            
            // Get target amount
            const targetAmount = parseFloat(document.getElementById('targetAmount').value);
            
            // Calculate milestone percentages
            const milestones = [0.25, 0.5, 0.75, 1.0];
            const milestoneAmounts = milestones.map(percent => targetAmount * percent);
            
            // Find years to reach each milestone
            const milestoneYears = [];
            const currentAge = parseInt(document.getElementById('currentAge').value);
            
            milestoneAmounts.forEach(amount => {
                let yearReached = null;
                
                for (let i = 0; i < medianSimulation.yearlyData.length; i++) {
                    if (medianSimulation.yearlyData[i].balance >= amount) {
                        // Store years from start, not the age
                        yearReached = i; // Use the index as years from start instead of yearlyData[i].year
                        break;
                    }
                }
                
                milestoneYears.push(yearReached);
            });
            
            // Update the UI
            const milestoneElements = [
                document.getElementById('milestone25'),
                document.getElementById('milestone50'),
                document.getElementById('milestone75'),
                document.getElementById('milestone100')
            ];
            
            milestoneElements.forEach((element, index) => {
                if (element) {
                    if (milestoneYears[index] !== null) {
                        // Add years from start to current age to get the correct age at milestone
                        const ageAtMilestone = currentAge + milestoneYears[index];
                        
                        element.textContent = `Age ${ageAtMilestone}`;
                        element.parentElement.classList.remove('milestone-unreached');
                    } else {
                        element.textContent = 'Not reached';
                        element.parentElement.classList.add('milestone-unreached');
                    }
                }
            });
            
            // Update milestone amounts (unchanged)
            const amountElements = [
                document.getElementById('milestone25Amount'),
                document.getElementById('milestone50Amount'),
                document.getElementById('milestone75Amount'),
                document.getElementById('milestone100Amount')
            ];
            
            amountElements.forEach((element, index) => {
                if (element) {
                    element.textContent = '$' + Math.round(milestoneAmounts[index]).toLocaleString();
                }
            });
        }
        
        

        // Add these chart creation functions
        function createRetirementBalanceChart(simulationResults, startAge, maxYears) {
            // Sort simulations by final balance to determine percentile ranks
            const sortedByFinalBalance = [...simulationResults].sort((a, b) => a.finalBalance - b.finalBalance);
            
            // Get the specific simulation runs that represent the percentiles
            const p10Index = Math.floor(sortedByFinalBalance.length * 0.1);
            const p50Index = Math.floor(sortedByFinalBalance.length * 0.5);
            const p90Index = Math.floor(sortedByFinalBalance.length * 0.9);
            
            const p10Simulation = sortedByFinalBalance[p10Index];
            const p50Simulation = sortedByFinalBalance[p50Index];
            const p90Simulation = sortedByFinalBalance[p90Index];
            
            // Extract age labels and balance data from each simulation
            const ages = Array.from({length: maxYears + 1}, (_, i) => startAge + i);
            
            // Prepare data from each percentile simulation
            const p10Data = [];
            const p50Data = [];
            const p90Data = [];
            
            // Income data from median simulation
            const incomeData = [];
            const hasIncomeData = p50Simulation.yearlyData.some(y => y.totalIncome > 0);

            // Fill arrays with actual simulation data
            ages.forEach((age, i) => {
                // For 10th percentile simulation
                p10Data.push(i < p10Simulation.yearlyData.length ? 
                    p10Simulation.yearlyData[i].balance : null);
                
                // For 50th percentile (median) simulation
                p50Data.push(i < p50Simulation.yearlyData.length ? 
                    p50Simulation.yearlyData[i].balance : null);
                
                // For 90th percentile simulation
                p90Data.push(i < p90Simulation.yearlyData.length ? 
                    p90Simulation.yearlyData[i].balance : null);

                // Income (median sim)
                incomeData.push(i < p50Simulation.yearlyData.length ?
                    p50Simulation.yearlyData[i].totalIncome || 0 : null);
            });
            
            // Create chart
            const ctx = document.getElementById('retirementBalanceChart').getContext('2d');
            
            // Check if chart exists before destroying
            if (window.retirementBalanceChart && typeof window.retirementBalanceChart.destroy === 'function') {
                window.retirementBalanceChart.destroy();
            }
            
            window.retirementBalanceChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ages,
                    datasets: [
                        {
                            label: '90th Percentile (Optimistic)',
                            data: p90Data,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            fill: false,
                            tension: 0.4,
                            borderWidth: 2
                        },
                        {
                            label: 'Median',
                            data: p50Data,
                            borderColor: '#6366f1',
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                            fill: false,
                            tension: 0.4,
                            borderWidth: 3
                        },
                        {
                            label: '10th Percentile (Conservative)',
                            data: p10Data,
                            borderColor: '#f59e0b',
                            backgroundColor: 'rgba(245, 158, 11, 0.1)',
                            fill: false,
                            tension: 0.4,
                            borderWidth: 2
                        },
                        ...(hasIncomeData ? [{
                            label: 'Annual Income (Median)',
                            data: incomeData,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.15)',
                            fill: true,
                            tension: 0.4,
                            borderWidth: 2,
                            borderDash: [5, 3],
                            yAxisID: 'y1'
                        }] : [])
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return context.dataset.label + ': $' + Math.round(context.raw).toLocaleString();
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Age'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Portfolio Value'
                            },
                            ticks: {
                                callback: function(value) {
                                    return '$' + value.toLocaleString();
                                }
                            }
                        },
                        ...(hasIncomeData ? {
                            y1: {
                                position: 'right',
                                title: { display: true, text: 'Annual Income' },
                                ticks: { callback: function(v) { return '$' + v.toLocaleString(); } },
                                grid: { drawOnChartArea: false },
                                beginAtZero: true
                            }
                        } : {})
                    }
                }
            });
        }
        
        function createSurvivalChart(simulationResults, startAge, maxYears) {
            const endAge = startAge + maxYears;
            const ages = Array.from({length: maxYears + 1}, (_, i) => startAge + i);
            
            // Calculate survival rate at each age
            const survivalRates = ages.map(age => {
                const simsThatSurvivedToAge = simulationResults.filter(sim => {
                    const yearsToThisAge = age - startAge;
                    return !sim.ranOutOfMoney || sim.yearsLasted > yearsToThisAge;
                });
                
                return (simsThatSurvivedToAge.length / simulationResults.length) * 100;
            });
            
            // Create chart
            const ctx = document.getElementById('survivalChart').getContext('2d');
            
            // Check if chart exists before destroying
            if (window.survivalChart && typeof window.survivalChart.destroy === 'function') {
                window.survivalChart.destroy();
            }
            
            window.survivalChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ages,
                    datasets: [{
                        label: 'Survival Probability',
                        data: survivalRates,
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.2)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return 'Probability: ' + context.raw.toFixed(1) + '%';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Age'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Probability of Having Money Left'
                            },
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
                                }
                            },
                            min: 0,
                            max: 100
                        }
                    }
                }
            });
        }
        
        function updateRetirementSummary(simulationResults, startAge) {
            // Calculate median ending balance
            const endingBalances = simulationResults.map(sim => sim.finalBalance).sort((a, b) => a - b);
            const medianEndingBalance = endingBalances[Math.floor(endingBalances.length * 0.5)];
            
            // Calculate average annual return
            let totalReturn = 0;
            let returnCount = 0;
            
            simulationResults.forEach(sim => {
                sim.yearlyData.forEach(year => {
                    totalReturn += year.return;
                    returnCount++;
                });
            });
            
            const avgReturn = returnCount > 0 ? totalReturn / returnCount : 0;
            
            // Calculate total withdrawals (median scenario)
            const sortedByWithdrawals = [...simulationResults].sort((a, b) => a.totalWithdrawn - b.totalWithdrawn);
            const medianWithdrawals = sortedByWithdrawals[Math.floor(sortedByWithdrawals.length * 0.5)].totalWithdrawn;
            
            // Calculate worst case ending age (10th percentile of years lasted)
            const yearsLasted = simulationResults
                .filter(sim => sim.ranOutOfMoney)
                .map(sim => sim.yearsLasted)
                .sort((a, b) => a - b);
            
            const worstCaseYears = yearsLasted.length > 0 ? 
                yearsLasted[Math.floor(yearsLasted.length * 0.1)] : "N/A";
            
            const worstCaseAge = worstCaseYears !== "N/A" ? 
                startAge + worstCaseYears : "Funds not depleted";
            
            // Update UI
            document.getElementById('medianEndingBalance').textContent = 
                `$${Math.round(medianEndingBalance).toLocaleString()}`;
            document.getElementById('retirementAvgReturn').textContent = 
                `${(avgReturn * 100).toFixed(1)}%`;
            document.getElementById('totalWithdrawals').textContent = 
                `$${Math.round(medianWithdrawals).toLocaleString()}`;
            document.getElementById('worstCaseAge').textContent = 
                worstCaseAge !== "N/A" ? worstCaseAge : "Funds not depleted";

            // Update SS/income coverage display
            const ssCoverageItem = document.getElementById('ssCoverageItem');
            const hasIncome = simulationResults.some(sim => sim.totalIncomeReceived > 0);
            if (ssCoverageItem) {
                if (hasIncome) {
                    ssCoverageItem.style.display = 'block';
                    // Calculate coverage from median simulation
                    const medianSim = sortedByWithdrawals[Math.floor(sortedByWithdrawals.length * 0.5)];
                    const totalExpenses = medianSim.yearlyData.reduce((s, y) => s + (y.afterTaxWithdrawal / (1 - 0)), 0); // pre-tax
                    const totalExpensesPT = medianSim.yearlyData.reduce((s, y) => s + y.withdrawal + y.totalIncome, 0);
                    const coveragePct = totalExpensesPT > 0 ? (medianSim.totalIncomeReceived / totalExpensesPT * 100) : 0;
                    document.getElementById('ssCoveragePercent').textContent = `${Math.round(coveragePct)}%`;
                } else {
                    ssCoverageItem.style.display = 'none';
                }
            }
        }

        // Add this to your JavaScript section
        function populateSimulationsTable(simulationResults) {
            const tableBody = document.getElementById('simulations-table-body');
            tableBody.innerHTML = '';
            
            // Find median simulation index
            const sortedByBalance = [...simulationResults].sort((a, b) => a.finalBalance - b.finalBalance);
            const medianIndex = Math.floor(sortedByBalance.length / 2);
            const medianSimulation = sortedByBalance[medianIndex];
            
            // Add data attribute to identify median simulation
            let medianSimIndex = -1;
            for (let i = 0; i < simulationResults.length; i++) {
                if (simulationResults[i] === medianSimulation) {
                    medianSimIndex = i;
                    break;
                }
            }
            
            // Show all simulations
            for (let i = 0; i < simulationResults.length; i++) {
                const sim = simulationResults[i];
                const row = document.createElement('tr');
                
                // Add data attributes for filtering
                row.setAttribute('data-success', sim.ranOutOfMoney ? 'false' : 'true');
                row.setAttribute('data-scenario', i + 1);
                
                // Mark median simulation
                if (i === medianSimIndex) {
                    row.classList.add('median-row');
                    row.setAttribute('data-median', 'true');
                } else {
                    row.setAttribute('data-median', 'false');
                }
                
                // Scenario number
                const scenarioCell = document.createElement('td');
                scenarioCell.textContent = `#${i + 1}`;
                
                // Add median badge if this is the median simulation
                if (i === medianSimIndex) {
                    const medianBadge = document.createElement('span');
                    medianBadge.className = 'median-badge';
                    medianBadge.textContent = 'MEDIAN';
                    scenarioCell.appendChild(medianBadge);
                }
                
                row.appendChild(scenarioCell);
                
                // End balance
                const balanceCell = document.createElement('td');
                balanceCell.textContent = `$${Math.round(sim.finalBalance).toLocaleString()}`;
                row.appendChild(balanceCell);
                
                // Years lasted
                const yearsCell = document.createElement('td');
                yearsCell.textContent = sim.ranOutOfMoney ? 
                    `${sim.yearsLasted}` : 
                    `${sim.yearsLasted} (full period)`;
                row.appendChild(yearsCell);
                
                // Status
                const statusCell = document.createElement('td');
                statusCell.textContent = sim.ranOutOfMoney ? '❌' : '✅'; // Use emoji
                statusCell.style.textAlign = 'center'; // Center the emoji
                row.appendChild(statusCell);
                
                // Action
                const actionCell = document.createElement('td');
                const viewButton = document.createElement('button');
                viewButton.className = 'view-details-btn';
                viewButton.textContent = 'View Details';
                viewButton.onclick = function() {
                    showSimulationDetails(sim, i + 1);
                };
                actionCell.appendChild(viewButton);
                row.appendChild(actionCell);
                
                tableBody.appendChild(row);
            }
            
            // Set up filter buttons
            setupFilterButtons();
        }

        // Function to set up filter buttons
        function setupFilterButtons() {
            const filterButtons = document.querySelectorAll('.filter-btn');
            
            filterButtons.forEach(button => {
                button.addEventListener('click', function() {
                    // Update active button state
                    filterButtons.forEach(btn => btn.classList.remove('active'));
                    this.classList.add('active');
                    
                    // Get filter type
                    const filterType = this.getAttribute('data-filter');
                    
                    // Apply filter
                    const rows = document.querySelectorAll('#simulations-table-body tr');
                    
                    rows.forEach(row => {
                        if (filterType === 'all') {
                            row.style.display = '';
                        } else if (filterType === 'success') {
                            row.style.display = row.getAttribute('data-success') === 'true' ? '' : 'none';
                        } else if (filterType === 'failure') {
                            row.style.display = row.getAttribute('data-success') === 'false' ? '' : 'none';
                        } else if (filterType === 'median') {
                            row.style.display = row.getAttribute('data-median') === 'true' ? '' : 'none';
                        }
                    });
                });
            });
        }

        // First showSimulationDetails removed — using the robust version below

        // Helper function to calculate average return
        function getAvgReturn(simulation) {
            let totalReturn = 0;
            simulation.yearlyData.forEach(year => totalReturn += year.return);
            const avgReturn = simulation.yearlyData.length > 0 ? totalReturn / simulation.yearlyData.length : 0;
            return (avgReturn * 100).toFixed(1);
        }

        // Helper function to generate yearly data rows
        function generateYearlyDataRows(simulation) {
            const currentAge = parseInt(document.getElementById('currentAge').value);
            let rows = '';
            
            simulation.yearlyData.forEach((yearData, index) => {
                // Check which type of simulation we're dealing with (savings vs retirement)
                const isRetirementSim = yearData.withdrawal !== undefined;
                
                const incomeCol = isRetirementSim && yearData.totalIncome != null
                    ? `<td style="padding: 10px;">$${Math.round(yearData.totalIncome).toLocaleString()}</td>`
                    : `<td style="padding: 10px;">-</td>`;

                rows += `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 10px;">${index + 1}</td>
                        <td style="padding: 10px;">${currentAge + index}</td>
                        <td style="padding: 10px;">${(yearData.return * 100).toFixed(1)}%</td>
                        <td style="padding: 10px;">${isRetirementSim ? 
                            `$${yearData.withdrawal ? Math.round(yearData.withdrawal).toLocaleString() : '0'}` : 
                            `$${yearData.contribution ? yearData.contribution.toLocaleString() : '0'}`}</td>
                        ${incomeCol}
                        <td style="padding: 10px;">$${yearData.balance.toLocaleString()}</td>
                    </tr>
                `;
            });
            
            return rows;
        }

        // Add this to the bottom of your JavaScript section
        function setupShareButton() {
            const shareButton = document.getElementById('shareScenarioButton');
            const toast = document.getElementById('toast');
            
            // Get inputs for sharing — encodes ALL fields from the active tab
            function getShareableUrl() {
                const url = new URL(window.location.href);
                const params = new URLSearchParams();
                
                // Determine active tab
                const accumulationTab = document.getElementById('accumulation-tab');
                const isAccumulation = accumulationTab && accumulationTab.style.display !== 'none';
                
                if (!isAccumulation) {
                    // Retirement tab fields
                    params.append('tab', 'retirement');
                    params.append('retirementAge', document.getElementById('retirementAge').value);
                    params.append('retirementSavings', document.getElementById('retirementSavings').value);
                    params.append('annualWithdrawal', document.getElementById('annualWithdrawal').value);
                    params.append('retirementStockAllocation', document.getElementById('retirementStockAllocation').value);
                    params.append('withdrawalAdjustment', document.getElementById('withdrawalAdjustment').checked);
                    params.append('taxRate', document.getElementById('taxRate').value);
                    params.append('retirementLifeExpectancy', document.getElementById('retirementLifeExpectancy').value);
                    params.append('simulationCount', document.getElementById('simulationCount').value);
                    // Income sources
                    params.append('includeSS', document.getElementById('includeSS').checked);
                    params.append('ssMonthlyBenefit', document.getElementById('ssMonthlyBenefit').value);
                    params.append('ssClaimingAge', document.getElementById('ssClaimingAge').value);
                    params.append('includeSpouseSS', document.getElementById('includeSpouseSS').checked);
                    params.append('spouseSSMonthlyBenefit', document.getElementById('spouseSSMonthlyBenefit').value);
                    params.append('spouseSSClaimingAge', document.getElementById('spouseSSClaimingAge').value);
                    params.append('includeOtherIncome', document.getElementById('includeOtherIncome').checked);
                    params.append('monthlyPension', document.getElementById('monthlyPension').value);
                    params.append('pensionStartAge', document.getElementById('pensionStartAge').value);
                    params.append('monthlyOtherIncome', document.getElementById('monthlyOtherIncome').value);
                    params.append('otherIncomeDuration', document.getElementById('otherIncomeDuration').value);
                } else {
                    // Accumulation tab fields
                    params.append('tab', 'accumulation');
                    params.append('currentAge', document.getElementById('currentAge').value);
                    params.append('currentSavings', document.getElementById('currentSavings').value);
                    params.append('income', document.getElementById('income').value);
                    params.append('expenses', document.getElementById('expenses').value);
                    params.append('targetAmount', document.getElementById('targetAmount').value);
                    params.append('stockAllocation', document.getElementById('stockAllocation').value);
                    params.append('incomeGrowth', document.getElementById('incomeGrowth').value);
                    params.append('savingsSimulationCount', document.getElementById('savingsSimulationCount').value);
                }
                
                return `${url.origin}${url.pathname}?${params.toString()}`;
            }
            
            // Share button click handler
            shareButton.addEventListener('click', function() {
                const shareableUrl = getShareableUrl();
                
                // Copy to clipboard
                navigator.clipboard.writeText(shareableUrl).then(function() {
                    // Show toast notification
                    toast.classList.add('visible');
                    setTimeout(function() {
                        toast.classList.remove('visible');
                    }, 3000);
                }).catch(function(err) {
                    console.error('Could not copy text: ', err);
                });
            });
        }

        // Share button + applySharedParameters moved to consolidated DOMContentLoaded

        // Add this function to create the years distribution chart
        function createYearsDistributionChart(yearsArray) {
            // Filter out infinite values (simulations that didn't reach the goal)
            const finiteYears = yearsArray.filter(y => Number.isFinite(y));
            
            if (finiteYears.length === 0) return;
            
            // Find min and max years
            const minYears = Math.min(...finiteYears);
            const maxYears = Math.max(...finiteYears);
            
            // Create bins (one bin per year from min to max)
            const bins = maxYears - minYears + 1;
            const labels = [];
            const data = new Array(bins).fill(0);
            
            // Create bin labels
            for (let i = 0; i < bins; i++) {
                labels.push(minYears + i);
            }
            
            // Count occurrences for each bin
            finiteYears.forEach(year => {
                const binIndex = year - minYears;
                if (binIndex >= 0 && binIndex < bins) {
                    data[binIndex]++;
                }
            });
            
            // Calculate cumulative values
            const cumulativeData = [];
            let runningTotal = 0;
            data.forEach(value => {
                runningTotal += value;
                cumulativeData.push(runningTotal);
            });
            
            // Calculate percentages for tooltips and display
            const totalSimulations = yearsArray.length;
            const percentData = data.map(value => (value / totalSimulations) * 100);
            const cumulativePercentData = cumulativeData.map(value => (value / totalSimulations) * 100);
            
            // Generate a color gradient for the bars based on years
            const individualColors = labels.map((_, index) => {
                // Create a gradient from blue to purple
                const ratio = index / (labels.length - 1);
                return `rgba(${Math.round(73 + ratio * 86)}, ${Math.round(134 - ratio * 70)}, ${Math.round(242 - ratio * 10)}, 0.8)`;
            });
            
            // Create chart
            const ctx = document.getElementById('yearsDistributionChart').getContext('2d');
            
            // Check if chart exists before destroying
            if (window.yearsDistributionChart && typeof window.yearsDistributionChart.destroy === 'function') {
                window.yearsDistributionChart.destroy();
            }
            
            window.yearsDistributionChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Individual Year',
                            data: data,
                            backgroundColor: individualColors,
                            borderColor: 'rgba(99, 102, 241, 1)',
                            borderWidth: 1,
                            order: 2
                        },
                        {
                            label: 'Cumulative',
                            data: cumulativeData,
                            backgroundColor: 'rgba(245, 158, 11, 0.3)', // Light orange for cumulative
                            borderColor: '#f59e0b', // Orange for cumulative line
                            borderWidth: 3, // Thicker line
                            type: 'line',
                            yAxisID: 'y1',
                            order: 1,
                            pointRadius: 5, // Larger nodes
                            pointHoverRadius: 8, // Larger nodes on hover
                            pointBackgroundColor: '#f59e0b', // Solid node color
                            pointBorderColor: 'white', // Node border color
                            pointBorderWidth: 1 // Node border width
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        tooltip: {
                            callbacks: {
                                title: function(context) {
                                    const year = context[0].label;
                                    return `${year} Years`;
                                },
                                label: function(context) {
                                    if (context.datasetIndex === 0) {
                                        // Individual year data
                                        const count = context.raw;
                                        const percent = percentData[context.dataIndex].toFixed(1);
                                        return `${count} simulations (${percent}%)`;
                                    } else {
                                        // Cumulative data
                                        const count = context.raw;
                                        const percent = cumulativePercentData[context.dataIndex].toFixed(1);
                                        return `Cumulative: ${count} simulations (${percent}%)`;
                                    }
                                }
                            }
                        },
                        legend: {
                            display: true,
                            labels: {
                                color: 'rgb(30, 41, 59)'
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Years to Reach Goal'
                            }
                        },
                        y: {
                            position: 'left',
                            title: {
                                display: true,
                                text: 'Number of Simulations'
                            },
                            beginAtZero: true,
                            grid: {
                                drawOnChartArea: true
                            }
                        },
                        y1: {
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Cumulative Simulations'
                            },
                            beginAtZero: true,
                            grid: {
                                drawOnChartArea: false
                            },
                            max: totalSimulations // Set max to total simulations
                        }
                    }
                }
            });
        }

        // targetAmount change listener moved to consolidated DOMContentLoaded

        // Add the JavaScript to handle the simulation table
        // Function to display a page of the simulation table
        function displaySimulationTable(page, sortColumn = null, sortDirection = null) {
            // Update sorting state if provided
            if (sortColumn !== null) {
                if (currentSortColumn === sortColumn) {
                    // Toggle direction if clicking the same column
                    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    // New column, default to ascending
                    currentSortColumn = sortColumn;
                    currentSortDirection = sortDirection || 'asc';
                }
            }
            
            const tableBody = document.getElementById('simulationTableBody');
            tableBody.innerHTML = '';
            
            // Create a copy of the simulations for sorting
            let sortedSimulations = [...allSimulations];
            
            // Sort the simulations if a sort column is specified
            if (currentSortColumn !== null) {
                sortedSimulations.sort((a, b) => {
                    let valueA, valueB;
                    
                    // Determine values to compare based on column
                    switch (currentSortColumn) {
                        case 'simNumber':
                            // Sim numbers are just array indices
                            valueA = sortedSimulations.indexOf(a);
                            valueB = sortedSimulations.indexOf(b);
                            break;
                        case 'yearsToGoal':
                            // Handle null values (not reached)
                            valueA = a.yearsToTarget !== null ? a.yearsToTarget : Infinity;
                            valueB = b.yearsToTarget !== null ? b.yearsToTarget : Infinity;
                            break;
                        case 'finalBalance':
                            valueA = a.finalBalance;
                            valueB = b.finalBalance;
                            break;
                        case 'avgReturn':
                            // Calculate average returns
                            let totalReturnA = 0, totalReturnB = 0;
                            a.yearlyData.forEach(year => totalReturnA += year.return);
                            b.yearlyData.forEach(year => totalReturnB += year.return);
                            valueA = a.yearlyData.length > 0 ? totalReturnA / a.yearlyData.length : 0;
                            valueB = b.yearlyData.length > 0 ? totalReturnB / b.yearlyData.length : 0;
                            break;
                        default:
                            valueA = 0;
                            valueB = 0;
                    }
                    
                    // Compare based on direction
                    if (currentSortDirection === 'asc') {
                        return valueA - valueB;
                    } else {
                        return valueB - valueA;
                    }
                });
            }
            
            // Add all simulations to the table
            for (let i = 0; i < sortedSimulations.length; i++) {
                const sim = sortedSimulations[i];
                const originalIndex = allSimulations.indexOf(sim); // Keep track of original index
                const row = document.createElement('tr');
                
                // Calculate average return for this simulation
                let totalReturn = 0;
                sim.yearlyData.forEach(year => totalReturn += year.return);
                const avgReturn = sim.yearlyData.length > 0 ? totalReturn / sim.yearlyData.length : 0;
                
                // Create row
                row.innerHTML = `
                    <td>${originalIndex + 1}</td>
                    <td>${sim.yearsToTarget !== null ? sim.yearsToTarget : 'Not reached'}</td>
                    <td>$${sim.finalBalance.toLocaleString()}</td>
                    <td>${(avgReturn * 100).toFixed(1)}%</td>
                    <td><button class="view-details-btn" onclick="showSimulationDetails(${originalIndex})">View Details</button></td>
                `;
                
                tableBody.appendChild(row);
            }
            
            // Update header to show sort indicators
            updateSortIndicators();
            
            // Add event listeners to the View Details buttons
            document.querySelectorAll('.view-details-btn').forEach(button => {
                button.addEventListener('click', function() {
                    const simIndex = parseInt(this.getAttribute('data-sim-index'));
                    showSimulationDetails(simIndex);
                });
            });
        }

        // Function to update sort indicators in the table header
        function updateSortIndicators() {
            // Remove any existing indicators
            document.querySelectorAll('.sort-indicator').forEach(el => el.remove());
            
            // Add indicators to the headers
            const headers = document.querySelectorAll('.simulation-table th');
            headers.forEach(header => {
                // Make the header look clickable
                header.style.cursor = 'pointer';
                
                // Remove the existing indicator class
                header.classList.remove('sorted-asc', 'sorted-desc');
                
                // Get the column name from the header
                const columnName = header.getAttribute('data-sort');
                
                // If this is the current sort column, add the indicator
                if (columnName === currentSortColumn) {
                    header.classList.add(currentSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
                    
                    const indicator = document.createElement('span');
                    indicator.className = 'sort-indicator';
                    indicator.textContent = currentSortDirection === 'asc' ? ' ↑' : ' ↓';
                    header.appendChild(indicator);
                }
            });
        }

        // Initialize the column sorting
        function initializeTableSorting() {
            const headers = document.querySelectorAll('.simulation-table th');
            
            // Add data-sort attributes to headers
            const sortAttributes = ['simNumber', 'yearsToGoal', 'finalBalance', 'avgReturn'];
            headers.forEach((header, index) => {
                if (index < sortAttributes.length) { // Skip the Actions column
                    header.setAttribute('data-sort', sortAttributes[index]);
                    
                    // Add click event for sorting
                    header.addEventListener('click', function() {
                        const column = this.getAttribute('data-sort');
                        displaySimulationTable(1, column);
                    });
                }
            });
        }

        // initializeTableSorting moved to consolidated DOMContentLoaded

        // Function to show simulation details in the modal
        function showSimulationDetails(simIndex) {
            let sim;
            
            // Check if simIndex is actually a simulation object instead of an index
            if (typeof simIndex === 'object' && simIndex !== null && simIndex.yearlyData) {
                // We received a simulation object directly
                sim = simIndex;
                // Find the index of this simulation in the array (for display purposes)
                simIndex = allSimulations.findIndex(s => s === sim);
                if (simIndex === -1) simIndex = 0; // Default to 0 if not found
            } else {
                // Add error checking to make sure simIndex is valid
                if (simIndex === undefined || simIndex < 0 || (Array.isArray(allSimulations) && simIndex >= allSimulations.length)) {
                    console.error("Invalid simulation index:", simIndex);
                    // Don't show alert, just log to console
                    return;
                }
                
                sim = allSimulations[simIndex];
                
                // Additional check to ensure the simulation object exists
                if (!sim) {
                    console.error("Simulation at index", simIndex, "is undefined");
                    // Don't show alert, just log to console
                    return;
                }
            }
            
            // Final check to ensure we have yearlyData
            if (!sim.yearlyData || !Array.isArray(sim.yearlyData) || sim.yearlyData.length === 0) {
                console.error("Simulation doesn't have valid yearlyData", sim);
                // Create a minimal valid structure if needed
                sim.yearlyData = sim.yearlyData || [{balance: 0, return: 0}];
            }
            
            // Create a completely new modal each time (to avoid any existing issues)
            let modalHTML = `
            <div id="simModal" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.7);
                z-index: 9999;
                display: flex;
                justify-content: center;
                align-items: center;
            ">
                <div style="
                    background: white;
                    width: 90%;
                    max-width: 900px;
                    max-height: 90vh;
                    padding: 30px;
                    border-radius: 12px;
                    overflow-y: auto;
                    position: relative;
                ">
                    <span id="closeSimModal" style="
                        position: absolute;
                        top: 15px;
                        right: 20px;
                        font-size: 24px;
                        cursor: pointer;
                        font-weight: bold;
                    ">&times;</span>
                    
                    <h2>Simulation ${typeof simIndex === 'number' ? simIndex + 1 : ''} Details</h2>
                    
                    <div style="
                        display: flex;
                        gap: 20px;
                        margin: 20px 0;
                        flex-wrap: wrap;
                    ">
                        <div style="
                            flex: 1;
                            min-width: 150px;
                            padding: 15px;
                            border-radius: 8px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                            text-align: center;
                        ">
                            <div style="color: #64748b; font-size: 0.9rem; margin-bottom: 8px;">
                                ${sim.yearsToTarget !== undefined ? 'Years to Goal' : 'Years Lasted'}
                            </div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #3730a3;">
                                ${sim.yearsToTarget !== undefined ? 
                                    (sim.yearsToTarget !== null ? `${sim.yearsToTarget} years` : 'Not reached') : 
                                    `${sim.yearsLasted} years`}
                            </div>
                        </div>
                        
                        <div style="
                            flex: 1;
                            min-width: 150px;
                            padding: 15px;
                            border-radius: 8px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                            text-align: center;
                        ">
                            <div style="color: #64748b; font-size: 0.9rem; margin-bottom: 8px;">Final Balance</div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #3730a3;">
                                $${sim.finalBalance.toLocaleString()}
                            </div>
                        </div>
                        
                        <div style="
                            flex: 1;
                            min-width: 150px;
                            padding: 15px;
                            border-radius: 8px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                            text-align: center;
                        ">
                            <div style="color: #64748b; font-size: 0.9rem; margin-bottom: 8px;">Average Return</div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #3730a3;">
                                ${getAvgReturn(sim)}%
                            </div>
                        </div>
                    </div>
                    
                    <!-- Move chart container above the table -->
                    <div class="sim-detail-chart-container" style="height: 300px; margin-top: 24px; width: 100%;">
                        <canvas id="simDetailChartCanvas"></canvas>
                    </div>
                    
                    <h3>Year-by-Year Data</h3>
                    <div style="
                        max-height: 300px;
                        overflow-y: auto;
                        border: 1px solid #e2e8f0;
                        border-radius: 8px;
                        margin: 20px 0;
                    ">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="position: sticky; top: 0; background: white;">
                                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0;">Year</th>
                                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0;">Age</th>
                                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0;">Return</th>
                                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0;">
                                        ${sim.yearlyData && sim.yearlyData[0] && sim.yearlyData[0].withdrawal !== undefined ? 
                                            'Withdrawal' : 'Contribution'}
                                    </th>
                                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #e2e8f0;">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${generateYearlyDataRows(sim)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            `;
            
            // Remove any existing modal
            const existingModal = document.getElementById('simModal');
            if (existingModal) {
                existingModal.remove();
            }
            
            // Add the new modal to the document
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            // Add close button functionality
            document.getElementById('closeSimModal').addEventListener('click', function() {
                document.getElementById('simModal').remove();
            });
            
            // Close when clicking outside content
            document.getElementById('simModal').addEventListener('click', function(e) {
                if (e.target === this) {
                    this.remove();
                }
            });
            
            // Get the starting age based on which tab is active
            let startAge = 0;
            if (document.getElementById('accumulation-tab').style.display !== 'none') {
                startAge = parseInt(document.getElementById('currentAge').value);
            } else if (document.getElementById('retirement-tab').style.display !== 'none') {
                startAge = parseInt(document.getElementById('retirementAge').value);
            }

            // Create the chart directly after modal is added
            displaySimDetailChart('simDetailChartCanvas', sim.yearlyData, startAge);
        }

        // Dead createSimDetailChart and drawErrorMessage removed — using displaySimDetailChart (Chart.js version)

        // Pagination and closeSimDetailModal listeners moved to consolidated DOMContentLoaded

        // Add this helper function near the top of your script
        function safeSetTextContent(id, text) {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = text;
            } else {
                console.warn(`Element with ID '${id}' not found when setting text to: ${text}`);
            }
        }

        // Then you can use it throughout your code:
        // safeSetTextContent('resultTargetAmount', '$' + targetAmount.toLocaleString());

        // Chart.js-based chart function
        function displaySimDetailChart(canvasId, yearlyData, startAge) {
            const canvas = document.getElementById(canvasId);
            if (!canvas) {
                console.error(`Canvas element with ID '${canvasId}' not found.`);
                return;
            }
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                console.error(`Could not get 2D context for canvas '${canvasId}'.`);
                return;
            }

            // Prepare chart data
            const labels = yearlyData.map((d, i) => startAge + i);
            const balances = yearlyData.map(d => d.balance || 0);

            // Destroy previous chart instance if it exists on this canvas
            if (canvas.chartInstance) {
                canvas.chartInstance.destroy();
            }

            // Create the new chart
            canvas.chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Portfolio Balance',
                        data: balances,
                        borderColor: 'var(--primary)',
                        backgroundColor: 'rgba(79, 70, 229, 0.1)', // Use primary color with transparency
                        fill: true,
                        tension: 0.1, // Smoothen the line slightly
                        pointRadius: 0, // Hide points for cleaner look
                        pointHoverRadius: 6, // Show larger points on hover
                        pointHoverBackgroundColor: 'var(--primary)',
                        pointHoverBorderColor: 'white',
                        pointHoverBorderWidth: 2,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false, // Trigger hover even when not directly over a point
                    },
                    plugins: {
                        legend: { display: false }, // Hide legend as there's only one dataset
                        tooltip: {
                            backgroundColor: 'rgba(30, 41, 59, 0.9)',
                            titleFont: { size: 14, weight: 'bold' },
                            bodyFont: { size: 14 },
                            padding: 12,
                            cornerRadius: 8,
                            displayColors: false, // Hide the colored box in the tooltip
                            callbacks: {
                                title: function(tooltipItems) {
                                    return `Age: ${tooltipItems[0].label}`;
                                },
                                label: function(context) {
                                    return `Balance: $${Math.round(context.raw).toLocaleString()}`;
                                }
                            }
                        },
                        // Add a custom plugin for vertical crosshair line
                        crosshair: {
                            line: {
                                color: 'var(--neutral)',  // Color of the line
                                width: 1,                 // Width of the line
                                dashPattern: [5, 5]       // Make it a dashed line [dash, gap]
                            }
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Age'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Balance ($)'
                            },
                            ticks: {
                                callback: function(value) {
                                    return '$' + Math.round(value).toLocaleString();
                                }
                            },
                            beginAtZero: true
                        }
                    }
                },
                plugins: [{
                    // Custom plugin for crosshair vertical line
                    id: 'crosshair',
                    beforeDraw: function(chart) {
                        if (chart.tooltip._active && chart.tooltip._active.length) {
                            const ctx = chart.ctx;
                            const activePoint = chart.tooltip._active[0];
                            const x = activePoint.element.x;
                            const topY = chart.scales.y.top;
                            const bottomY = chart.scales.y.bottom;

                            // Draw vertical line
                            ctx.save();
                            ctx.beginPath();
                            ctx.moveTo(x, topY);
                            ctx.lineTo(x, bottomY);
                            ctx.lineWidth = 1;
                            ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
                            ctx.setLineDash([5, 5]);
                            ctx.stroke();
                            ctx.restore();
                        }
                    }
                }]
            });
            console.log("Chart created for canvas:", canvasId);
        }

        // Add these AI Analysis related functions
        
        // Function to open the AI Analysis modal
        function openAiAnalysisModal(simulator) {
            activeSimulator = simulator;
            document.getElementById('aiAnalysisModal').style.display = 'block';
            document.getElementById('apiKeySection').style.display = 'none';
            document.getElementById('aiAnalysisResults').style.display = 'none';
        }
        
        // Function to close the AI Analysis modal
        function closeAiAnalysisModal() {
            document.getElementById('aiAnalysisModal').style.display = 'none';
        }
        
        // Function to handle the Export Data option
        async function handleExportData() {
            try {
                // 1. Generate the JSON data to export based on active simulator
                const jsonData = generateExportData();
                
                // 2. Create screenshot that includes both inputs and results
                // Get the tab content which contains both inputs and results
                const tabElement = document.getElementById(
                    activeSimulator === 'accumulation' ? 'accumulation-tab' : 'retirement-tab'
                );
                
                // Show toast indicating that capture is in progress
                const toast = document.getElementById('toast');
                toast.textContent = 'Capturing screenshot...';
                toast.classList.add('visible');
                
                try {
                    // Load html2canvas library if not already loaded
                    if (!window.html2canvas) {
                        await loadHtml2Canvas();
                    }
                    
                    // Create screenshot of the entire tab (inputs + results)
                    const screenshotBlob = await html2canvas(tabElement, {
                        scrollX: 0,
                        scrollY: -window.scrollY,
                        windowWidth: document.documentElement.offsetWidth,
                        windowHeight: document.documentElement.offsetHeight,
                        scale: 1.5,
                        logging: false,
                        allowTaint: true,
                        useCORS: true,
                        onclone: function(clonedDoc) {
                            // Make sure both input and results sections are visible in the clone
                            const clonedTab = clonedDoc.getElementById(
                                activeSimulator === 'accumulation' ? 'accumulation-tab' : 'retirement-tab'
                            );
                            const clonedResults = clonedDoc.getElementById(
                                activeSimulator === 'accumulation' ? 'results' : 'retirement-results'
                            );
                            
                            if (clonedTab && clonedResults) {
                                clonedResults.style.display = 'flex';
                                clonedResults.style.flexDirection = 'column';
                                
                                // Adjust styles for screenshot - we need to make it more compact
                                const inputSection = clonedTab.querySelector('.input-section');
                                if (inputSection) {
                                    inputSection.style.padding = '15px';
                                    inputSection.style.marginBottom = '10px';
                                }
                            }
                        }
                    }).then(canvas => {
                        return new Promise(resolve => {
                            canvas.toBlob(blob => {
                                resolve(blob);
                            }, 'image/png');
                        });
                    });
                    
                    // Create a download link for the screenshot
                    const downloadLink = document.createElement('a');
                    downloadLink.href = URL.createObjectURL(screenshotBlob);
                    downloadLink.download = `financial-future-${activeSimulator}-${new Date().toISOString().split('T')[0]}.png`;
                    downloadLink.click();
                    
                    // Copy JSON to clipboard
                    await navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
                    
                    // Update toast to indicate completion
                    toast.textContent = 'Screenshot saved and data copied to clipboard!';
                    setTimeout(() => {
                        toast.classList.remove('visible');
                    }, 3000);
                    
                } catch (error) {
                    console.error('Screenshot error:', error);
                    toast.textContent = 'Error capturing screenshot. JSON copied to clipboard.';
                    
                    // Still copy JSON even if screenshot fails
                    await navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
                    
                    setTimeout(() => {
                        toast.classList.remove('visible');
                    }, 3000);
                }
                
            } catch (error) {
                console.error('Export error:', error);
                
                const toast = document.getElementById('toast');
                toast.textContent = 'Error exporting data. Try again.';
                toast.classList.add('visible');
                setTimeout(() => {
                    toast.classList.remove('visible');
                }, 3000);
            }
            
            // Close the modal
            closeAiAnalysisModal();
        }
        
        // Function to generate the export data based on the active simulator
        function generateExportData() {
            let data = {
                simulator: activeSimulator,
                date: new Date().toISOString(),
                inputs: {},
                results: {}
            };
            
            if (activeSimulator === 'accumulation') {
                // Gather accumulation inputs
                data.inputs = {
                    currentAge: parseInt(document.getElementById('currentAge').value),
                    currentSavings: parseFloat(document.getElementById('currentSavings').value.replace(/[^0-9.]/g, '')),
                    income: parseFloat(document.getElementById('income').value.replace(/[^0-9.]/g, '')),
                    expenses: parseFloat(document.getElementById('expenses').value.replace(/[^0-9.]/g, '')),
                    targetAmount: parseFloat(document.getElementById('targetAmount').value.replace(/[^0-9.]/g, '')),
                    stockAllocation: parseInt(document.getElementById('stockAllocation').value),
                    incomeGrowth: parseFloat(document.getElementById('incomeGrowth').value)
                };
                
                // Gather accumulation results
                data.results = {
                    yearsToGoal: document.getElementById('yearsToGoal').textContent,
                    milestones: {
                        milestone25: document.getElementById('milestone25').textContent,
                        milestone50: document.getElementById('milestone50').textContent,
                        milestone75: document.getElementById('milestone75').textContent,
                        milestone100: document.getElementById('milestone100').textContent,
                    },
                    simulationCount: allSimulations.length,
                    // Get summary of simulations
                    simulationSummary: {
                        reachedGoalCount: allSimulations.filter(sim => sim.reachedGoal).length,
                        medianYearsToGoal: window.medianSimulation?.yearsToTarget || null,
                        averageFinalBalance: allSimulations.reduce((sum, sim) => sum + sim.finalBalance, 0) / allSimulations.length,
                    }
                };
                
            } else {
                // Gather retirement inputs
                data.inputs = {
                    retirementAge: parseInt(document.getElementById('retirementAge').value),
                    retirementSavings: parseFloat(document.getElementById('retirementSavings').value.replace(/[^0-9.]/g, '')),
                    annualWithdrawal: parseFloat(document.getElementById('annualWithdrawal').value.replace(/[^0-9.]/g, '')),
                    withdrawalAdjustment: document.getElementById('withdrawalAdjustment').checked,
                    taxRate: parseFloat(document.getElementById('taxRate').value),
                    stockAllocation: parseInt(document.getElementById('retirementStockAllocation').value),
                    lifeExpectancy: parseInt(document.getElementById('retirementLifeExpectancy').value),
                    includeSS: document.getElementById('includeSS').checked,
                    ssMonthlyBenefit: parseFloat((document.getElementById('ssMonthlyBenefit').value || '0').replace(/[^0-9.]/g, '')) || 0,
                    ssClaimingAge: parseInt(document.getElementById('ssClaimingAge').value),
                    includeSpouseSS: document.getElementById('includeSpouseSS').checked,
                    includeOtherIncome: document.getElementById('includeOtherIncome').checked
                };
                
                // Gather retirement results
                data.results = {
                    successRate: document.getElementById('successRate').textContent,
                    medianEndingBalance: document.getElementById('medianEndingBalance').textContent,
                    avgReturn: document.getElementById('retirementAvgReturn').textContent,
                    totalWithdrawals: document.getElementById('totalWithdrawals').textContent,
                    worstCaseAge: document.getElementById('worstCaseAge').textContent,
                    simulationCount: allSimulations.length,
                    simulationSummary: {
                        successfulCount: allSimulations.filter(sim => !sim.ranOutOfMoney).length,
                        failedCount: allSimulations.filter(sim => sim.ranOutOfMoney).length,
                        medianYearsLasted: allSimulations.sort((a, b) => a.yearsLasted - b.yearsLasted)[Math.floor(allSimulations.length / 2)]?.yearsLasted || 0
                    }
                };
            }
            
            return data;
        }
        
        // Function to handle the AI Analysis option
        function handleAiAnalysisOption() {
            // document.getElementById('apiKeySection').style.display = 'block'; // Old behavior
            handleSubmitApiKey(); // New: Directly proceed to analysis
        }
        
        // Function to handle sending data to OpenAI API
        async function handleSubmitApiKey() {
            // const apiKey = document.getElementById('openaiApiKey').value.trim(); // REMOVED: No longer read from input

            // REMOVED: API key validation is now server-side implicitly by using the stored key
            // if (!apiKey || !apiKey.startsWith('sk-')) { 
            //     alert('Please enter a valid OpenAI API key');
            //     return;
            // }

            // Ensure the modal sections are correctly shown/hidden
            if(document.getElementById('apiKeySection')) { // Defensively hide if it somehow still exists
                document.getElementById('apiKeySection').style.display = 'none'; 
            }
            document.getElementById('aiAnalysisResults').style.display = 'block';
            document.getElementById('aiAnalysisContent').innerHTML = `
                <div class="ai-loading">
                    <div class="spinner"></div>
                    <p>Analyzing your financial scenario...</p>
                </div>
            `;

            try {
                const promptData = generateExportData();
                const prompt = generateOpenAIPrompt(promptData);
                // The first argument to fetchOpenAIResponse (apiKey) is no longer used by the function when calling the proxy.
                const response = await fetchOpenAIResponse(null, prompt); 

                document.getElementById('aiAnalysisContent').innerHTML = `
                    <div class="ai-response">
                        ${marked.parse(response)}
                    </div>
                `;
            } catch (error) {
                console.error('AI Analysis error in handleSubmitApiKey:', error);
                document.getElementById('aiAnalysisContent').innerHTML = `
                    <div class="ai-error">
                        <h4>Error</h4>
                        <p>${error.message || 'Failed to get analysis. Please try again.'}</p>
                    </div>
                `;
            }
        }
        
        // Function to generate a prompt for OpenAI based on the simulation data
        function generateOpenAIPrompt(data) {
            let prompt = '';
            
            if (data.simulator === 'accumulation') {
                prompt = `
                    Provide a comprehensive financial analysis and advice based on the following retirement savings simulation:
                    
                    Current Situation:
                    - Age: ${data.inputs.currentAge}
                    - Current Savings: $${data.inputs.currentSavings.toLocaleString()}
                    - Annual Income: $${data.inputs.income.toLocaleString()}
                    - Annual Expenses: $${data.inputs.expenses.toLocaleString()}
                    - Annual Savings (Income - Expenses): $${(data.inputs.income - data.inputs.expenses).toLocaleString()}
                    - Target Retirement Amount: $${data.inputs.targetAmount.toLocaleString()}
                    - Stock Allocation: ${data.inputs.stockAllocation}%
                    - Annual Income Growth: ${data.inputs.incomeGrowth}%
                    
                    Simulation Results:
                    - Median Years to Reach Goal: ${data.results.yearsToGoal}
                    - Age at 25% of Goal: ${data.results.milestones.milestone25}
                    - Age at 50% of Goal: ${data.results.milestones.milestone50}
                    - Age at 75% of Goal: ${data.results.milestones.milestone75}
                    - Age at 100% of Goal: ${data.results.milestones.milestone100}
                    - Success Rate: ${data.results.simulationSummary.reachedGoalCount / data.results.simulationCount * 100}%
                    
                    Please provide:
                    1. A brief overall assessment of the savings plan
                    2. Key insights about the timeline to reach the goal
                    3. Specific recommendations to improve the plan (asset allocation, savings rate, etc.)
                    4. Notable risks and how to mitigate them
                    5. Any other important observations
                    
                    Format your response in a clear, friendly tone with markdown formatting.
                `;
            } else {
                prompt = `
                    Provide a comprehensive financial analysis and advice based on the following retirement simulation:
                    
                    Retirement Situation:
                    - Retirement Age: ${data.inputs.retirementAge}
                    - Retirement Savings: $${data.inputs.retirementSavings.toLocaleString()}
                    - Annual Withdrawal: $${data.inputs.annualWithdrawal.toLocaleString()}
                    - Withdrawal Rate: ${(data.inputs.annualWithdrawal / data.inputs.retirementSavings * 100).toFixed(2)}%
                    - Adjusting for Inflation: ${data.inputs.withdrawalAdjustment ? 'Yes' : 'No'}
                    - Tax Rate: ${data.inputs.taxRate}%
                    - Stock Allocation: ${data.inputs.stockAllocation}%
                    - Expected Retirement Length: ${data.inputs.lifeExpectancy} years
                    
                    Simulation Results:
                    - Success Rate: ${data.results.successRate}
                    - Median Ending Balance: ${data.results.medianEndingBalance}
                    - Average Annual Return: ${data.results.avgReturn}
                    - Total Withdrawals (Median): ${data.results.totalWithdrawals}
                    - Worst Case Funds Depleted: ${data.results.worstCaseAge}
                    
                    Please provide:
                    1. A brief overall assessment of the retirement plan
                    2. Analysis of the withdrawal rate sustainability
                    3. Specific recommendations to improve the plan (asset allocation, withdrawal amount, etc.)
                    4. Notable risks and how to mitigate them
                    5. Any other important observations
                    
                    Format your response in a clear, friendly tone with markdown formatting.
                `;
            }
            
            return prompt.trim();
        }
        
        // Function to call the OpenAI API with the given API key and prompt
        async function fetchOpenAIResponse(apiKey, prompt) { // apiKey is no longer used client-side
            // The URL will be your Pages site URL + /functions_file_name (without .js)
            // e.g., if your site is myapp.pages.dev and file is functions/openai-proxy.js,
            // URL is '/openai-proxy' relative to your site, or full URL: 'https://myapp.pages.dev/openai-proxy'
            const workerUrl = '/openai-proxy'; // Relative path to the function

            try {
                const response = await fetch(workerUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        // The API key is now handled by the Cloudflare Worker, not sent from client
                    },
                    body: JSON.stringify({
                        prompt: prompt // Send the prompt in the body
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    // Display a more user-friendly error, details are logged in the worker
                    console.error(`AI Analysis Service Error (${response.status}): ${errorText}`);
                    throw new Error(`Failed to get analysis. The AI service returned an error.`);
                }

                const data = await response.json();
                if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
                    return data.choices[0].message.content;
                } else {
                    console.error('Unexpected response structure from AI service:', data);
                    throw new Error('Received an unexpected response from the AI analysis service.');
                }
            } catch (error) {
                console.error('Error in fetchOpenAIResponse:', error);
                // Re-throw or handle as appropriate for your UI
                throw error; // This will allow the handleSubmitApiKey function to catch it
            }
        }
        
        // Function to load html2canvas library dynamically when needed
        function loadHtml2Canvas() {
            return new Promise((resolve, reject) => {
                if (window.html2canvas) {
                    resolve(window.html2canvas);
                    return;
                }
                
                const script = document.createElement('script');
                script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
                script.onload = () => resolve(window.html2canvas);
                script.onerror = () => reject(new Error('Failed to load html2canvas library'));
                document.head.appendChild(script);
            });
        }
        
        // Function to set up AI Analysis event listeners
        function setupAiAnalysis() {
            // Load html2canvas library in advance
            loadHtml2Canvas().catch(error => console.warn('Failed to preload html2canvas:', error));
            
            // Set up button click handlers
            document.getElementById('aiAnalysisBtn').addEventListener('click', () => openAiAnalysisModal('accumulation'));
            document.getElementById('retirementAiAnalysisBtn').addEventListener('click', () => openAiAnalysisModal('retirement'));
            document.getElementById('closeAiAnalysisModal').addEventListener('click', closeAiAnalysisModal);
            
            // Window click to close modal
            window.addEventListener('click', (event) => {
                if (event.target === document.getElementById('aiAnalysisModal')) {
                    closeAiAnalysisModal();
                }
            });
            
            // Set up option handlers
            document.getElementById('exportDataOption').addEventListener('click', handleExportData);
            document.getElementById('aiAnalysisOption').addEventListener('click', handleAiAnalysisOption);
            // const submitApiKeyButton = document.getElementById('submitApiKey'); // REMOVED: Button will be gone
            // if (submitApiKeyButton) submitApiKeyButton.addEventListener('click', handleSubmitApiKey);
            
            // const apiKeyInput = document.getElementById('openaiApiKey'); // REMOVED: Input will be gone
            // if (apiKeyInput) {
            //     apiKeyInput.addEventListener('keypress', (event) => {
            //         if (event.key === 'Enter') {
            //             handleSubmitApiKey();
            //         }
            //     });
            // }
        }
        
        // setupAiAnalysis moved to consolidated DOMContentLoaded

// Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
        })
        .catch(error => {
          console.log('ServiceWorker registration failed: ', error);
        });
    });
  }
