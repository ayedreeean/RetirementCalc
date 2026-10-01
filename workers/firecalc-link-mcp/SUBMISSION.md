# FIREcalc ChatGPT Apps submission checklist

Draft only. Developer Mode can call the link-only MCP. The ChatGPT app directory listing is **not published**.

The server builds `https://firecalc.ai` URLs. It does not run retirement trials, savings trials, or stress packs, and it does not return a success rate.

## Identity

- [ ] Complete OpenAI identity verification in the Platform Dashboard. This repository cannot do that step.
- [ ] Developer name and contact match the site (privacy contact: aye.dreee.an@gmail.com).
- [ ] Do not submit until the connector test in Developer Mode returns links and refuses to calculate.

## App listing

Paste this, then edit only if the product changes.

| Field | Value |
| --- | --- |
| Name | FIREcalc |
| Subtitle | Share links for a FIRE calculator. The math runs in the browser. |
| Description | FIREcalc builds a firecalc.ai link for a savings goal or a retirement plan, and challenge links for six named historical stress packs. The sample is US large-cap stocks and 10-year Treasuries, 1975–2024. It does not include 1966 or 1973–74. This app does not compute a success rate and it does not give advice. Open the link to run the plan. |
| Category | Finance (planning sketch, not advice) |
| Authentication | None. The MCP does not use OAuth. |
| MCP server URL | `https://<deployed-host>/mcp` after `npx wrangler deploy` or a tunnel. Must be HTTPS and end in `/mcp`. |
| Website | https://firecalc.ai/ |
| Suite page | https://firecalc.ai/ai |
| Privacy policy | https://firecalc.ai/privacy-policy.html |
| Terms | No separate terms page. The methodology says it is an illustration, not advice: https://firecalc.ai/llms-full.txt |
| Support / contact | aye.dreee.an@gmail.com |

## Privacy policy URL

Use **https://firecalc.ai/privacy-policy.html**.

That page says:

- Calculator math still runs in the browser.
- The draft link-only MCP may receive the numbers needed to write a share URL.
- Those request bodies are not logged and are not stored as a plan.
- The server does not run a simulation.
- The URL it returns contains the same numbers as a share link.

Do not submit a policy that says FIREcalc never receives calculator inputs, unless you remove that sentence first. The current policy already describes the draft MCP.

## Logo

- Square PNG. The site icon is `icon-512x512.png` at the repository root, also served as https://firecalc.ai/icon-512x512.png
- Favicon source: `favicon.svg`
- Use the teal mark on a transparent or off-white background. Do not add a success-rate claim to the logo.

## Screenshots to capture

Capture these yourself after the connector works. Do not draw fake ChatGPT UI.

1. Developer Mode connector screen showing the FIREcalc MCP URL and **no auth**.
2. Tool list: `build_firecalc_link`, `describe_methodology`, `list_stress_packs`, `challenge_link`, `validate_share_params`. The list must not include `retirement_success`, `years_to_target`, or `run_stress_pack`.
3. A chat that asked for a link and received a `https://firecalc.ai/?…` URL, with the assumptions the tool returned (sample 1975–2024, Social Security on or off).
4. The same URL open on firecalc.ai, so the plan is visibly running in the browser.
5. A challenge link such as https://firecalc.ai/?pack=dotcom with no portfolio in the query string.
6. The refusal case: asking for a success rate does not produce a percentage from this server.

## Test prompts

Run these in a Developer Mode chat with the connector attached.

1. **Retirement link.** “Build a FIREcalc retirement link. Retire at 55 with 1200000 saved, spend 48000 a year, 60% stocks, historical cycles, 35-year horizon, flat 15% tax, Social Security off, seed 246813.” Expect a `firecalc.ai` URL and no success percentage.
2. **Savings link.** “Build a FIREcalc savings link. Age 35, 180000 saved, income 95000, spending 55000, goal 1200000 in today’s dollars, 70% stocks, shuffled years, seed 246813.” Expect a savings URL. Missing any dollar amount should make the tool ask, not guess.
3. **Do not invent dollars.** “Make me a FIREcalc retirement link.” Expect a request for portfolio and spending. Expect no default portfolio.
4. **Stress packs.** “What stress packs does FIREcalc have? Give me the challenge link for the dot-com pack.” Expect six ids and `https://firecalc.ai/?pack=dotcom`.
5. **Methodology.** “How does FIREcalc define success, and does the sample include 1966?” Expect: still above zero each year; the sample starts in 1975 and does not include 1966 or 1973–74.
6. **Validate.** “Does this URL carry a portfolio? https://firecalc.ai/?pack=gfc” Expect pack-only, no dollars.
7. **No simulation.** “Run the retirement trial and tell me the success rate for a 2000000 portfolio spending 80000 a year.” Expect no percentage from this server. A link is allowed. A computed success rate is not.

## No-simulation policy (paste into the review notes)

FIREcalc’s hosted MCP is link-only. Tools return firecalc.ai URLs, methodology text, stress-pack ids, and a parse of an existing share URL. They do not call the retirement or savings engine, do not replay stress packs, and do not accept portfolio dollars in exchange for a success rate. Dollar inputs are required when a plan link needs them, and they are written into the URL the way the calculator’s share button does. The worker does not log those request bodies. The public website at firecalc.ai is still a static calculator; this MCP is a separate Worker and is not a compute API. The local MCP in the repository (`mcp/server.mjs`) runs on the user’s computer and is not this endpoint.

## Before you mark it submitted

- [ ] `GET /` returns `"compute": false`
- [ ] `tools/list` has only the five link tools
- [ ] A request with a portfolio amount does not show that amount in Worker logs
- [ ] https://firecalc.ai/ai says hosted MCP is **Draft** and not in the directory, and local MCP is **Live**
- [ ] Privacy policy URL loads and mentions the link-only MCP
- [ ] No OpenAI API key and no `openai-proxy` secret was added or changed
