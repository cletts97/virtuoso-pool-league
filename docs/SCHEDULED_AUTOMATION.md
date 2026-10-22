# Supabase Cron: weekly newsletter and result follow-up

The scheduler calls the existing Azure Functions API; that API uses the existing Supabase database and Resend sender. There is no Azure timer, Logic App, new email service or frontend secret. Supabase documents [Cron HTTP jobs](https://supabase.com/docs/guides/cron/quickstart) and [Vault-backed HTTP authentication](https://supabase.com/docs/guides/functions/schedule-functions).

## Behaviour

- **Monday 07:00 Europe/London:** send one Virtuoso-branded HTML email, with plain-text fallback, to every active invited/confirmed account, including colleagues who only play casually. Show scheduled/postponed published league fixtures due Monday–Sunday, highlight the recipient's own fixtures and label semifinals/finals. Include league results confirmed in the previous Monday–Sunday, when any exist; pending/disputed/casual results are excluded. A correction counts in the week of its latest confirmation/correction. **No upcoming fixtures this week means no newsletter**, even when last week had results. The worker rechecks upcoming fixtures before delivery too. Each list is capped at 100 entries with a link to the full app.
- **Hourly, on the hour:** pending league/casual results whose latest submission is at least 24 but under 48 hours old get one reminder per opposing active player. Doubles teammates of the submitter never receive approval reminders. Deduplication is per submission/recipient, so hourly repeats do not resend the same reminder. Resubmitting a disputed casual score starts a new clock.
- **At least 48 hours after submission:** still-pending valid scores are confirmed automatically. Because checks run hourly, this normally happens between 48 and 49 hours, not at the exact minute. Disputed/cancelled/already-confirmed results and closed league stages are never auto-confirmed. Automatic events show **System / Automatically confirmed**, preserve the submitted score and history, update standings/H2H, and use the existing playoff progression/tie safeguards. An administrator can subsequently correct a result using the existing audited workflow.
- The clock uses elapsed UTC hours for result deadlines, so DST does not shorten or lengthen the review period. Newsletter weeks/times use Europe/London.
- Every send rechecks the active application profile, invited/confirmed Auth identity and permitted email domain. Newsletters require no season membership. Shared locks serialize automatic updates with player disputes/approvals. Links still require normal sign-in and authorization.

## 1. Apply the additive migration

Review and run the complete [20261022000400_scheduled_automation.sql](../supabase/migrations/20261022000400_scheduled_automation.sql) once in Supabase Cloud SQL Editor, after earlier migrations. Do not re-run the initial schema or reset the database.

This adds explicit automatic-confirmation audit metadata and extends the existing server-only outbox for reminders and HTML newsletters. Existing review-email uniqueness, grants, RLS and result-history protection remain. The initial review and reminder have separate stable event keys; reminders retain their original submission ID for stale-result checks.

The migration itself **does not register Cron jobs or send email**. It was applied/tested only locally during implementation.

## 2. Configure Azure and deploy

Keep the existing working Resend settings (`ALLOW_RESULT_EMAIL=true`, `RESEND_API_KEY`, `RESULT_EMAIL_FROM`, `APP_URL`) and add these **API environment variables** in Azure Static Web Apps → Environment variables → Production:

| Setting | Value |
| --- | --- |
| `AUTOMATION_SECRET` | A fresh random secret of at least 32 characters; 32 random bytes encoded as 64 hex characters is suitable. |
| `AUTOMATION_ENABLED` | `true` when ready to activate all three behaviours above. |

Generate the secret locally, keep it outside Git, and do not paste it into chat. For example, run this in your own terminal and copy its result into Azure and Vault:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

These are **not** `VITE_` variables or GitHub frontend build variables. Deploy frontend and API through the normal GitHub Actions workflow after the migration. Supabase SMTP/invitation settings do not change.

**Activation processes existing overdue submissions too:** any still-pending result already over 48 hours old can be confirmed on the first results run. Review old test scores/disputes before activation. At that first run, results already over 48 hours old are confirmed directly rather than being sent a late 24-hour reminder.

## 3. Store two Supabase Vault secrets

In Supabase's Vault interface, create:

| Vault secret name | Value |
| --- | --- |
| `vpl_app_url` | `https://virtuosopool.app` (the application origin, no `/api` suffix) |
| `vpl_automation_key` | Exactly the same value as Azure's `AUTOMATION_SECRET` |

The key is unrelated to Supabase's publishable/service keys and Resend's API key. Do not put its literal value into a Cron command or committed SQL. Rotate it in both Azure and Vault together if required.

## 4. Register the jobs

Once the deployed API and settings are ready, run the complete [supabase/cron/setup.sql](../supabase/cron/setup.sql) in Supabase SQL Editor as the project owner. It enables `pg_cron` and `pg_net`, creates a tightly restricted dispatcher that reads Vault, and registers:

| Job | UTC schedule | Endpoint |
| --- | --- | --- |
| `vpl-weekly-newsletter` | `0 6,7 * * 1` | `POST /api/automation/weekly` |
| `vpl-hourly-results` | `0 * * * *` | `POST /api/automation/results` |

Supabase Cron schedules use GMT/UTC. Calling at both 06:00 and 07:00 UTC on Monday handles BST/GMT automatically: the API only accepts weekly work in the 07:xx **Europe/London** hour. The other weekly call returns `skipped: true`. Re-running setup with the same job names updates the schedules rather than creating duplicate names.

No secret appears in the stored job commands. Both endpoints are disabled by default and require the private `X-VPL-Automation-Key` header; normal user/admin session tokens do not authorize them. Requests cannot supply recipients, scores, timestamps or arbitrary tasks.

## 5. Check operation

In Supabase → Integrations → Cron, check job history. Also inspect the **HTTP** result: Cron success means the HTTP request was queued, not that Azure accepted it or an email reached an inbox.

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname in ('vpl-weekly-newsletter','vpl-hourly-results');

select id, status_code, timed_out, error_msg, created
from net._http_response
order by created desc limit 20;

select purpose, status, count(*)
from public.result_email_outbox
group by purpose, status order by purpose, status;
```

Expected HTTP status is 200; 401 usually means the Azure/Vault secrets differ, 404 means automation is disabled or the API has not been deployed, and 503 requires checking API/database/email configuration. A weekly 200 response with `skipped: true` outside the London 07:xx window is expected. Resend acceptance is not proof of inbox delivery: check the provider's delivery/bounce log and an approved recipient's inbox.

Scheduled requests drain up to 20 due emails within a bounded HTTP time budget; unattempted jobs return to pending. Larger backlogs or slow providers continue on later hourly requests or the existing administrator retry action. Delivery uses leases, stable idempotency keys, five attempts with backoff and a 23-hour expiry. Failed/expired emails need operator review; the system does not silently resend a new weekly issue or duplicate a reminder. A provider can reject simultaneous senders with rate limiting; retries remain queued. No SMTP/Resend network request was made by the implementation tests.

Do not manually invoke `/automation/results` as a read-only test: it really confirms due scores and sends eligible email. Calling the weekly endpoint outside its time window does not provide a newsletter preview or bypass that window. Focused local integration tests use a fake sender and cover all behaviours without contacting colleagues.

## Pause or disable

- Set `AUTOMATION_ENABLED=false` to disable the scheduler endpoints; ordinary application use and normal result emails remain available. Also deactivate both Cron jobs in the dashboard to stop failed scheduled requests.
- Setting `ALLOW_RESULT_EMAIL=false` stops all application result/newsletter email; scheduled operations also refuse to run, so automatic confirmations pause. Supabase Auth SMTP is separate.
- To remove the jobs, use the Cron dashboard or `cron.unschedule('vpl-weekly-newsletter')` / `cron.unschedule('vpl-hourly-results')`. Leave audit/outbox records intact.

No cloud migration, live Cron registration, production deployment or real email was performed automatically.
