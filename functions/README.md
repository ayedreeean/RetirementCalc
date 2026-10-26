# Email signup (Pages Function)

The calculator still runs in the browser. `functions/api/signup.js` only stores an opt-in email list. It does not import `market-data.js` and it does not return a success rate.

Binding: **D1**, variable name **`FIRECALC_SIGNUPS`**.

Stored columns: `email`, `created_at`, `updated_at`, `consent` (always 1), `consent_text`, `plan_url`, `source`, `unsubscribe_token`.

`plan_url` is a canonical `https://firecalc.ai/?…` share link. Unknown query keys are rejected. Raw IP addresses are not stored. Rate-limit buckets keep a hash of the connection address and are deleted after two days.

If `env.FIRECALC_SIGNUPS` is missing, both endpoints return HTTP 503 and the form says signup is not available. The calculator still works.

Spam control is a honeypot field (`fc_website`) plus the rate limit (8 attempts per hour and 30 per day for a connection). Turnstile is not wired, so no site key or secret is required. Do not add a secret to this repo.

## What Adrian does once, before the form works in production

The live site is the existing Cloudflare Pages project for `firecalc.ai`, deployed from Git. Do not attach this database to the `firecalc-link-mcp` Worker.

1. In the Cloudflare dashboard, open **Workers & Pages → D1 SQL database → Create**. Name it `firecalc-signups`. The free allowance is enough for this list.
2. Open the **Pages** project that serves `firecalc.ai` (not the link-only MCP worker). Go to **Settings → Bindings → Add → D1 database**.
   - Variable name: `FIRECALC_SIGNUPS` (this exact name).
   - D1 database: `firecalc-signups`.
   - Apply it to **Production**. Preview deployments can use the same database or stay unbound. Unbound previews fail the form gracefully.
3. **Redeploy** the production project. A binding is picked up on the next deployment, not on save alone.
4. Tables are created on the first signup. To create them yourself instead:

   ```bash
   npx wrangler d1 execute firecalc-signups --remote --file=schema/signups.sql
   ```

5. On `https://firecalc.ai`, run a plan, submit **Save my plan link** with a real address, then delete it at `https://firecalc.ai/unsubscribe`.

Do not add `pages_build_output_dir` to the root `wrangler.toml` unless `database_id` has been replaced with the id from `npx wrangler d1 info firecalc-signups` and you mean for that file to become the production Pages config. Until then, the dashboard binding is the production setup. Do not commit API keys, and do not `wrangler pages deploy` from a machine that would publish the placeholder database id.

## Local preview

From the repository root, with Wrangler 3.45 or newer:

```bash
npx wrangler pages dev . --d1 FIRECALC_SIGNUPS=local-firecalc-signups
```

The root `wrangler.toml` already points the local binding at `local-firecalc-signups`. Data stays in `.wrangler/`, which is gitignored.

Without the flag and without a D1 binding, `POST /api/signup` returns 503.

## Sending mail later

This PR does not send email. The consent copy says a monthly re-check is the purpose of the list, and the form says sending is not connected yet.

A follow-up needs a mail provider (Cloudflare Email Routing does not send this kind of message) and a secret for that provider. Keep the secret in the Pages dashboard or `wrangler secret`, never in Git. A scheduled Worker can read `FIRECALC_SIGNUPS` and post to that provider. The unsubscribe token stored on each row is for a future one-click link: `POST /api/unsubscribe` with JSON `{ "token": "<64 hex chars>" }` deletes that row. `POST` with `{ "email": "person@example.com" }` deletes by address. Deletion removes the row. There is no archive.

Until that worker exists, the list is only the rows in D1. Export them with `npx wrangler d1 execute firecalc-signups --remote --command "SELECT email, created_at, source FROM signups"` when you need them. That command prints addresses in your terminal. Do not paste the output into a ticket.
