# FIREcalc plan mail

This Worker sends the two opted-in emails. The public site does not run the calculator for a visitor, and this Worker has no public simulation route.

- **Quarterly check-in.** The first weekday of January, April, July, and October, at 15:00 UTC. Cron fires on days 1–7 of those months (`0 15 1-7 1,4,7,10 *`) so a held January can be retried after the limits file is filled and the Worker is redeployed. The first weekday is the day a ready email goes out. After day 7, recovery is `POST /admin/run`.
- **January checkpoint.** In January this replaces the quarterly note for anyone who asked for it. Someone who asked only for the quarterly note still gets that note in January.
- **Personalization** uses the saved share link and the same calculator code, inside this Worker only. Path count is capped at 1,000.

`DRY_RUN` defaults to `"true"`. A deploy does not mail the list. Live mail requires `DRY_RUN` to be exactly `"false"` and `MAIL_POSTAL_ADDRESS` to be a real postal address (at least 8 characters, and not `POSTAL ADDRESS NEEDED`).

## Provider

Use **Cloudflare Email Service** (`send_email` binding `EMAIL`). No vendor API key. The only secret is `ADMIN_TOKEN`, set with `wrangler secret put`.

Email Service is documented for transactional mail, not newsletters. These messages are opted-in reminders of the person’s own saved plan (one address per message, one-click unsubscribe, a physical-address footer). They are not a promotional blast. If Cloudflare refuses a send as marketing, the single `env.EMAIL.send` call in `mail/campaign.js` is the place to swap in another provider later. Do not add that provider’s secret until then.

After `firecalc.ai` is onboarded, Email Service can send to any recipient. Before that, it can send only to verified destination addresses. New accounts have a conservative daily quota. This list is small. Workers **Paid** is required in practice: a batch of plan runs will exceed the Free plan CPU limit. Lower `MAIL_BATCH` if a cron log shows a CPU limit.

## What Adrian does

The production D1 database `firecalc-signups` (`c428a9dc-6ecd-4d6f-96fa-c5af3739fe04`) is already bound to the Pages project as `FIRECALC_SIGNUPS`. Do not create another database. Do not attach this Worker to `workers/firecalc-link-mcp`. Do not add `pages_build_output_dir` to the root `wrangler.toml`. Do not `wrangler pages deploy` from the repository root.

1. Confirm the Cloudflare account is on **Workers Paid**.
2. Onboard **Email Sending** for `firecalc.ai` (the zone must be on Cloudflare DNS). From a logged-in machine:

   ```bash
   npx wrangler email sending enable firecalc.ai
   ```

   Or use the dashboard: **Email Service → Email Sending → Onboard domain**. That adds the sending records (MX and SPF on the bounce host, DKIM, and DMARC guidance). Leave existing mail for the domain alone if Email Routing is already in use; follow the dashboard’s DNS diff rather than pasting records by hand.
3. From `workers/firecalc-mail`:

   ```bash
   npx wrangler deploy
   ```

   This publishes the Worker, the cron, the D1 binding, and the `EMAIL` binding. It does not publish the Pages site.
4. Set the admin secret. It never goes in Git:

   ```bash
   npx wrangler secret put ADMIN_TOKEN
   ```

   Use a long random value (`openssl rand -hex 32`).
5. Keep `DRY_RUN = "true"` for the first deploy. Send yourself one preview. This does not mark a real quarter as sent, and it can deliver a held January so you can see placeholders:

   ```bash
   curl -sS -X POST "https://firecalc-mail.<account>.workers.dev/admin/test-send" \
     -H "authorization: Bearer $ADMIN_TOKEN" \
     -H "content-type: application/json" \
     -d '{"to":"you@yourdomain.com","kind":"quarterly","year":2026,"planUrl":"https://firecalc.ai/?tab=accumulation&currentAge=42&currentSavings=350000&income=120000&expenses=60000&targetAmount=1500000&stockAllocation=70&incomeGrowth=2&savingsSimulationCount=1000&savingsReturnMode=shuffled&seed=246813"}'
   ```

   The workers.dev hostname is printed by `wrangler deploy`. `GET /health` needs no token and does not run a plan. `POST /admin/dry-run` with the same JSON (no `to`) returns one HTML body and does not send.
6. Replace the postal placeholder with a real street address, then redeploy. Dashboard **Settings → Variables**, or change `MAIL_POSTAL_ADDRESS` in `wrangler.toml` and `npx wrangler deploy`. The value is public in every email footer (CAN-SPAM). It is not a secret. Until it changes, live sends stay blocked. Dry-run still renders.
7. When a test message looks right, set `DRY_RUN = "false"` in `wrangler.toml` and `npx wrangler deploy` again. The next first-weekday window mails the list, 25 people per cron day.
8. Fill `data/annual-limits.json` when the IRS publishes 2027 401(k), catch-up, and IRA limits. Do not guess. Until those fields are numbers, the January send is recorded as `blocked` and the log event is `mail-blocked`. Quarterly mail in April, July, and October does not wait on that file. Redeploy after editing the file. Days 1–7 of January retry automatically.

Unsubscribe in the message is one click: mail clients `POST` `https://firecalc.ai/api/unsubscribe?token=…` with body `List-Unsubscribe=One-Click`. The visible link is `https://firecalc.ai/unsubscribe?token=…`. Both delete the signup, the send log, and the stored plan snapshot.

Tables are created on the first signup or the first cron. Optional, on a machine that is already logged in:

```bash
npx wrangler d1 execute firecalc-signups --remote --file=schema/signups.sql
npx wrangler d1 execute firecalc-signups --remote --file=schema/email.sql
```

`CREATE TABLE IF NOT EXISTS` will not add columns to the table that already exists. The Pages Function and this Worker run `ALTER TABLE` for `wants_quarterly` and `wants_january`.

To retry outside the window, or to preview counts without sending:

```bash
curl -sS -X POST "https://firecalc-mail.<account>.workers.dev/admin/run" \
  -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"now":"2026-04-01T15:00:00.000Z"}'
```

That response is counts only. Add `"live": true` only when `DRY_RUN` is already `"false"`. Otherwise the run stays a dry-run even if `live` is true. `"force": true` ignores the calendar window.

Exporting the list prints email addresses in your terminal. Do not paste that output into a ticket:

```bash
npx wrangler d1 execute firecalc-signups --remote --command "SELECT email, created_at, source FROM signups"
```
