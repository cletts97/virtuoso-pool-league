# Backend setup and deployment

The application has two explicit modes: browser-local **mock** mode and **api** mode using Supabase Auth plus an Azure Functions HTTP API backed by PostgreSQL. The deployed initial migration remains unchanged. No cloud deployment, cloud migration, real invitation or real email has been performed by this implementation.

## Environment variables

### GitHub Actions production configuration

The Azure-generated workflow originally supplied no frontend environment values and built the raw `api/` workspace. The 21 October authentication investigation found the deployed browser bundle had no configured cloud URL/public key and `/api/me` returned 404. The workflow now prepares the existing API-mode frontend/Functions artifacts on Node 22 and uploads them with both Azure build steps disabled.

Before pushing the workflow changes, add these **repository Actions variables** in GitHub → Settings → Secrets and variables → Actions → Variables:

- `VITE_SUPABASE_URL`: the cloud project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the project's public publishable/anon key, never its secret/service-role key.

The workflow sets `VITE_DATA_MODE=api` and `VITE_PUBLIC_APP_URL=https://virtuosopool.app`. It retains the generated `AZURE_STATIC_WEB_APPS_API_TOKEN_DELIGHTFUL_WATER_0712DDB03` Actions secret. Missing public configuration fails the build. Ignored local environment files are not available on GitHub; the preparation script now supports CI variables without `.env.local`.

Configure private server settings separately in **Azure Static Web App → Environment variables**, for the production environment: `DATABASE_URL`, `DATABASE_CA_CERT`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APP_URL=https://virtuosopool.app`, and `WORK_EMAIL_DOMAINS=*`. Copy the private connection/key/certificate values from your local configuration without committing them. Set `ALLOW_AUTH_EMAIL=true` when ready for app-issued invitation/reset delivery through the configured Supabase SMTP. `PUBLIC_DISPLAY_ENABLED` is independent and can remain false pending public-data approval. Runtime Azure settings do not inject Vite build values into the static JavaScript; changing frontend configuration requires a new build/deployment.

Mock mode remains useful for isolated local demos and tests; production must use API mode. The invitation page now explicitly explains when its build is in demo mode, instead of offering a verification action that cannot work. After deploying, `/login` should show real sign-in, and unauthenticated `/api/me` should return JSON with HTTP 401 (not 404). Then reopen a fresh invitation. No hosting settings were changed by this investigation, and authenticated cloud persistence is not verified until the deployed API works.

Copy the root `.env.example` to `.env.local` for Vite. Copy `api/.env.example` to `api/.env` for the local HTTP runner. Both destination files are ignored. Restart the corresponding process after editing settings.

| Variable                        | Location       | Purpose                                                                                                                                    |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `VITE_DATA_MODE`                | Frontend build | `mock` (default) or `api`. Build with `api` for shared data.                                                                               |
| `VITE_SUPABASE_URL`             | Frontend build | Supabase project URL; required in api mode.                                                                                                |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend build | Public publishable key, or legacy **anon** key. Never a secret/service-role key.                                                           |
| `VITE_PUBLIC_APP_URL`           | Frontend build | Optional canonical application origin for the TV booking QR code. Defaults to the current origin.                                          |
| `DATABASE_URL`                  | API only       | PostgreSQL connection URL. Use a connection/pooler endpoint reachable from Azure; URL-encode the password.                                 |
| `SUPABASE_URL`                  | API only       | The same Supabase project URL.                                                                                                             |
| `SUPABASE_SECRET_KEY`           | API only       | Supabase secret key or legacy service-role key for Auth administration.                                                                    |
| `APP_URL`                       | API only       | Canonical frontend origin for invitation/reset redirects. HTTPS outside localhost.                                                         |
| `WORK_EMAIL_DOMAINS`            | API only       | Use `*` for owner-approved any-domain invitation-only accounts, or comma-separated exact domains. Empty denies access/invitations. |
| `ALLOW_AUTH_EMAIL`              | API only       | Default `false`; invitation/reset email requests are disabled until explicitly enabled after delivery configuration and approval.          |
| `PUBLIC_DISPLAY_ENABLED`        | API only       | Default `false`; enable only after approving the allowlisted TV information for anonymous viewing.                                         |
| `DATABASE_CA_CERT`              | API only       | Optional PEM CA certificate for the database connection; literal `\n` escapes are supported.                                               |

All `VITE_` values become public JavaScript. The build rejects recognizable privileged Supabase keys, but configuration review is still required: never put database credentials or email secrets in any `VITE_` setting. Auth tokens are stored by the Supabase browser SDK; application data is stored in PostgreSQL in api mode. Browser storage otherwise holds only theme/season preferences and separate mock data.

Remote database connections require verified TLS. Connection-string TLS overrides are removed so they cannot silently disable verification. The pool has four connections per API process. Transactions execute as `service_role`; the connection login must be able to assume that role. This preserves the deployed append-only table grants, although the connection credential itself remains privileged and must be protected. Use the project's documented PostgreSQL/pooler credentials and supplied CA certificate if required; do not disable certificate verification to work around setup errors.

## Local development

Use Node **22.12+** with npm, Docker Desktop, and installed Google Chrome for browser tests.

```sh
npm ci
npx supabase start
npx supabase migration up --local
```

Use `npx supabase status` in your own terminal to obtain local connection settings. Do not paste secret output into source files, issues or chat. Configure the public URL/key in `.env.local`, set `VITE_DATA_MODE=api`, and configure private values in `api/.env`. Local frontend and API defaults are `http://127.0.0.1:5173` and `http://127.0.0.1:7071` respectively. Keep the hostname consistent because Auth storage and redirects are origin-specific.

In two terminals:

```sh
npm run dev:api
npm run dev
```

The local runner and Azure Functions use the **same request handler**. Vite proxies `/api` to port 7071. The API bundle is rebuilt when `dev:api` starts; restart it after server/domain changes. Frontend edits use Vite hot reload. The local runner is a development convenience, not the production Functions host.

For a local first administrator, use local Studio's Auth invitation flow with a disposable `@virtuoso.tech` account, accept the invitation via the local captured email, and assign the application role using the verified-UUID SQL in [DATABASE_SETUP.md](DATABASE_SETUP.md#6-bootstrap-the-first-application-administrator). Invitations create casual colleagues by default. The app's Players administration section can then enroll colleagues for a new singles season. Public signup remains disabled. Do not use `createUser` as the regular onboarding mechanism: protected API access requires an invited, confirmed work-email account.

For an isolated frontend demo, leave `VITE_DATA_MODE=mock` and run `npm run dev`; no services or accounts are needed. Live and mock records are not migrated into one another.

## Auth and email configuration before rollout

Supabase portal invitations may omit name metadata; the database then creates a profile named `Invited colleague`. In API mode, that account is prompted to choose a display name after login. Any active user can reopen the form using their header avatar. The validated self-service command changes only the authenticated user's name and related individual competition display names. It does not grant roles or league enrollment. App-issued invitations already provide the administrator-entered name.

### Production invitation acceptance URL — current setup

Invitations now use **`https://virtuosopool.app/auth/accept-invite`**. This public React route reuses the verified invitation/password-setup flow: exchange the invitation with Supabase, choose and confirm a password of at least 12 characters, then sign in. Merely visiting the address without a valid invitation does not create an account. `/auth/callback` remains available for password recovery and older invitation links.

In the hosted Supabase dashboard:

1. Under **Authentication → URL Configuration**, set **Site URL** to `https://virtuosopool.app` and allow exactly `https://virtuosopool.app/auth/accept-invite` and `https://virtuosopool.app/auth/callback` in **Redirect URLs**. Keep only any other callbacks you actually use, such as local development addresses.
2. Under **Authentication → Email Templates → Invite user**, copy the complete contents of `supabase/templates/invite.html`. Its fallback uses the Site URL plus `/auth/accept-invite`, so dashboard invitations also reach password setup. App-issued invitations explicitly supply that redirect. The template supports an approved alternate development origin through `RedirectTo`. The repository template is not installed in hosted Supabase automatically.
3. Set the deployed API's **`APP_URL=https://virtuosopool.app`**. This setting is the origin only; the API appends `/auth/accept-invite` for invitations and `/auth/callback` for resets. Leave the local API's localhost origin in place for local development.
4. Deploy an **API-mode** frontend and the API through the planned GitHub Actions workflow, and connect the domain with HTTPS before testing the link. Creating the page locally cannot make that public URL work before hosting. Send a fresh invitation to an approved recipient after deployment; previously issued links are not rewritten.

Both custom token-hash links and Supabase's default access/refresh-token fragments are supported. The page verifies tokens with Supabase and removes credentials from the browser URL. Invitation/password-reset emails remain separate from future fixture-notification email. Hosted settings and templates have **not** been changed by this repository update.

The older rollout notes below predate the independent-domain/SMTP decision. Use this section and the latest `IMPLEMENTATION_STATUS.md` checkpoint for the current invitation setup.

### First cloud connection from this workstation

The cloud schema and the running application's data source are separate. A linked Supabase CLI project does not configure Vite or the API. As checked on 21 October 2026, this checkout had no frontend/API environment files and defaulted to mock mode. Ignored `.env.local` and `api/.env` files have now been prepared using the existing linked project URL, with credentials empty and mock mode retained until configuration is complete. No cloud connection has yet been validated.

1. Verify that the URL in both files matches the intended cloud project. Copy its **publishable** key from Supabase's project API-key settings into `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
2. Put the project's **secret** key (or legacy service-role key) into `SUPABASE_SECRET_KEY` in `api/.env`. Copy the **Transaction pooler** PostgreSQL URI from the project's **Connect** dialog into `DATABASE_URL`, replacing the password placeholder with the URL-encoded **database password**, not the Supabase API key. Copy the actual pooler hostname; it cannot be inferred reliably from the region. This endpoint supports IPv4 and suits the eventual Functions deployment. The current node-postgres code uses transaction-local state and does not use named prepared statements. See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).
3. Keep `APP_URL=http://127.0.0.1:5173` for this first workstation test and `WORK_EMAIL_DOMAINS=virtuoso.tech`. Keep auth email and public display disabled while configuring. Supply the appropriate database root CA through `DATABASE_CA_CERT` if needed for verified TLS; do not turn verification off.
4. Change `VITE_DATA_MODE` to `api`, then start `npm run dev:api` and `npm run dev` in separate terminals. Open **http://127.0.0.1:5173** consistently. The login screen should replace the mock user selector. Reaching login validates frontend configuration only; authenticated data retrieval is still needed to validate the database connection.
5. Configure Auth and the selected email delivery route below. SMTP uses the repository's Supabase templates; the proposed Microsoft Graph hook will need its own tested rendering of the same invitation/recovery links. For a project used only by this workstation so far, use `http://127.0.0.1:5173` as its initial Site URL and allow exactly `http://127.0.0.1:5173/auth/callback`. If the project already serves a hosted application, retain its Site URL and add only the local callback to the allowlist.
6. After delivery is configured and a specific recipient is approved, send the first owner's **invitation** through Supabase Auth's Users page. Open it on this workstation, continue through the callback and set a password. Assign that verified Auth UUID the application administrator role using [the bootstrap SQL](DATABASE_SETUP.md#6-bootstrap-the-first-application-administrator). A newly created password account without an invitation does not satisfy this app's access checks.
7. Sign in and verify shared data loads. An empty cloud league is expected: browser demo fixtures are not imported. Create the real season and enroll invited colleagues through Administration. Enable `ALLOW_AUTH_EMAIL=true` and restart the API when ready to test app-issued invitations and password resets with approved recipients.

The local callback is only reachable on the computer running Vite; opening that link on a colleague's phone will not reach this workstation. Before general invitations, deploy the frontend/API, switch `APP_URL` and the Supabase Site URL to the real HTTPS origin, and allow its exact `/auth/callback`. Frontend `VITE_` changes require rebuilding. Keep secrets in local ignored files or Azure application settings, never in chat or browser build variables. Do not run the disposable local test suites against cloud data.

### Microsoft 365 delivery proposal — not implemented or configured

The owner has not created an Azure Static Web App or configured Resend and prefers to avoid new corporate DNS records. They have Microsoft 365 tenant administration access and can create a shared mailbox. Recommended next implementation: **Supabase Send Email Hook → signed HTTPS endpoint in the existing Azure Functions API → Microsoft Graph → dedicated shared mailbox**, using the existing Microsoft 365 sending domain. This is an email-service identity, not Microsoft Entra sign-in for league users.

- Supabase's [Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook) replaces SMTP delivery and is [available on Free and Pro](https://supabase.com/docs/guides/auth/auth-hooks). The hook must be deployed to a reachable HTTPS URL before cloud Auth can call it; localhost alone is insufficient. Do not enable it before the endpoint is implemented and tested.
- Create a dedicated single-tenant Entra application/service principal for email. Use Exchange Online **Application RBAC** to grant `Application Mail.Send` scoped to the one chosen mailbox. Do not also grant organization-wide Entra `Mail.Send`: grants are additive and would defeat that scope. Verify both allowed-mailbox and denied-other-mailbox access. See [Microsoft's Application RBAC guidance](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac).
- The backend addition must verify the Supabase webhook signature/timestamp against the raw body, restrict recipients and callback origins, render supported Auth email types safely, keep token hashes out of logs, authenticate to Graph server-side, and report delivery failures correctly. Timeouts and retry/replay behaviour need explicit tests against Supabase's hook contract. The current SMTP templates are not automatically rendered when a custom hook handles mail.
- A normal shared-mailbox password is not the intended solution. Supabase's documented SMTP settings accept host/port/username/password; they do not provide the Microsoft OAuth client-credential/token-refresh setup. Microsoft is also retiring SMTP AUTH Basic authentication; its current timeline makes it disabled by default for existing tenants at the end of December 2026, with final removal timing to be announced later. See [Microsoft's updated timeline](https://techcommunity.microsoft.com/blog/exchange/updated-exchange-online-smtp-auth-basic-authentication-deprecation-timeline/4489835). No tenant authentication policy has been changed.
- The sender address, Entra registration/credential, scoped Exchange grant, hosted endpoint and webhook secret are still needed. No Graph code, mailbox, permission grant, deployment or real email delivery is claimed completed. Future fixture/reminder email is a separate implementation decision; ACS remains deferred.

### Alternative: Resend SMTP for invitation and password-reset email

This was investigated initially but has **not** been selected or configured. Skip this section when proceeding with Microsoft Graph.

Resend can provide the SMTP transport used by Supabase Auth without adding a Resend SDK or a mail server to this application. This is independent of the deferred ACS fixture/reminder email implementation.

1. In Resend, add and verify a sending domain. Suggested dedicated subdomain: **pool-mail.virtuoso.tech**, subject to the owner's DNS choice. Publish the exact verification/sending records Resend provides. Preserve existing company mail records; do not replace the root domain's MX records. Receiving email through Resend is unnecessary for Auth delivery. Keep open/click tracking disabled for authentication mail. See [Resend domain guidance](https://resend.com/docs/dashboard/domains/introduction).
2. Create a dedicated Resend sending API key, restricted to the verified domain where supported. Store it in Supabase's SMTP password field; it is not an application `VITE_` value and the API does not need it.
3. In Supabase **Authentication → Email (Notifications) → SMTP Settings**, enable custom SMTP and set:

| Setting | Value |
| --- | --- |
| Sender name | `Virtuoso Pool League` |
| Sender email | e.g. `no-reply@pool-mail.virtuoso.tech`, matching the domain actually verified |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | The dedicated Resend API key |

These are the settings in [Resend's Supabase SMTP guide](https://resend.com/docs/send-with-supabase-smtp). Install the repository's invitation and recovery templates as described below before sending the first test. Keep public signup disabled and the Email provider enabled.

Supabase's default mail service is restricted to project-team addresses; it is not the colleague-onboarding solution. Review both Supabase Auth rate limits and the selected Resend plan before testing ([Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Resend pricing](https://resend.com/pricing)). A small batch of invitations does not require automatic high-volume sending.

Delivery acceptance checks, using specifically approved recipients: the invite arrives with the intended sender, its link opens the correct app origin, password setup and login work, the invited account gets its own active profile, app-issued invitations work from an administrator account, and password recovery returns to that same account. Inspect Supabase Auth and Resend delivery logs for failures without sharing token-bearing links. Confirm a booking survives refresh and is visible in a second signed-in browser before inviting the rest of the office.

In the hosted Supabase project, keep the Email provider enabled, disable public signup and anonymous login, enable email confirmation and secure email changes, and set a minimum password length of 12. Local configuration deliberately uses **`[auth] enable_signup=false` with `[auth.email] enable_signup=true`**: disabling the email provider's setting prevented password login in local validation. The API additionally verifies the account's invitation marker, confirmed email, exact work domain, and active linked application profile on every protected request. Editable user metadata never grants roles.

Set the site URL to the deployed frontend origin and narrowly allow `/auth/callback` redirects for that origin. Add only the necessary local development callbacks. Configure custom SMTP and verify delivery with approved test recipients before inviting colleagues or enabling `ALLOW_AUTH_EMAIL`. Supabase Auth handles invitation/password emails; no Microsoft Entra integration is used.

Install the invitation and recovery templates from `supabase/templates/` in hosted Supabase before enabling email. Local Supabase already loads these through `config.toml`. They use the allowed `RedirectTo` callback (falling back to the site URL). Their essential links are equivalent to:

```html
<!-- Invitation template -->
<a href="{{ .SiteURL }}/auth/accept-invite?token_hash={{ .TokenHash }}&type=invite">Accept invitation</a>
<!-- Password recovery template -->
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

The callback explicitly exchanges the single-use token with Supabase, then sets a password. It does not trust a URL parameter as identity. Explicit continuation reduces accidental consumption by link scanners. An already signed-in browser must still exchange the supplied invitation/reset token. PKCE callback sessions are also supported. Links grant no league/admin authority: subsequent API calls validate the real Auth user and profile. Login, logout, token refresh and expired-session redirection are implemented. Deactivation denies protected API access immediately; deleting the Auth user preserves and deactivates their historical profile.

The first administrator is a controlled bootstrap data change after verifying their accepted invitation, not a self-service role selector. Subsequent invitations are administrator-only and domain-restricted. An inactive account can be managed in the application; deleting an Auth identity remains an operator action in Supabase, with historical data retained by the existing trigger.

## API and consistency

Application bearer tokens travel in `X-VPL-Authorization` because the SWA managed Functions proxy can replace the standard `Authorization` header with a platform token. The API prefers the app-specific header and fully verifies its token with Supabase; a standard bearer header remains supported for local clients. Neither header grants access without verified identity and an active database profile. See [Azure's token-overwrite issue](https://github.com/Azure/static-web-apps/issues/158). A successful Supabase login followed by an API 401 causes local sign-out and can appear as a login redirect loop; deploy the corresponding frontend and API transport changes together.

| Route                         | Access / behavior                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `GET /api/me`                 | Verified active account; returns its application profile.                                                       |
| `GET /api/state`              | Verified active account; shared data with only the caller's notifications and permitted leave records.          |
| `POST /api/commands`          | Strict typed command plus `expectedRevision`; permissions and all domain rules enforced on the server.          |
| `POST /api/admin/invitations` | Administrator, exact work domain, email-delivery gate. No tokens/links returned to the client.                  |
| `POST /api/admin/reminders`   | Administrator; creates due/overdue in-app fixture reminders once per fixture/recipient/London date.             |
| `POST /api/auth/reset`        | Public, email-delivery gate; generic account-existence response. Supabase applies Auth delivery limits.         |
| `GET /api/display`            | Public only when enabled; allowlisted read-only TV data, never profiles/emails/leave/notifications/audit notes. |

Every protected route validates the bearer token with Supabase `getUser`, resolves `auth_user_id`, and reads the active role from PostgreSQL. Clients cannot submit actor identity or roles. React's hidden controls are convenience only. Direct anonymous/authenticated table access remains denied by the deployed grants/RLS. The Function's `authLevel: anonymous` is intentional: Supabase authentication happens inside the handler; Azure function keys and SWA built-in identity are not the application's authentication system.

The full-snapshot repository suits this small office league. Reads are consistent transactions; writes acquire a short transaction-scoped advisory lock plus relevant fixture locks. The server verifies a SHA-256 snapshot revision before applying a command. Concurrent conflicting/stale requests fail with HTTP 409 and require refreshing/reviewing; they are never automatically replayed. This deliberately conservative scheme can also reject an edit after an unrelated notification change. Results, append-only audit events, playoff advancement and in-app notifications commit together. Existing database constraints independently reject overlapping bookings, duplicate pairings and invalid score structures. This protects against races, not just browser double-clicks.

Clients refresh every 30 seconds (paused while an edit dialog is open); successful writes update immediately. TV reads refresh every 30 seconds and show stale-data feedback on failure. This is periodic shared data, not WebSocket push. Standings reuse the same wins/frames/head-to-head rules from confirmed results; there is no points system. The baseline schema is unchanged and no new migration is required for these integrations.

## Notifications and future ACS Email

Domain actions create persisted in-app notices for publication, pending approval, disputes, confirmations, postponements and league announcements. Administrators can create due/overdue reminders repeatedly without duplicating that day's notices. Reminders are currently **manual**; there is no background timer/scheduler.

`api/src/email.ts` defines the delivery boundary and a disabled implementation that fails explicitly. Real Azure Communication Services Email delivery, durable outbox/retry processing and automatic scheduling remain deferred. A durable outbox requires a separately reviewed migration before cloud application. Future server-only settings will include an ACS connection string/endpoint credential and verified sender address; these settings are not read by the current implementation. No paid email resources are provisioned and no fixture emails are sent. Auth invitation/reset SMTP configuration is separate from that future notification transport.

## Azure Static Web Apps Free deployment preparation

Managed Functions use HTTP triggers. The repository targets the Node 22 API runtime in `public/staticwebapp.config.json`, uses the Functions v4 programming model, and excludes `/api/*` from the SPA fallback. There is no deployment workflow that automatically publishes on push.

After owner approval to provision/deploy:

1. Create/select the intended Static Web App on **Free**, configure the private API application settings above, and configure Supabase URLs/SMTP. Keep email and public display flags off until their respective checks/approval.
2. Supply **public** `VITE_` values to the frontend build environment, with `VITE_DATA_MODE=api`. Runtime API settings do not alter an already-built frontend.
3. Prepare artifacts from a clean checkout:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run package:api
npm ci --omit=dev --prefix .tools/azure-api --workspaces=false
```

`dist/` contains the static application. `.tools/azure-api/` contains only the Functions bundle, host configuration, runtime manifest, derived lockfile and installed runtime dependencies. The packaging script pins direct dependencies to the root lockfile and copies no secrets or local settings. Shared domain code is already bundled. This avoids relying on an isolated Azure API build to find source files or dependencies elsewhere in the npm workspace.

4. Upload these prebuilt artifacts with the Azure Static Web Apps deployment action/tool. For a manually approved GitHub Actions job, the upload step uses:

```yaml
- uses: Azure/static-web-apps-deploy@v1
  with:
    azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
    action: upload
    app_location: dist
    api_location: .tools/azure-api
    output_location: ''
    skip_app_build: true
    skip_api_build: true
```

Run preparation on Node 22 in that job, use a protected deployment environment/manual trigger, and keep the deployment token in GitHub Secrets. This is an instruction example, not an installed or executed publishing workflow. Review current platform guidance when deploying.

5. Smoke-test the **deployed** Functions host and PostgreSQL/TLS connectivity, invalid-token rejection, inactive accounts, two-device approval, concurrent reservations, callback redirects, public-display privacy and refresh, and approved SMTP delivery. The local HTTP adapter tests do not prove Azure networking or Functions host startup. No deployed-host test has been performed here. Free managed Functions do not supply the proposed reminder timer: arrange a separately approved scheduler or continue using the admin button.

## Validation and known limits

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run test:integration
npm run test:live
npx supabase db lint --local --schema public,vpl_private --level error --fail-on error
npx supabase test db --local
npm run build
npm run package:api
```

The two local integration helpers obtain local CLI credentials in memory and refuse non-local endpoints. They create disposable invited identities through generated links; live browser tests additionally exercise invitation/reset delivery into **local Mailpit only**, including both delivered links. The helper refuses a custom-SMTP local configuration. No real colleagues are invited and no external email is delivered. Tests retain historical fixtures/profiles and deactivate/delete test Auth identities after execution; reservations are cancelled. Use a disposable local stack, not valuable data. No automatic database reset is performed. `test:live` owns ports 5174 and 7071; stop your development API first. The ordinary browser suite uses mock mode on 5173; do not reuse a live-mode frontend on that port. Do not edit source files during browser runs because hot reload can interrupt open forms.

See [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) for checks actually executed and remaining scope. Qualification-critical tie deciders still require an agreed procedure and likely an additive migration; current qualification safely stops at those ties. Doubles management, individual abandonment decisions and rollback of already-played playoff rounds remain separate product enhancements. Cloud rollout, real SMTP and ACS delivery, scheduled reminders, physical-device/Safari checks and a formal accessibility audit are not claimed complete.

## Primary platform references

- [Managed Functions in Static Web Apps](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions)
- [Static Web Apps runtime/configuration](https://learn.microsoft.com/en-us/azure/static-web-apps/configuration)
- [Prebuilt Static Web Apps artifacts](https://learn.microsoft.com/en-us/azure/static-web-apps/build-configuration)
- [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [OTP verification](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Supabase Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Local Auth email templates](https://supabase.com/docs/guides/local-development/customizing-email-templates) and [Mailpit API](https://mailpit.axllent.org/docs/api-v1/)
