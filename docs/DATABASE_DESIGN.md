# Initial schema design and integration boundaries

This records the original schema design. The integration addendum below and `docs/BACKEND_SETUP.md` describe the implemented API; earlier statements about deferred endpoints describe the original schema-only milestone.

## Basis and scope

Based on the supplied `types.ts`, `contracts.ts`, and `bookings.ts`. These files describe model shapes, repository commands, and booking validation. They do not contain the full standings algorithm or the complete score-command implementation. This package therefore does not claim those unseen modules have been reviewed.

This is an initial schema, not a replacement backend. Auth service settings, HTTP endpoints, real email delivery, repository adapters, and end-to-end authorization remain separate work.

## Model mapping

| Existing frontend model/property | Database representation |
|---|---|
| `Player` (including `colleague`) | `profiles`; links to managed `auth.users` through `auth_user_id` |
| `Participant` | `participants` |
| `Participant.playerIds` | `participant_members`, ordered by `member_order` |
| `Season` / `Season.config.roundsPerWeek` | `seasons` / `rounds_per_week` |
| `Season.participantIds` | `season_participants`, ordered by `entry_order` |
| `Season.qualifiers` | `season_qualifiers`, ordered by seed 1-4 |
| `Season.championId` | `seasons.champion_id`, constrained to a season participant |
| `Fixture` | `fixtures`; home/away reference competition participants, not profiles |
| `Fixture.score` | Nullable `home_score` and `away_score` columns |
| `Fixture.history` / `ResultRevision` | Append-only `result_events`, ordered by fixture revision |
| `Availability` | `availability`; API maps `profile_id` to `playerId` and dates to `from`/`to` |
| `BookingConfig` | One `booking_settings` record |
| `Booking` | `table_bookings` |
| `Booking.guestIds` | `booking_guests`, ordered by `guest_order` |
| `LeagueNotification.read` | `notifications.read_at IS NOT NULL` |
| `Announcement` | `announcements` |
| `Standing` | Derived from confirmed regular-season fixtures; no stored standings table |

The API adapter maps snake_case columns to the existing camelCase objects. Do not replace TypeScript models wholesale with database rows.

## Deliberate additions and decisions

### Identity and history

Profiles have their own stable IDs and a unique Auth-user reference. Initially the trigger uses the Auth UUID for both. Application code should still resolve `auth_user_id` explicitly, not depend on the two always matching.

Deleting an Auth user unlinks and deactivates the profile rather than deleting competition history. Most competition foreign keys restrict deletion. Deactivate players for normal offboarding; any future anonymization/deletion workflow must consider historical records deliberately.

Profile creation copies only a bounded display name from user metadata. Role always starts as `colleague`; no role or active-status value is trusted from metadata. Role and league membership are separate: an active colleague can book without a season entry.

The auth trigger also backfills existing Auth accounts, all as colleagues. It does not confirm their email, send invitations, or create passwords. Auth emails remain in the Auth system, not public profile records.

### Scores and history

`fixtures` stores the current result snapshot. `result_events` stores successive actions. Pending, disputed, cancelled, and unplayed fixtures do not contribute to totals.

Additional confirmation metadata distinguishes ordinary opponent approval from an administrator override with a reason. Database checks reject ordinary self-approval, but checking that the approver is actually the opposing player, or is an authorized admin, remains an API responsibility.

Fixture and booking `revision` fields support optimistic concurrency. An API write should compare an expected revision and update atomically; database triggers increment it. The current commands do not yet carry an expected revision, so the HTTP contract needs this small addition when write endpoints are introduced.

A command that changes a fixture must also append its corresponding result event and relevant notifications in ONE transaction. The schema does not automatically infer an actor or manufacture audit events from an arbitrary SQL update. Separate JavaScript/PostgREST calls are not a transaction; use a database transaction or a carefully authorized database RPC for each atomic command.

### League standings and playoff membership

There are no league-points columns. `regular_season_totals` calculates played, won, lost, frames won/lost, difference, and percentage from `confirmed` **regular-season** fixtures only. It includes entrants with zero matches and returns percentage on a 0-100 scale.

The totals view is not a second ranking engine. Reuse and test the canonical rules module on the backend for wins, frame difference, frames won, head-to-head, recent form, and unresolved ties. The supplied interface alone does not establish that the current ranking algorithm is correct.

Qualification seed rows are finalized snapshots. The future API must prevent a display-only ID fallback from deciding qualification, block finalization for unresolved qualification-critical ties, preserve locked seeds after historical corrections, and avoid replacing participants in a started final. The schema does not automatically start playoffs or resolve ties.

Participant member rows allow up to two members. At season publication, the API must verify exactly one for singles or exactly two for doubles, ensure an individual does not enter the same season through multiple entries, and freeze relevant memberships. To change an established team's composition, create a new participant rather than rewriting historical membership. Doubles UI remains deferred.

### Bookings

The database is for ONE shared table, as agreed. A PostgreSQL exclusion constraint prevents overlapping reserved intervals even with concurrent writes. No extra extension is needed for this single-table range constraint. Intervals include the start but exclude the end, so 12:00-12:30 and 12:30-13:00 do not conflict. Cancelled bookings do not occupy the table.

The database validates supported durations, quarter-hour start alignment, start/end agreement, foreign keys, and that casual bookings cannot link to a fixture. `end_at` is an additional storage field: the API computes it from start plus duration, and the database checks the result.

The API must also enforce the supplied booking rules: future start within the rolling seven-day/168-hour horizon; London office days/hours; active owner/guests; distinct guests excluding the owner; allowed fixture status; fixture-participant or admin authority; and only one upcoming reserved booking per linked fixture. Modifications/cancellations are owner-or-admin only. Follow the original `bookings.ts` rather than replacing its rules with assumptions.

Do not implement a clock-dependent partial unique index using `now()`. For concurrent requests for the same fixture at different times, lock that fixture row inside the booking transaction before checking existing reservations. All write paths must follow the same protocol. Handle exclusion violations as a friendly booking conflict (for example, HTTP 409), not a generic success.

Persist actual instants with `timestamptz`; convert for display using Europe/London. Availability and fixture due dates remain date-only values. Schema SQL does not replace the existing ambiguous/nonexistent London-time validation in `bookings.ts`.

### Notifications and future features

The supplied notification type requires a season and has no booking-specific reference. This migration preserves that model. Booking-only notifications for casual reservations need a separately agreed TypeScript/schema update; do not silently attach them to an arbitrary season.

No SMTP credentials, email outbox, avatar storage bucket, achievements, or recurring scheduler are introduced here. Those are later milestones.

## Security model: server-only application data

All 14 application tables have RLS enabled. Client grants are revoked and there are intentionally no `anon` or `authenticated` data policies. This is deny-by-default, not an accidentally unfinished open API. A signed-in application administrator is still an `authenticated` database client and cannot modify rows directly.

The browser uses Supabase Auth for login, and sends its access token to Azure Functions. The API verifies the token/user, loads the active profile, enforces the command-specific permissions, then accesses application data with a server credential. A Supabase secret/service-role key bypasses RLS. It must never appear in React code, `VITE_*` variables, source control, a TV URL, or an API response.

RLS does not protect against a bug in a privileged backend that trusts an attacker-supplied actor ID. The API must derive identity from verified authentication, never from `currentUserId`, a role in request JSON, a query string, or user-editable metadata. Use a dedicated server client; do not let a browser session silently replace its authorization context.

This migration grants only SELECT/INSERT on result history to the service role and rejects row edits/deletes with a trigger. Database owners can still administer the database; this is not tamper-proof evidence against project owners.

### Important repository changes at integration

`LeagueRepository.load()` currently returns a whole `LeagueState`. A production adapter must not expose everyone's notifications or private availability reasons just to reproduce the demo object.

- Filter responses according to the verified user; administrators and players need different visibility.
- `preferences()` must not switch production identity. Theme and selected season may remain local preferences.
- Do not expose the demo `reset()` operation or demo-user selector in production.
- Public `/display` needs a separate sanitized API response, not the full league-state endpoint. Until that endpoint is implemented, the schema intentionally provides no anonymous database access.
- Keep mock mode clearly separated from live mode and prevent demo data from masquerading as real shared data.

## What is NOT yet guaranteed

The migration enforces structural/database constraints, not complete competition workflows. Invitation delivery and acceptance, password setup/reset, API token validation, role enforcement, atomic audited writes, full participant cardinality, season lifecycle, booking office-hour/horizon validation, and all public-response filtering still require implementation and testing.

These boundaries are deliberate. Do not describe the application as production-ready merely because the migration applies successfully.

# Integration addendum — 21 October 2026

The deployed initial migration is unchanged. `api/src/state.ts` maps its tables to the existing frontend model; `persist.ts` writes parameterized changes and appends result events using the database fixture revision. `service.ts` supplies verified identity, active-profile authorization, transactions, snapshot concurrency checks and fixture locks. Both API and mock adapters reuse the existing command/domain logic. No browser role or selected identity is trusted by the API. See [BACKEND_SETUP.md](BACKEND_SETUP.md) for deployment, privacy, connection settings and known limitations. A qualification-decider record and an email outbox remain future additive migrations requiring separate approval before cloud application.
