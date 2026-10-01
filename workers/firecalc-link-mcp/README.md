# FIREcalc link-only MCP

A hosted [Model Context Protocol](https://modelcontextprotocol.io) server for ChatGPT Apps connector tests. It speaks MCP at `POST /mcp` and answers `GET /` with a health check.

It **builds links**. It does not run FIREcalc.

| Does | Does not |
| --- | --- |
| `build_firecalc_link` — `https://firecalc.ai` share URL | Retirement trials, savings trials, success rates |
| `challenge_link` — `https://firecalc.ai/?pack=<id>` | Stress-pack replays or a gauntlet |
| `list_stress_packs` — ids, names, years, challenge URLs | Accept a portfolio and return a result |
| `describe_methodology` — sample, definitions, limits | Invent a portfolio, withdrawal, income, spending, goal, or Social Security benefit |
| `validate_share_params` — read a share URL | Call `FirecalcSim` |

URL encoding goes through `FirecalcIO` in `firecalc-io.js`, via `mcp/share-link.mjs`. That module does not import `market-data.js`. The local stdio server in `mcp/server.mjs` is a different program: it can run the engine on the person’s computer. This worker does not.

Non-dollar form defaults match the calculator (age 65, 60% stocks, flat 15% tax, shuffled years, seed `246813`, Social Security off). When Social Security is off, the share link still carries the form’s unused benefit fields (`ssMonthlyBenefit=2000`, `spouseSSMonthlyBenefit=1500`). Assumptions say those fields are not used. They are not a plan. A turned-on benefit is required and is never filled in.

This is an illustration, not advice.

## Privacy

- The worker does not log request bodies, tool arguments, query strings, or dollar amounts.
- The only log line is JSON with `route`, `rpc` method, `tool` name, HTTP `status`, and an error code. See `src/index.js`.
- It does not write plan inputs to storage. There is no KV, D1, or R2 binding.
- A share URL still contains the numbers, the same way the calculator’s share button does. Treat that URL like a note. A challenge link (`?pack=dotcom`) does not contain a portfolio.
- Do not add `console.log` of `request`, `request.text()`, or tool arguments. Do not enable a Cloudflare logpush job that stores HTTP bodies. Invocation logs in `wrangler.toml` are metadata, not payloads.
- The privacy policy that describes this draft is https://firecalc.ai/privacy-policy.html

## Run it locally

From this directory, with Node 18 or newer:

```bash
npm install
npx wrangler dev
```

Wrangler serves `http://127.0.0.1:8787`. Check:

```bash
curl -s http://127.0.0.1:8787/
curl -s http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Health JSON has `"compute": false`. The tool list is the five link tools above. `retirement_success`, `years_to_target`, and `run_stress_pack` are not on this server.

There is no OAuth. `/.well-known/oauth-protected-resource` returns 404 so the ChatGPT connector wizard does not treat a missing auth server as a crash. Add the connector with **no authentication**.

## Tunnel, then ChatGPT Developer Mode

ChatGPT has to reach a public HTTPS URL. From another terminal, while `wrangler dev` is running:

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

or:

```bash
ngrok http 8787
```

Copy the `https://…` host and add `/mcp`.

In ChatGPT:

1. Open **Settings → Apps & Connectors → Advanced settings** and turn on **Developer mode**.
2. Create a connector. Paste the tunnel URL ending in `/mcp` (for example `https://<subdomain>.ngrok.app/mcp`).
3. Name it `FIREcalc`. Description: `Builds firecalc.ai share and challenge links. Does not calculate success rates.`
4. Authentication: **None**.
5. Open a new chat, add the connector from the **+** menu, and try the prompts in `SUBMISSION.md`.

Confirm the model returns a `firecalc.ai` URL and does not answer with a success percentage from this server. Opening the URL runs the plan in the browser.

## Deploy

This worker is not the Pages site. The site is the repository root (static HTML, no build). Do not set the Pages root to this folder. Do not add a route for `firecalc.ai/*` on this worker. That would put MCP in front of the calculator.

```bash
npx wrangler deploy
```

Wrangler prints a `*.workers.dev` host. Use `https://<that-host>/mcp` for the connector. A custom name such as `mcp.firecalc.ai` is a separate DNS route you add in the Cloudflare dashboard after you are ready. It is not configured in this repo. Until that exists, the connector URL is the workers host from the deploy, and https://firecalc.ai/ai still calls the listing **Draft**.

No secrets. Do not put API keys in `wrangler.toml` or `.dev.vars`. This server does not call OpenAI.

## What to put in the Platform Dashboard

Use `SUBMISSION.md` as the checklist: identity verification, privacy policy URL, logo, screenshots, test prompts, and the no-simulation statement. The app stays unpublished in the ChatGPT directory until that review is done. Developer Mode is the connector test, not a directory listing.

## Tests

From the repository root:

```bash
node --test workers/firecalc-link-mcp/test/link-mcp.test.mjs mcp/tools.test.mjs mcp/smoke.test.mjs
```

The link test checks URL parity with `FirecalcIO` and with the local `build_firecalc_link` tool, checks that missing dollar inputs are refused, and checks that logs do not contain the portfolio amount from the request.

## Pages

Leave the Cloudflare Pages project pointed at the repository root, with an empty build command. This directory has its own `package.json` so that `npm install` stays here. Do not add a root `package.json` for Pages to pick up.
