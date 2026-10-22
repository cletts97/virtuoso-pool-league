# Score-review emails with Resend

Supabase SMTP sends invitation/password emails only. Score-review emails now use Resend's HTTPS API separately, through the existing Azure Functions backend. No extra infrastructure or npm dependency is required. Delivery remains disabled until configured; no real emails were sent during development.

For the Monday newsletter (including last week's results), 24-hour result reminders and 48-hour automatic confirmation, follow [Scheduled automation setup](SCHEDULED_AUTOMATION.md). This requires the additional automation migration, two Azure API settings, Vault secrets and operator-created Cron jobs; none are activated automatically.

## Enable in production

1. Review and run the complete [20261022000200_result_email_outbox.sql](../supabase/migrations/20261022000200_result_email_outbox.sql) in your Supabase Cloud **SQL Editor** once. This adds a protected queue table only. It was applied/tested locally; the cloud migration has not been applied automatically. Do not rerun the initial schema or reset the database.
2. Create a Resend API key with sending permission, preferably restricted to the verified domain you already use for invitations. Choose a sender address on that verified domain.
3. Set these **Azure Static Web App → Environment variables → Production** values for the API:

   | Setting | Value |
   | --- | --- |
   | `ALLOW_RESULT_EMAIL` | `true` |
   | `RESEND_API_KEY` | Your private sending API key |
   | `RESULT_EMAIL_FROM` | Plain verified sender address, e.g. `pool@your-domain.example` |
   | `APP_URL` | `https://virtuosopool.app` |

   These are server settings, not `VITE_` variables or GitHub frontend build values. Keep credentials out of source control. `ALLOW_AUTH_EMAIL` and Supabase SMTP remain unchanged.
4. Deploy the updated frontend and API through the normal GitHub Actions workflow. In **Administration → Season & configuration → Score-review emails**, select **Check email queue**. With an approved test recipient, submit one new test result and check Resend delivery logs and the recipient's inbox. Resend accepting a message is not proof of inbox delivery; bounces/provider account limits still apply.

## Behaviour and retries

- A new league or casual dispute also queues one alert per active administrator, linking directly to that game. Dispute reasons stay inside the signed-in application, not the email. The worker rechecks administrator role before sending and skips resolved/superseded disputes or demoted/inactive accounts. This uses the existing outbox and `ALLOW_RESULT_EMAIL` setting; no new migration or credentials are needed. Existing disputes are not emailed retroactively.
- New league/casual submissions and casual resubmissions create one queue entry per active opposing player in the same PostgreSQL transaction as the result. A submitter or doubles teammate never receives a review request for their own submission. Old pending results are not automatically emailed when enabling the feature.
- After commit, the API attempts at most two due messages. Provider failure does not undo or falsely fail a saved result. The email contains a pending-score summary and a match link requiring sign-in; it never approves/disputes anything by clicking it.
- Failed attempts use exponential backoff, at most five attempts. Retries run on subsequent successful command requests, via the administrator's **Retry due emails** button, or the optional hourly Supabase Cron job once configured. Managed Free Functions still use HTTP endpoints rather than a timer trigger. The button processes at most two due messages per click, respecting backoff; scheduled requests process bounded batches up to 20. Queue counts distinguish pending, failed/expired and messages accepted by Resend.
- Workers lease rows with `SKIP LOCKED`. Database uniqueness and a stable Resend idempotency key suppress duplicate submission/delivery attempts. [Resend retains idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys), so retries expire conservatively after 23 hours. Failed/expired items require operator investigation, not blind forced resend.
- Before sending, the worker rechecks the active profile, invited/confirmed Auth identity and current opposing-player eligibility. Already-reviewed, corrected, ended, cancelled or superseded submissions are skipped. A review can still happen while an email is in flight; the link always opens current data.
- Queue payloads and recipient resolution stay server-only under RLS/restricted grants. Provider bodies, addresses, tokens and keys are never returned in errors or logged. No generic client-supplied-recipient send endpoint exists. The Resend adapter implements the existing `EmailDelivery` interface so another provider can be added later.

Set `ALLOW_RESULT_EMAIL=false` to stop delivery without affecting results or Supabase Auth mail. Disabled submissions do not queue messages. Apply the migration before enabling: failure to persist an enabled queue entry rolls back the result transaction atomically, preventing a silently lost email job.

## Recent-results publication

The main dashboard and `/display` now share an explicitly allowlisted feed of league and casual results, including pending/disputed scores and cancelled/voided results with a recorded score. Draft-season fixtures and unplayed matches are excluded. Results are ordered by latest recorded update; the dashboard shows three, while TV pages through up to six every 15 seconds (two at a time for long names).

Every row labels league/casual, singles/doubles and confirmation status. Unconfirmed scores may change and never affect standings or head-to-head totals. This deliberately expands public **recent results** visibility at the owner's request: only names, score, match/type identifiers, status and update date are published, without audit actors, reasons, email addresses or private photos. Other public fixtures/casual-history snapshots keep their existing privacy filtering. Casual email links preserve the intended destination through sign-in.

## Checks performed

Focused unit tests cover recipient selection, Resend request/idempotency behaviour and the public result feed. A disposable local Supabase test with a fake delivery provider verifies queue persistence, provider failure without result rollback, concurrent retries, deduplication, stale suppression and client grant denial. No external delivery is exercised by these tests.
