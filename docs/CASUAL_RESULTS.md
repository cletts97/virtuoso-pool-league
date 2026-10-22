# Casual results

Open **Casual games** (`/casual`) to record a friendly singles or doubles match. League membership, a season and a booking are not required. Select the actual players, date, format and completed score. One frame or best of 3/5/7 is supported; best of 3 is the default.

An opposing player confirms the result. A submitting player's doubles teammate cannot confirm. Disputes stay outside statistics; the original submitter may resubmit with the same players. Administrators can resolve/correct or void a game with a reason. Audit history is preserved. Voided games cannot be reopened.

Head-to-head compares exact singles players or two-person teams across all dates, ignoring member order and which side they played. Only confirmed casual games count. League results/standings remain separate. Duplicate submissions with the same game ID are rejected; multiple real games on the same date are allowed. Dashboard and casual-page notices flag opposing approvals; no casual emails are sent.

## Required cloud database step

Review and apply [20261022000100_casual_results.sql](../supabase/migrations/20261022000100_casual_results.sql) once through the Supabase Cloud SQL editor. This additive migration creates one table, indexes, constraints, an audit-preservation trigger and restricted grants/RLS. It changes no existing tables or league data. It has been applied and tested **only on disposable local Supabase**. Cloud application requires the owner's approval and was not performed by the agent.

Do not reapply the initial schema or reset cloud data. No new environment variables or dependencies are required. The server's PostgreSQL connection needs the same server-only privileges as the existing API.

The API checks whether the new table exists. Until it does, existing app functionality continues and casual recording displays as unavailable. After the migration and normal frontend/API deployment through GitHub Actions, refresh the page. Mock mode needs no migration and stores results in the existing localStorage record.

Implementation: `domain/casual.ts` calculates records; `data/casualCommands.ts` validates server/mock workflows. Existing API transaction/revision locking prevents stale/concurrent approvals. `api/src/state.ts` and `persist.ts` map database records. Public snapshots exclude audit identities and reasons; protected writes resolve the authenticated active profile server-side.

## Unavailability retired

The administration screen/form are removed and API validation rejects old recording/removal commands. Archived availability rows remain, but new schedules and catch-up fixtures ignore them. Existing fixture dates/results are unchanged; use explicit fixture postponement when needed.

## Focused local validation

```sh
npx supabase migration up --local
npx vitest run src/data/casualCommands.test.ts src/data/commands.test.ts src/data/lateEntry.test.ts src/data/publicSnapshot.test.ts
npm run test:integration -- --testNamePattern "persists casual singles"
npx playwright test tests/league.spec.ts --project=desktop --grep "casual singles and doubles|admin manages players"
```

The integration helper refuses non-local database endpoints. Never point tests at production.
