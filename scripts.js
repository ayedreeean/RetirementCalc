// Scroll to results
const resultsDiv = document.getElementById('accumulationResults');
const headerHeight = getHeaderHeight(); // Get fixed header height
const elementPosition = resultsDiv.getBoundingClientRect().top;
const offsetPosition = window.scrollY + elementPosition - headerHeight - 10; // Add a small buffer (10px)

window.scrollTo({
    top: offsetPosition,
    behavior: 'smooth'
});

function getHeaderHeight() {
    const header = document.querySelector('.app-header');
    return header ? header.offsetHeight : 0;
}

function runRetirementSimulation() {
    // ... existing code ...

    // Scroll to results
    const resultsDiv = document.getElementById('retirementResults');
    const headerHeight = getHeaderHeight(); // Get fixed header height
    const elementPosition = resultsDiv.getBoundingClientRect().top;
    const offsetPosition = window.scrollY + elementPosition - headerHeight - 10; // Add a small buffer (10px)

    window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
    });
}

function generateOpenAIPrompt(simulationType, data) {
    let prompt = `You are a helpful financial planning assistant. Analyze the following financial simulation data and provide a concise assessment.

Simulation Type: ${simulationType.charAt(0).toUpperCase() + simulationType.slice(1)}

User Inputs:
`;

    // Add User Inputs
    for (const key in data.inputs) {
        let label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()); // Format key for readability
        let value = data.inputs[key];
        if (typeof value === 'boolean') {
            value = value ? 'Yes' : 'No';
        } else if (typeof value === 'number' && (key.toLowerCase().includes('rate') || key.toLowerCase().includes('inflation'))) {
             value = (value * 100).toFixed(2) + '%'; // Format rates/inflation
        } else if (typeof value === 'number') {
            value = formatCurrency(value); // Format currency
        }
         prompt += `- ${label}: ${value}\\n`;

         // Add clarification for Retirement Simulation's "Length of Retirement"
         if (simulationType === 'retirement' && key === 'lengthOfRetirement') {
             prompt += `  (Note: This is the duration of retirement in years, starting from the 'Retirement Age'. The simulation runs until Age = Retirement Age + Length of Retirement.)\\n`;
         }
    }

    prompt += `
Simulation Results:
`;

    // Add Simulation Results (simplified example)
    if (data.results) {
        for (const key in data.results) {
            let label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()); // Format key
             let value = data.results[key];
             // Add specific formatting for results if needed (e.g., final balance, success rate)
             if (key === 'finalBalance' || key === 'totalContributions' || key === 'totalInterestEarned' || key === 'requiredSavings' || key === 'portfolioValueAtRetirement' || key === 'maxDrawdown') {
                 value = formatCurrency(value);
             } else if (key === 'successRate') {
                 value = (value * 100).toFixed(1) + '%';
             } else if (key === 'yearsUntilDepletion' && value === Infinity) {
                value = 'Never (Sustainable)';
            } else if (key === 'sustainabilityMessage') {
                // Keep as string
             } else if (Array.isArray(value)) {
                 value = '[Chart Data]'; // Placeholder for array data (like chart data)
             }
            prompt += `- ${label}: ${value}\\n`;
        }
    } else {
        prompt += "- No results available.\\n";
    }

     // Add Tool Context / FAQ
     prompt += `
Tool Context & FAQ:
This section provides context about the tool itself based on its help documentation.
`;
     try {
         const helpModal = document.getElementById('helpModal');
         const faqSections = helpModal.querySelectorAll('.help-section');
         let faqContent = '';
         faqSections.forEach(section => {
             const headingElement = section.querySelector('h3');
             if (headingElement && headingElement.textContent.toLowerCase().includes('faq')) {
                  // Add heading
                  faqContent += `\\n### ${headingElement.textContent.trim()}\\n`;
                  // Add paragraphs under this FAQ section
                  const paragraphs = section.querySelectorAll('p, ul, li'); // Include lists too
                  paragraphs.forEach(p => {
                      faqContent += p.textContent.trim() + '\\n';
                  });
             } else if (headingElement && headingElement.textContent.toLowerCase().includes('glossary')) {
                 // Optionally include glossary or other sections if desired
                 // faqContent += `\\n### ${headingElement.textContent.trim()}\\n`;
                 // const terms = section.querySelectorAll('p');
                 // terms.forEach(t => faqContent += t.textContent.trim() + '\\n');
             }
         });
         prompt += faqContent || "No FAQ content found.\\n";
     } catch (error) {
         console.error("Error extracting FAQ content:", error);
         prompt += "Could not extract FAQ content.\\n";
     }


    prompt += `
Analysis Guidelines:
Based on the inputs and results:
1.  **Summary:** Provide a brief overview of the simulation outcome.
2.  **Key Strengths:** Identify positive aspects (e.g., high savings rate, early retirement, sustainable plan). Use bullet points.
3.  **Key Concerns:** Identify potential issues (e.g., shortfall, high reliance on returns, running out of money). Use bullet points.
4.  **Recommended Actions:** Suggest 2-3 concrete steps the user could consider (e.g., increase savings, adjust retirement age, modify investment strategy). Use bullet points.
5.  **Additional Considerations:** Mention any other relevant factors or nuances (e.g., impact of inflation, importance of withdrawal strategy, other risks not modeled). Use bullet points.

Format the response using Markdown. Use the headings provided above (Summary, Key Strengths, Key Concerns, Recommended Actions, Additional Considerations). Do *not* add extra commentary before the Summary or after Additional Considerations.
`;

    return prompt;
}

// ... existing code ...

// Add AI Assessment functionality
function generateAIAssessment(simulationType) {
    // Show the modal
    const modal = document.getElementById('aiAssessmentModal');
    modal.style.display = 'flex'; // Use flex to center vertically/horizontally

    // Get all simulation data as a JSON object and store it for later use
    const simulationData = captureSimulationData(simulationType);

    // Store data in the global scope (or pass it around if preferred)
    window.simulationData = simulationData; // Simplest for now

    // --- Tab Switching Logic ---
    const tabButtons = modal.querySelectorAll('.ai-tab-button');
    const tabPanels = modal.querySelectorAll('.ai-tab-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Deactivate all buttons and panels
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanels.forEach(panel => panel.classList.remove('active'));

            // Activate clicked button and corresponding panel
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            const activePanel = modal.querySelector(`#${tabId}`);
            if (activePanel) {
                activePanel.classList.add('active');
            }
        });
    });

    // Ensure the default active tab is shown correctly on modal open
    modal.querySelector('.ai-tab-button.active').click(); 
    // --- End Tab Switching Logic ---

    // Set up the event handlers for the buttons inside the tabs
    const downloadScreenshotBtn = document.getElementById('downloadScreenshot');
    if (downloadScreenshotBtn) {
        downloadScreenshotBtn.onclick = () => {
            // Using html2canvas library for screenshot
            if (typeof html2canvas === 'undefined') {
                alert('Screenshot library (html2canvas) not loaded.');
                // Optionally load it dynamically:
                // const script = document.createElement('script');
                // script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                // script.onload = () => takeScreenshot(simulationType);
                // document.head.appendChild(script);
            } else {
                takeScreenshot(simulationType);
            }
        };
    }

    const downloadJSONBtn = document.getElementById('downloadJSON');
    if (downloadJSONBtn) {
        downloadJSONBtn.onclick = () => {
            downloadJSON(simulationData, `${simulationType}_simulation_data.json`);
        };
    }

    const copyJSONBtn = document.getElementById('copyJSON');
    if (copyJSONBtn) {
        copyJSONBtn.onclick = () => {
            copyToClipboard(JSON.stringify(simulationData, null, 2));
            // Consider using a toast notification instead of alert
            showToast('JSON data copied to clipboard!');
        };
    }

    // Add OpenAI assessment handler
    const generateOpenAIBtn = document.getElementById('generateOpenAIAssessment');
    if (generateOpenAIBtn) {
        generateOpenAIBtn.onclick = () => {
            const apiKey = document.getElementById('openai-api-key').value.trim();
            if (!apiKey) {
                alert('Please enter your OpenAI API key');
                return;
            }

            if (!apiKey.startsWith('sk-')) {
                alert('Please enter a valid OpenAI API key (starts with sk-)');
                return;
            }

            // Show loading indicator
            const loadingIndicator = document.getElementById('openai-loading');
            const resultElement = document.getElementById('assessmentResult');
            if (loadingIndicator) loadingIndicator.style.display = 'block';
            if (resultElement) resultElement.style.display = 'none';

            // Get simulation data (already captured)
            const data = window.simulationData;

            // Generate a comprehensive prompt
            const prompt = generateOpenAIPrompt(simulationType, data);
            console.log("Generated OpenAI Prompt:", prompt); // Log prompt for debugging

            // Call OpenAI API
            callOpenAI(apiKey, prompt, simulationType)
                .then(assessment => {
                    // Hide loading and show result
                    if (loadingIndicator) loadingIndicator.style.display = 'none';

                    if (resultElement) {
                        try {
                            // Convert markdown to HTML using marked.js
                            if (typeof marked !== 'undefined') {
                                resultElement.innerHTML = marked.parse(assessment);
                            } else {
                                // Fallback if marked.js isn't loaded
                                resultElement.textContent = assessment;
                                console.warn('marked.js library not found. Displaying raw text.');
                            }

                            // --- Apply post-rendering styles --- 
                            // (Keep styling logic as before, adapted for new structure if needed)
                            const headings = resultElement.querySelectorAll('h1, h2, h3');
                            headings.forEach(heading => {
                                if (heading.textContent.trim().match(/^(Strengths|Concerns):?$/i)) {
                                    heading.style.display = 'none';
                                } else {
                                    // Apply default heading styles if needed, but rely on CSS mostly
                                }
                            });

                            resultElement.querySelectorAll('h3').forEach(h3 => {
                                let ul = h3.nextElementSibling;
                                while(ul && ul.tagName !== 'UL') {
                                    ul = ul.nextElementSibling;
                                }
                                if (!ul) return; // Skip if no UL found

                                if (h3.textContent.toLowerCase().includes('strength')) {
                                    ul.querySelectorAll('li').forEach(li => {
                                        li.style.listStyleType = 'none';
                                        li.style.position = 'relative';
                                        li.style.paddingLeft = '1.8em'; 
                                        li.insertAdjacentHTML('afterbegin', '<span style="position: absolute; left: 0; top: 1px; margin-right: 0.5em;">✅</span>');
                                    });
                                } else if (h3.textContent.toLowerCase().includes('concern')) {
                                    ul.querySelectorAll('li').forEach(li => {
                                        li.style.listStyleType = 'none';
                                        li.style.position = 'relative';
                                        li.style.paddingLeft = '1.8em';
                                        li.insertAdjacentHTML('afterbegin', '<span style="position: absolute; left: 0; top: 1px; margin-right: 0.5em;">⚠️</span>');
                                    });
                                }
                            });
                            // --- End post-rendering styles --- 

                            resultElement.style.display = 'block';
                            // Scroll modal content to the result, not the whole window
                            resultElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                        } catch (parseError) {
                            console.error('Error rendering Markdown:', parseError);
                            resultElement.textContent = 'Error displaying assessment. Check console.';
                            resultElement.style.display = 'block';
                        }
                    }
                })
                .catch(error => {
                    if (loadingIndicator) loadingIndicator.style.display = 'none';
                    alert('Error calling OpenAI API: ' + error.message);
                    console.error('OpenAI API error:', error);
                    // Optionally display error in the result area
                    if (resultElement) {
                        resultElement.textContent = `Error: ${error.message}`;
                        resultElement.style.display = 'block';
                        resultElement.style.color = 'red';
                    }
                });
        };
    }

    // Close button event handler
    const closeButton = document.getElementById('closeAiAssessment');
    if (closeButton) {
        closeButton.onclick = () => {
            modal.style.display = 'none';
        };
    }

    // Close when clicking outside the modal content
    modal.addEventListener('click', (event) => {
         // Check if the click is directly on the modal background
        if (event.target === modal) {
             modal.style.display = 'none';
         }
    });
}

// ... existing code ... 