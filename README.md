# Virtuoso Pool League

A complete local-demo frontend for the Virtuoso office singles league. Built with React, strict TypeScript, Vite, Tailwind CSS, React Router, and Lucide icons. Uses the official Virtuoso logo and a navy/orange design with dark and light themes.

## Run locally

Install **Node.js 22.12+** (a current supported Node LTS release is recommended), then:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally <http://127.0.0.1:5173>. No environment variables, accounts, database, or cloud resources are needed.

**On this Windows workspace:** Node was not on PATH, so a portable Node runtime was downloaded into the ignored `.tools/` directory. You can start immediately using:

```powershell
.\scripts\dev.ps1
```

For other npm commands in this workspace, either install Node normally or add the portable runtime to the current terminal's PATH:

```powershell
$env:PATH = "$PWD\.tools\node-v22.16.0-win-x64;$env:PATH"
npm run dev
```

The portable runtime and its cache are local development aids, not tracked application dependencies.

## Try the main workflow

1. The initial user is **Alex Morgan (Admin)**. Open **Fixtures & results**, then a scheduled match involving Alex (for example, round 6 against Oliver Grant).
2. Choose **Submit result** and select a legal score. Scores are always displayed in home–away order.
3. Use the clearly labelled **DEMO / Playing as** selector to choose the opponent.
4. Open the same fixture and **Approve result**, or dispute it with a reason. The submitting side cannot approve its own score.
5. Open **League table** to see the calculated standings. Refresh: the change persists.
6. Switch back to Alex to resolve disputes, correct results, postpone fixtures, or adjust dates. The match timeline preserves every prior score and action.
7. Under **Administration**, create a season, select its players, and generate its schedule. Eleven players produce 55 matches and 11 rounds with rotating byes.
8. Use the header season selector to explore the completed Summer League and its champion.

The reset icon beside the demo switcher restores all sample data after confirmation. Reset affects only this browser's demo workspace.

## Application features

- Personal dashboard, live calculated standings, top-four indicators, sortable table, and recent form.
- Full round-robin schedule, round/player/status filters, byes, match details, score submission, opponent approval, disputes, postponements, and an audit timeline.
- Player directory, season profiles, regular-season statistics, round-by-round performance, match history, upcoming fixtures, and head-to-head records across seasons.
- Projected and finalized playoff brackets, best-of-five semifinals, best-of-seven finals, automatic advancement, and champion presentation.
- Admin player creation/editing/deactivation, season creation/settings, fixture generation and adjustments, leave records and clashes, overdue/postponed queues, dispute resolution, score corrections, and announcements.
- In-app notifications for fixtures, approvals, confirmed results, disputes, postponements, and notices; read/unread state is per user.
- Multiple seasons, historical standings and results, persistent theme preference, responsive navigation, keyboard-accessible forms and native modal dialogs.

## Project structure

```text
src/
  app/          Application shell, context, state provider, error boundary
  components/   Shared UI, match cards, standings table, administrative forms
  pages/        Routed dashboard, standings, fixtures, profiles, playoffs, admin, inbox
  domain/       Typed models and pure competition rules; unit tests
  data/         Repository contract, mock adapter, command transitions, seed data; tests
  styles.css    Theme tokens and responsive component styling, alongside Tailwind
tests/          Desktop and mobile Playwright workflow tests
public/
  brand/        Official Virtuoso logo files and source attribution
  staticwebapp.config.json   Future Azure SWA SPA navigation fallback
scripts/        Windows local development convenience launcher
```

`Participant` is a competition entry with a `kind` and a list of player IDs. A fixture references participants, rather than player IDs directly. This supports future two-person teams without changing the basic fixture or standings model. The current season creation UI deliberately offers singles only.

## Data architecture

`LeagueRepository` in `src/data/contracts.ts` is the application boundary. Its local adapter loads a versioned snapshot, validates commands, persists the resulting state, and returns a new snapshot. Components request typed commands through `useLeague()`; they do not mutate stored fixtures or maintain independent copies of standings.

`src/data/commands.ts` applies transitions to a cloned snapshot. Failed commands leave the original state unchanged. It checks active-user identity, participant/admin permissions, score validity, and allowed status transitions. Notifications and audit revisions are generated with the command. `src/domain/rules.ts` owns scheduling, score validity, ranking, approval eligibility, and qualification logic.

`src/data/seed.ts` generates 12 fictional colleagues, a complete 66-match current schedule, 24 approved regular-season results, two pending results, one dispute, a postponement, leave, notifications, and a completed previous season with playoffs. Sample dates are relative to the first load/reset date, using the Europe/London calendar. No component contains a separate fixture or player dataset.

Browser persistence uses the key `virtuoso-pool-league.v1`. A new adapter instance reads the same state after refresh. Storage events refresh other open tabs. Invalid saved JSON is reported with an explicit reset recovery option; storage-write failures are reported, not presented as successful saves.

**This is demo-only persistence and authentication.** localStorage is user-editable and not suitable for real multi-user operation. It has no trusted authorization, transactions across clients, or concurrency guarantees. No personal data, secrets, credentials, or production access tokens should be stored in this demo. The demo switcher is not a production authentication mechanism.

## Documented defaults and lifecycle

- Every regular-season pair meets once. The circle scheduling algorithm handles even and odd counts. Dates target two rounds per week by default; there are no exact match times. Players can submit early.
- League matches are best of three, semifinals best of five, final best of seven. There are no draws. Only a completed valid score can be selected.
- A win awards three points; losses award none. Only confirmed regular-season results count in standings. A fixture ID is counted at most once.
- Ranking: points descending, frame difference descending, frames won descending, then immutable participant ID ascending. IDs break exact ties deterministically without relying on editable names.
- Recent form is ordered by the original submission date, oldest to newest; later corrections do not move a match to the front of the history.
- Qualifiers lock automatically after all regular-season matches are confirmed. Explicit admin finalization requires a reason and confirmation, closes outstanding fixtures without points, and locks the top four. It is irreversible within the demo except by a full reset.
- Historical regular-season corrections update the table but preserve already finalized playoff seeds. Semifinal winner corrections can update an untouched scheduled final; they are blocked once the final has started. Final corrections update the champion and preserve score history.
- Recorded leave never awards a defeat. During generation, overlapping due dates move to three days after the relevant leave ends, checking subsequent leave intervals too. Admins can adjust these catch-up dates. Recording leave after publication flags clashes for manual scheduling; it does not silently move fixtures.
- Season start date, players, and round cadence lock at fixture publication. Names remain editable. Deactivating players preserves existing results/entries; reactivate them to confirm outstanding matches. The current admin cannot deactivate themself.
- Multiple seasons may be in progress. The header chooses the viewed season; there is no automatic cross-season archival or deletion.

## Future Azure / database integration

1. **Azure Functions:** implement `LeagueRepository` using HTTP requests and inject it in `LeagueProvider.tsx`. Keep components and the pure rule functions. The current full-snapshot interface is intentionally sufficient for this small league; server-side commands should return the updated snapshot or invalidate/fetch it.
2. **Authentication:** replace `currentUserId` preferences and the demo switcher with an authenticated session adapter. The server must derive actor identity from that session and load roles/memberships itself. Do not trust actor IDs, admin flags, or email links supplied by the client. The provider must reload data when the authenticated session changes.
3. **PostgreSQL / Supabase:** persist players, participants and memberships, seasons and entries, fixtures, append-only result revisions, availability, announcements, and per-recipient notifications. Enforce unique season/pairing constraints, one current result per fixture, foreign keys, and transactionally checked transitions. Use optimistic concurrency or row locks and idempotency keys to prevent duplicate submissions/approvals. Keep database service credentials in Functions, never the frontend.
4. **Notifications / Azure Communication Services Email:** `NotificationService` is a separate publishing contract. The demo implementation writes in-app records. A server implementation should atomically enqueue domain notifications in a durable outbox, then an email worker can deliver them with retries. Email links navigate to authenticated routes; they grant no authorization by themselves. Scheduled reminders are future server work.
5. **Azure Static Web Apps:** `npm run build` emits `dist/`. `public/staticwebapp.config.json` provides SPA deep-link fallback and excludes `/api/*` and static assets. No deployment workflow, Azure resource, paid service, or credentials have been created. Configure the actual auth and API routes before production deployment.

No environment variables are required in this iteration. Future public API base URLs may use a documented `VITE_API_BASE_URL`; such a value would be public. Database credentials, signing keys, and email credentials belong only in server-side application settings. All `.env` files are ignored.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Playwright uses installed Google Chrome (`channel: chrome`) for desktop and a mobile viewport/touch emulation. Install Chrome before running these tests. This is mobile Chromium emulation, not a claim of testing on a physical iPhone or Safari. Tests use isolated browser contexts and do not alter your normal demo data. They cover navigation, page overflow, user switching, result submission/approval, persistence, disputes, season generation/byes, postponements, player management, leave, announcements, historical champions, themes, and access boundaries.

The test configuration starts Vite automatically, or reuses an already running server on port 5173. On Windows, running `npm run dev` in one terminal before `npm run test:e2e` avoids platform-specific child-process teardown delays. Screenshots and traces are ignored under `.tools/screenshots/` and `test-results/`.

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for current scope and intentionally deferred integrations, and [public/brand/README.md](public/brand/README.md) for verified branding sources.
