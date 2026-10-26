# FIREcalc plan mail

This Worker sends the two opted-in emails. The public site does not run the calculator for a visitor, and this Worker has no public simulation route.

- **Quarterly check-in.** The first weekday of January, April, July, and October, at 15:00 UTC. Cron fires on days 1–7 of those months (`0 15 1-7 1,4,7,10 *`) so a held January can be retried after the limits file is filled and the Worker is redeployed. The first weekday is the day a ready email goes out. After day 7, recovery is `POST /admin/run`.
- **January checkpoint.** In January this replaces the quarterly note for anyone who asked for it. Someone who asked only for the quarterly note still gets that note in January.
- **Personalization** uses the saved share link and the same calculator code, inside this Worker only. Path count is capped at 1,000.

`DRY_RUN` defaults to `"true"`. A deploy does not mail the list. Live mail requires both of these, and either one is enough to refuse a send:

- `DRY_RUN` is exactly the string `"false"`. A boolean `false` does not turn sending on.
- `POSTAL_ADDRESS` is a real postal address (at least 8 characters, and not `POSTAL ADDRESS NEEDED`). `MAIL_POSTAL_ADDRESS` is read only when `POSTAL_ADDRESS` is unset. The value in `wrangler.toml` is `Table Mahjong LLC, 5900 Balcones Drive, Ste 100, Austin, TX 78731`.

While the postal value is unset, the cron records `blocked` / `POSTAL_ADDRESS` and logs `mail-blocked`. `POST /admin/test-send` returns HTTP 409 with `blocked: ["POSTAL_ADDRESS"]` and does not call `EMAIL.send`. `POST /admin/dry-run` still returns HTML.

## Provider

Use **Cloudflare Email Service** (`send_email` binding `EMAIL`). No vendor API key. The only secret is `ADMIN_TOKEN`, set with `wrangler secret put`.

Email Service is documented for transactional mail, not newsletters. These messages are opted-in reminders of the person’s own saved plan (one address per message, one-click unsubscribe, a physical-address footer). They are not a promotional blast. If Cloudflare refuses a send as marketing, the single `env.EMAIL.send` call in `mail/campaign.js` is the place to swap in another provider later. Do not add that provider’s secret until then.

After `firecalc.ai` is onboarded, Email Service can send to any recipient. Before that, it can send only to verified destination addresses. New accounts have a conservative daily quota. This list is small. **Workers Paid may be required to turn Email Sending on at all**, and it is required in practice for this Worker: a batch of plan runs will exceed the Free plan CPU limit (10 ms). Lower `MAIL_BATCH` if a cron log shows a CPU limit.

## What Adrian does

The production D1 database `firecalc-signups` (`c428a9dc-6ecd-4d6f-96fa-c5af3739fe04`) is already bound to the Pages project as `FIRECALC_SIGNUPS`. Do not create another database. Do not attach this Worker to `workers/firecalc-link-mcp`. Do not add `pages_build_output_dir` to the root `wrangler.toml`. Do not `wrangler pages deploy` from the repository root.

1. Confirm the Cloudflare account is on **Workers Paid**. Email Sending onboarding can require Paid on its own. This Worker also needs Paid because the plan batch exceeds the Free CPU limit.
2. Onboard **Email Sending** for `firecalc.ai` (the zone must be on Cloudflare DNS). From a logged-in machine:

   ```bash
   npx wrangler email sending enable firecalc.ai
   ```

   Or use the dashboard: **Email Service → Email Sending → Onboard domain**. That adds sending records on `cf-bounce.firecalc.ai` (MX, an SPF TXT with `include:_spf.mx.cloudflare.net`, and DKIM at `cf-bounce._domainkey`). Those records do not replace the root MX or the root SPF.

   `firecalc.ai` today is Namecheap mail forwarding: MX `eforward*.registrar-servers.com`, one root SPF TXT `v=spf1 include:spf.efwd.registrar-servers.com ~all`, no DKIM, and no DMARC. Keep that single root SPF. If onboarding wants another SPF include on the root, merge it into this TXT. Do not publish a second SPF record. Leave the Namecheap MX in place.

   Add a DMARC TXT at `_dmarc.firecalc.ai`:

   ```text
   v=DMARC1; p=none; rua=mailto:hello@tablemahjong.com
   ```

   Start at `p=none`. Cloudflare’s example `p=reject` would fail Namecheap-forwarded mail that is not DKIM-aligned. Tighten the policy after both the forwarder and Email Sending pass DMARC.
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
5. Keep `DRY_RUN = "true"`. `POST /admin/dry-run` returns one HTML body and does not send. `GET /health` needs no token and does not run a plan. The workers.dev hostname is printed by `wrangler deploy`.
6. `POSTAL_ADDRESS` is already `Table Mahjong LLC, 5900 Balcones Drive, Ste 100, Austin, TX 78731`, and `MAIL_REPLY_TO` is `hello@tablemahjong.com`. Both are public. They are not secrets. Leave `DRY_RUN = "true"`. The footer reads: `FIREcalc is a product of Table Mahjong LLC · 5900 Balcones Drive, Ste 100, Austin, TX 78731 · Questions: hello@tablemahjong.com`. Clearing `POSTAL_ADDRESS` makes cron and `POST /admin/test-send` refuse again (test-send returns 409).
7. Send yourself one preview. This bypasses dry-run and the calendar, can deliver a held January, and does not mark a real quarter sent:

   ```bash
   curl -sS -X POST "https://firecalc-mail.<account>.workers.dev/admin/test-send" \
     -H "authorization: Bearer $ADMIN_TOKEN" \
     -H "content-type: application/json" \
     -d '{"to":"you@yourdomain.com","kind":"quarterly","year":2026,"planUrl":"https://firecalc.ai/?tab=accumulation&currentAge=42&currentSavings=350000&income=120000&expenses=60000&targetAmount=1500000&stockAllocation=70&incomeGrowth=2&savingsSimulationCount=1000&savingsReturnMode=shuffled&seed=246813"}'
   ```

8. When a test message looks right, set `DRY_RUN = "false"` in `wrangler.toml` and `npx wrangler deploy` again. The next first-weekday window mails the list, 25 people per cron day. A cron with the postal address still unset logs `mail-blocked` and writes `blocked` / `POSTAL_ADDRESS`. It does not send.
9. Fill `data/annual-limits.json` when the IRS publishes 2027 401(k), catch-up, and IRA limits. Do not guess. Until those fields are numbers, the January send is recorded as `blocked` and the log event is `mail-blocked`. Quarterly mail in April, July, and October does not wait on that file. Redeploy after editing the file. Days 1–7 of January retry automatically.

## Unsubscribe tokens

The token is 32 random bytes (`crypto.getRandomValues`), stored on the signup row, 64 hex characters in the URL. It is not an HMAC of the address. An HMAC would need a second secret, a leaked secret could forge an unsubscribe for any inbox, and the URL would be tied to the address. The random token does not reveal the address, and deleting the row revokes it.

`GET /api/unsubscribe?token=…` redirects to `/unsubscribe?token=…` (http on localhost, https otherwise). A mail client `POST`s `https://firecalc.ai/api/unsubscribe?token=…` with body `List-Unsubscribe=One-Click` and gets **204** with an empty body, including when the token is unknown. The human form still returns the usual “if that email was on the list” page. An email-only delete from another site is still rejected.

Unsubscribe deletes the signup, the send log, and the snapshot, then stores `SHA-256("firecalc-suppress-v1:" + address)` in `email_suppressions` with reason `unsubscribe`. The prefix is not a secret. A later signup that checks the current consent box clears that one reason and stores consent version `2026-10-26.2`. A signup without the checkbox does not clear the hash and does not insert a row. Reasons `complaint`, `hard_bounce`, and `provider` are not cleared by a new checkbox. The cron checks the hash even if a signup row exists, records status `suppressed`, and does not send. `suppressed` is treated like `sent` for that campaign, so it is not retried. `email_sends.campaign` is `kind:period`, with a unique `(campaign, email)` index.

## Bounces and complaints

Cloudflare Email Service already suppresses hard bounces and complaints on its side. This Worker exports `queue()`. When a consumer is attached, `cf.email.sending.message.complained` and a hard `cf.email.sending.message.bounced` write the hash (reason `complaint` or `hard_bounce`) and delete the signup. Soft bounces and `message.deferred` are ignored.

**That consumer is not deployed.** `wrangler.toml` has no `queues.consumers` block, because a deploy fails until the queue exists. Until Adrian creates the queue and subscribes this Worker, bounce and complaint events are not applied here. The fallback is `E_RECIPIENT_SUPPRESSED` from `EMAIL.send`: that writes reason `provider` and records `suppressed`, so the next cron does not keep trying. Cloudflare’s own suppression list still blocks the address when that error is thrown.

Adding the consumer later is a dashboard/queue step plus a `[[queues.consumers]]` binding. Do not add it before the queue exists.

Tables are created on the first signup or the first cron. Optional, on a machine that is already logged in:

```bash
npx wrangler d1 execute firecalc-signups --remote --file=schema/signups.sql
npx wrangler d1 execute firecalc-signups --remote --file=schema/email.sql
npx wrangler d1 execute firecalc-signups --remote --file=schema/email-prefs.sql
```

`CREATE TABLE IF NOT EXISTS` will not add columns to a table that already exists. The Pages Function and this Worker `ALTER TABLE` for `wants_quarterly`, `wants_january`, `consent_version`, and `email_sends.campaign`, then create the unique campaign index. Those ALTERs are not in the SQL files, so re-running the files does not fail on a duplicate column. The `consent_version` default on existing rows is `2026-10-26.1`. New signups write `2026-10-26.2`.

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
