# Database setup and invitation-only access

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

The SQL and test file were authored and statically inspected, but were **not executed against PostgreSQL** in the authoring environment. There was no available PostgreSQL/Docker runtime. A clean application build does not validate SQL migrations.

The local Supabase stack requires a supported Docker-compatible container runtime. With that running, use the following commands from this repository:

```powershell
npx.cmd supabase start
npx.cmd supabase migration up --local
npx.cmd supabase db lint --local --schema public,vpl_private --level error --fail-on error
npx.cmd supabase test db --local
```

Stop at the first error and retain its output. Do not proceed to a cloud push until it is understood and fixed. The migration deliberately fails on object-name conflicts instead of silently accepting a different existing schema.

The draft pgTAP tests check table access grants/RLS flags, non-admin defaults, valid scores, normal self-approval rejection, duplicate fixture prevention, regular-season totals, append-only result history, and booking constraints. These are structural tests, not complete integration/security tests.

Additional tests required before rollout:

- Invite a LOCAL test account through Supabase Auth and verify one linked profile is created with role `colleague`, not `admin`.
- Check the local invite acceptance/password-setting flow and sign-in.
- Check inactive and deleted Auth users are rejected by the API, including still-unexpired tokens.
- Confirm a profile survives Auth account deletion, is unlinked/deactivated, and historical results remain intact.
- Race two independent database connections booking overlapping slots; exactly one should commit.
- Race two reservations for the same fixture at different times; the API's fixture lock must prevent duplicates.
- Race two approvals/corrections; optimistic concurrency plus a transaction must prevent duplicate/conflicting writes.
- Verify the actual backend checks the opposing participant, rather than merely comparing submitter/reviewer IDs.
- Verify public TV responses contain no email addresses, availability reasons, or private notifications.

The test script inserts temporary records and rolls back. Run it on a disposable local database, not the live project. Do not use a cloud database reset or repair migration history to hide unexplained errors.

## 4. Configure the hosted project's invitation-only Auth settings

In the Supabase dashboard, under Authentication's sign-in/provider settings:

- Keep Email/password authentication enabled.
- Turn **Allow new users to sign up** OFF.
- Keep **Confirm Email** ON.
- Keep anonymous sign-ins OFF and leave unused external providers disabled.
- Keep secure email-change confirmation enabled.
- Review any Auth users that already exist; disabling signup does not remove existing accounts.

These are Auth service settings, not application table definitions. The SQL migration does not change them. Local `[auth] enable_signup = false` and email-confirmation configuration are separate from the hosted project's settings.

An administrator will invite colleagues through the dashboard initially, or later through a protected application endpoint using the server-side Auth admin API. The future endpoint must verify the inviter's application admin role and restrict invitations to the approved work-email domain. This migration does not hard-code or enforce a domain allowlist in `auth.users`.

Do not add colleagues as Supabase organization/project administrators just so they can play pool. Their accounts belong in this project's **Authentication > Users**, not the developer-management team.

### Email and redirect prerequisites

Configure custom SMTP before sending real colleague invitations. Supabase's default email service is for limited testing and restricts recipients to authorized project-team addresses. Do not work around this by giving players infrastructure access or disabling verification.

The application still needs an invitation acceptance/auth callback route and a password-setting screen. Configure the correct site URL and narrowly scoped redirect allowlist once those routes exist. Do not send rollout invitations before the app can complete the flow.

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

Applying the schema does not alter the React app. It continues to use its current mock repository until an API adapter is implemented.

## 6. Bootstrap the first application administrator later

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

## 7. Keep the next coding milestone small

After the schema is verified/deployed, implement real sign-in and a single authenticated `GET /api/me` endpoint. Prove the verified Auth user maps to the correct active profile before connecting fixtures, scores, or bookings.

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
