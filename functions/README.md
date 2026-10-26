# Email signup (Pages Function)

The calculator still runs in the browser. `functions/api/signup.js` only stores an opt-in email list. It does not import `market-data.js` and it does not return a success rate.

Binding: **D1**, variable name **`FIRECALC_SIGNUPS`**.

Stored columns: `email`, `created_at`, `updated_at`, `consent` (always 1), `consent_text`, `consent_version`, `plan_url`, `source`, `unsubscribe_token`, `wants_quarterly`, `wants_january`. Older rows get both flags set to 1 when the columns are added. Existing rows get consent version `2026-10-26.1` (the older monthly sentence). A new or refreshed signup stores `2026-10-26.2`.

`plan_url` is a canonical `https://firecalc.ai/?…` share link. Unknown query keys are rejected. Raw IP addresses are not stored. Rate-limit buckets keep a hash of the connection address and are deleted after two days.

If `env.FIRECALC_SIGNUPS` is missing, both endpoints return HTTP 503 and the form says signup is not available. The calculator still works.

Spam control is a honeypot field (`fc_website`) plus the rate limit (8 attempts per hour and 30 per day for a connection). Turnstile is not wired, so no site key or secret is required. Do not add a secret to this repo.

## Production binding

The live site is the existing Cloudflare Pages project for `firecalc.ai`. D1 database `firecalc-signups` (`c428a9dc-6ecd-4d6f-96fa-c5af3739fe04`) is already bound there as `FIRECALC_SIGNUPS` for production and preview. Do not create a second database. Do not attach this database to the `firecalc-link-mcp` Worker.

New columns and the send-log tables are created by the signup function and by the mail worker. Sending itself is a separate Worker. The steps are in `workers/firecalc-mail/README.md`.

Do not add `pages_build_output_dir` to the root `wrangler.toml` unless `database_id` has been replaced with the id from `npx wrangler d1 info firecalc-signups` and you mean for that file to become the production Pages config. Until then, the dashboard binding is the production setup. Do not commit API keys, and do not `wrangler pages deploy` from a machine that would publish the placeholder database id.

## Local preview

From the repository root, with Wrangler 3.45 or newer:

```bash
npx wrangler pages dev . --d1 FIRECALC_SIGNUPS=local-firecalc-signups
```

The root `wrangler.toml` already points the local binding at `local-firecalc-signups`. Data stays in `.wrangler/`, which is gitignored.

Without the flag and without a D1 binding, `POST /api/signup` returns 503.

## Sending

The sender is `workers/firecalc-mail`. It shares this D1 database. Pages cannot run a cron. Read that README for the domain, DNS (one root SPF, DMARC `p=none`), the `EMAIL` binding, `ADMIN_TOKEN`, the postal-address blocker, Workers Paid, and `DRY_RUN`.

The form offers a quarterly check-in and a January checkpoint. Both default on. Older “monthly reminder” signups receive those two emails instead. The unsubscribe token is 32 random bytes stored on the row, not an HMAC of the address. `GET /api/unsubscribe?token=` redirects to `/unsubscribe?token=`. `POST /api/unsubscribe` with JSON `{ "token": "<64 hex chars>" }` or `{ "email": "person@example.com" }` deletes the signup, the send log, and the snapshot, and stores a hash of the address with reason `unsubscribe`. A mail client one-click (`POST /api/unsubscribe?token=<64 hex>`, body `List-Unsubscribe=One-Click`, including from another site) does the same and returns **204** with an empty body. An unknown token still returns 204. An email-only delete from another site is still rejected.

A hashed suppression is checked before a new row is saved. Reason `unsubscribe` is removed only when the current consent box is checked. A submit without that box leaves the hash and saves nothing, so the address is not mailed again. Reasons `complaint`, `hard_bounce`, and `provider` are not cleared by the checkbox; the form returns 400. The cron also refuses a signup row whose address is still on that list.

Exporting the list prints addresses in your terminal. Do not paste that output into a ticket:

```bash
npx wrangler d1 execute firecalc-signups --remote --command "SELECT email, created_at, source FROM signups"
```
