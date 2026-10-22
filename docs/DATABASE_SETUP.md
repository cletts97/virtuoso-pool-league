# Database setup and invitation-only access

For additive migrations and production rollout, see [Casual results setup](CASUAL_RESULTS.md) and [Result-email setup](RESULT_EMAILS.md). The original schema below remains deployed; do not reapply it.

For migration `20261022000400_scheduled_automation.sql` and the separately activated Supabase Cron jobs, see [Scheduled automation setup](SCHEDULED_AUTOMATION.md).


## Current integration status (21 October 2026)

The initial schema has been deployed by the owner and remains the baseline. Local database lint and all 57 pgTAP checks passed. The application now has API-backed repositories, Supabase Auth, protected Functions handlers and local database/browser integration tests; see [BACKEND_SETUP.md](BACKEND_SETUP.md) for the current runbook. The sections below retain the original migration procedure for reference; do not reapply the deployed migration or reset the cloud project.

## 1. Preserve the current app

Keep the working frontend in Git. Review staged files for secrets before committing. This package does not change any React code, application dependencies, or your current browser demo data.

Copy the package directories into the root of `virtuoso-pool-league`. There must be only one initial migration for this schema. Stop and compare files if Codex has already generated another one.

## 2. Initialize the CLI locally

In the repository's PowerShell terminal, install the CLI only if it is not already a project dependency:

```powershell
npm.cmd install --save-dev supabase

# Do not overwrite an existing configuration.
if (-not (Test-Path .\supabase\config.toml)) {
    npx.cmd supabase init
}
```

`init` writes configuration to the repository. It does not create or modify a cloud database. Keep the generated Supabase ignore rules; do not commit credentials, access tokens, database passwords, or local temporary files.

## 3. Verify in a disposable local environment FIRST

The initial authoring environment had no PostgreSQL runtime. Subsequent disposable local Supabase validation passed database lint and all 57 automated database checks. A clean application build alone does not validate SQL migrations.

The local Supabase stack requires a supported Docker-compatible container runtime. With that running, use the following commands from this repository:

```powershell
npx.cmd supabase start
npx.cmd supabase migration up --local
npx.cmd supabase db lint --local --schema public,vpl_private --level error --fail-on error
npx.cmd supabase test db --local
```

Stop at the first error and retain its output. Do not proceed to a cloud push until it is understood and fixed. The migration deliberately fails on object-name conflicts instead of silently accepting a different existing schema.

The draft pgTAP tests check table access grants/RLS flags, non-admin defaults, valid scores, normal self-approval rejection, duplicate fixture prevention, regular-season totals, append-only result history, and booking constraints. These are structural tests, not complete integration/security tests.

Additional integration checks (now covered by the local API/browser suites; repeat smoke checks on the deployed environment before rollout):

- Invite a LOCAL test account through Supabase Auth and verify one linked profile is created with role `colleague`, not `admin`.
- Check the local invite acceptance/password-setting flow and sign-in.
- Check inactive and deleted Auth users are rejected by the API, including still-unexpired tokens.
- Confirm a profile survives Auth account deletion, is unlinked/deactivated, and historical results remain intact.
- Race two independent database connections booking overlapping slots; exactly one should commit.
- Race two reservations for the same fixture at different times; the API's fixture lock must prevent duplicates.
- Race two approvals/corrections; optimistic concurrency plus a transaction must prevent duplicate/conflicting writes.
- Verify the actual backend checks the opposing participant, rather than merely comparing submitter/reviewer IDs.
- Verify public TV responses contain no email addresses, availability reasons, or private notifications.

The pgTAP SQL tests insert temporary records and roll back. The newer API/browser integration suites retain audit history and deactivate their disposable identities. Run all of these on a disposable local database, not the live project. Do not use a cloud database reset or repair migration history to hide unexplained errors.

## 4. Configure the hosted project's invitation-only Auth settings

In the Supabase dashboard, under Authentication's sign-in/provider settings:

- Keep Email/password authentication enabled.
- Turn **Allow new users to sign up** OFF.
- Keep **Confirm Email** ON.
- Keep anonymous sign-ins OFF and leave unused external providers disabled.
- Keep secure email-change confirmation enabled.
- Review any Auth users that already exist; disabling signup does not remove existing accounts.

These are Auth service settings, not application table definitions. The SQL migration does not change them. Local `[auth] enable_signup = false` and email-confirmation configuration are separate from the hosted project's settings.

An operator bootstraps the first invited administrator through Supabase. Subsequent invitations can use the protected application endpoint, which checks the active admin role, `WORK_EMAIL_DOMAINS=virtuoso.tech`, and the explicit email-delivery flag. The migration does not hard-code a domain allowlist in `auth.users`; the API verifies the domain on protected access too.

Do not add colleagues as Supabase organization/project administrators just so they can play pool. Their accounts belong in this project's **Authentication > Users**, not the developer-management team.

### Email and redirect prerequisites

Configure custom SMTP before sending real colleague invitations. Supabase's default email service is for limited testing and restricts recipients to authorized project-team addresses. Do not work around this by giving players infrastructure access or disabling verification.

The application includes `/auth/callback` and password setup/reset screens, validated with local generated links. Configure the correct site URL, narrowly scoped redirect allowlist and templates as described in BACKEND_SETUP.md. Actual hosted SMTP delivery still needs approved-recipient testing before rollout invitations.

Auth invitations, verification, and reset emails must work before rollout. Fixture/reminder emails can remain a later milestone.

## 5. Link and preview the hosted deployment AFTER local verification

Use the project reference shown by your own dashboard, not a database password in the command line:

```powershell
npx.cmd supabase login
npx.cmd supabase link --project-ref YOUR_PROJECT_REFERENCE
npx.cmd supabase migration list
npx.cmd supabase db push --dry-run
```

Review the selected project and every pending migration. A dry run lists migrations; it does NOT execute SQL, test constraints, prove security, or guarantee a successful deployment.

Once the review and local tests pass, the following is the explicit cloud-changing step:

```powershell
npx.cmd supabase db push
```

Do not also paste the initial migration into the dashboard SQL editor: that bypasses migration history and can make a later CLI push fail with duplicate objects. Once a migration has been applied, make subsequent changes in a new migration rather than editing the deployed file.

Applying the schema does not switch the React app's mode. Set `VITE_DATA_MODE=api` with the documented public configuration and run the configured API to use shared data.

## 6. Bootstrap the first application administrator

No account automatically becomes an app administrator, including the person who owns the Supabase project. After creating/accepting your own invitation, verify the account's UUID and confirmed work email in the Auth dashboard.

A trusted project administrator can then make a controlled data change in the SQL editor. This is a one-time role assignment, not a schema change. Replace the UUID below with the independently verified Auth user ID; do not run it unchanged:

```sql
UPDATE public.profiles p
SET role = 'admin'
FROM auth.users u
WHERE p.auth_user_id = u.id
  AND u.id = 'REPLACE-WITH-VERIFIED-AUTH-USER-UUID'::uuid
  AND u.email_confirmed_at IS NOT NULL
  AND p.active
RETURNING p.id, p.name, p.role;
```

Expect exactly one returned row. The application must never expose arbitrary self-service role assignment. User-editable Auth metadata is not a trusted role source.

## 7. Integration milestones

Real sign-in, `GET /api/me`, the shared snapshot API and transactional commands are implemented. Identity mapping, active/deleted users, result approval, bookings and playoff progression are validated locally. See IMPLEMENTATION_STATUS.md for exact checks and remaining deployment/SMTP/product scope.

Subsequent write operations must validate the user, enforce permissions, and commit related changes atomically. A schema alone is not a secure multi-user backend.

## Official references

- Supabase migrations: https://supabase.com/docs/guides/deployment/database-migrations
- Supabase CLI: https://supabase.com/docs/reference/cli
- Auth configuration: https://supabase.com/docs/guides/auth/general-configuration
- Auth invitations: https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail
- Auth email delivery: https://supabase.com/docs/guides/auth/auth-smtp
- Auth/user profiles: https://supabase.com/docs/guides/auth/managing-user-data
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- PostgreSQL range exclusion constraints: https://www.postgresql.org/docs/current/rangetypes.html
## Pool / table-tennis booking activity

Before deploying the booking-activity update, apply `supabase/migrations/20261022000300_booking_sport.sql` to the cloud project through the established migration process (or run that file in the Supabase SQL Editor). Do not re-run the initial schema. Then deploy the frontend and API together.

This adds `table_bookings.sport`, defaulting all existing bookings to `pool`, with checks for supported activities and Pool-only league reservations. The existing overlap exclusion still protects the single table across both activities. No Storage, Auth, email or environment-variable changes are needed. The application API expects this migration to be applied before deployment.

