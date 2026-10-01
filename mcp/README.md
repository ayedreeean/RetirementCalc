# FIREcalc local MCP

A [Model Context Protocol](https://modelcontextprotocol.io) server for [FIREcalc](https://firecalc.ai). It speaks MCP over **stdio** and runs the calculator on **your machine**.

FIREcalc does not host this process. There is no public compute API on this stdio server, and no remote URL for this process. The strongest privacy claim is the plain one: this process never sends your numbers anywhere, because it never opens a network connection.

A separate link-only Worker lives in `workers/firecalc-link-mcp/`. It builds share URLs and does not run these tools. It is a draft for a ChatGPT connector test, not a directory listing, and it is not this process.

This is an illustration, not advice, and not a forecast.

## What it calls

The trial math is not copied into this folder.

| Piece | Where it lives |
| --- | --- |
| Retirement and savings trials, sequences, seeded shuffle | `market-data.js` (`FirecalcSim`) |
| Share URLs and summary stats | `firecalc-io.js` (`FirecalcIO`) |
| Named stress packs and the ratio-only share card | `stress-packs.js` (`FirecalcPacks`) |
| Flat tax and 2025 bracket tax | `tax-engine.js` (`calculateWithdrawalTax`) |

`mcp/engine.mjs` loads those browser scripts in a DOM-free sandbox. `mcp/handlers.mjs` only assembles the same inputs the page assembles, then calls those functions.

## Requirements

Node.js 18 or newer. No `npm install`. The package has no dependencies.

## Run it

From a clone of this repository:

```bash
node mcp/server.mjs
```

The process waits on stdin and logs readiness on stderr:

```text
firecalc-mcp: stdio ready (local only, no network)
```

Replace `/ABSOLUTE/PATH/RetirementCalc` with the clone on your computer.

### Claude Desktop

`claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`, Linux: `~/.config/Claude/`):

```json
{
  "mcpServers": {
    "firecalc": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/RetirementCalc/mcp/server.mjs"]
    }
  }
}
```

Restart Claude Desktop after saving.

### Cursor

The same snippet goes in `~/.cursor/mcp.json` or the project `.cursor/mcp.json`.

### MCP Inspector

Inspector is a separate developer tool. It is not part of this server, and this server still does not listen on a port. The command below is stdio, with Inspector as the client:

```bash
npx -y @modelcontextprotocol/inspector node /ABSOLUTE/PATH/RetirementCalc/mcp/server.mjs
```

Try `describe_methodology` first (no plan numbers), then `run_stress_pack` with a pack id.

## Tools

Every simulation tool returns:

- `assumptions`, including `defaultsApplied` for site defaults that were actually filled in
- `modeUsed` (`shuffled` or `historical`) and `scenarioCount` when a simulation ran
- `firecalc_url`, a https://firecalc.ai share link for the same inputs
- `disclaimer`

Dollar amounts are required. The tools do not invent a portfolio, a withdrawal, or a Social Security benefit. When Social Security is off, the share link still carries the site's unused benefit field (the form default) and says so in `assumptions`.

Stress-pack cards follow the site's rule: ratios, rates, and years. They do not print dollar balances. The SVG is `FirecalcPacks.shareCardSvg`.

| Tool | What it does |
| --- | --- |
| `retirement_success` | Full retirement trial. Shuffled years (default, seeded) or historical cycles. Taxes, Social Security, pension, other income, horizon. |
| `years_to_target` | Savings trial. Median, 10th, and 90th percentile years to a goal in today's purchasing power. |
| `run_stress_pack` | One of `stagflation`, `rate-wall-81`, `bond-rout-94`, `dotcom`, `gfc`, `rate-shock-22`, or `all: true` for the six-pack gauntlet. An unknown id is an error. A pack is one real path, not a success rate. |
| `build_firecalc_link` | Encode a retirement plan, a savings plan, or a challenge link (`kind: "challenge"` plus a pack id, no plan numbers). |
| `describe_methodology` | Data window, definitions, pack list, limits. No simulation. |

Resources:

- `firecalc://methodology` — short note
- `firecalc://llms-full.txt` — the same long note as https://firecalc.ai/llms-full.txt

### Defaults that match the site

Retirement: age 65, 30-year horizon, 60% stocks, flat 15% tax, spending rises with inflation, shuffled years, 1,000 paths, seed `246813`, Social Security off.

Savings: age 30, 70% stocks, 2% real income growth, shuffled years, 1,000 paths, seed `246813`. The search stops at 50 years.

`stockAllocationPercent: 60` means 60% in the S&P 500, not `0.60`.

Historical retirement ignores the path count and the seed. A 30-year horizon has 21 complete windows in the 1975–2024 table. The seed is still written on the share link.

## Sample

US large-cap stocks (S&P 500 total return) and 10-year Treasury total returns, 1975–2024, with CPI on the same row. The table does not include 1966 or 1973–74. Shuffled years are independent draws from that table. They are not a normal-distribution Monte Carlo.

## Privacy

- Stdio only. The server does not call `listen`, and it does not fetch.
- Inputs stay in the MCP client and in this process.
- A share URL puts those inputs in the query string. Treat the URL like a note that contains the numbers. A challenge link (`?pack=dotcom`) does not.
- The live site at firecalc.ai is still static. Opening a share link runs the plan in the browser.

## Cloudflare Pages

Do **not** give Pages a build command because this folder exists. The site is the repository root: HTML, CSS, and the browser scripts, with no root `package.json`.

If the Pages project is ever pointed at a Node build, set the build command to empty and the output directory to the repository root. Do not set the root to `mcp/` or to `workers/firecalc-link-mcp/`. Do not add a Worker route that runs these tools. This package is `private` and is not a deploy target. The link-only Worker is a different folder and does not call `FirecalcSim`.

## Tests

From the repository root:

```bash
node --test firecalc-io.test.mjs stress-packs.test.mjs mcp/tools.test.mjs mcp/smoke.test.mjs
```

Or from `mcp/`:

```bash
node --test tools.test.mjs smoke.test.mjs
```

The smoke test starts the server under a preload that throws if it opens a socket or calls `fetch`, then completes the MCP handshake and a tool call.

The browser suite is `tests.html`, served over HTTP.

## Not in this version

- A safe-withdrawal-rate solver (spend until a target success rate).
- A Social Security claiming sweep (62 versus 70 side by side).
- Moving `app.js` onto this adapter. The page still assembles its own inputs and calls `FirecalcSim` directly. The adapter mirrors that assembly so the two cannot quietly use different trial code. Wiring the page through the adapter is a follow-up.
- Coast, barista, or sabbatical math.
- Any hosted compute API. A link-only Worker in `workers/firecalc-link-mcp/` builds URLs and does not run trials.

Shuffled paths already use `FirecalcSim.seededRandom`. Pass `seed` to repeat them.
