# Virtuoso Pool League

Scheduled newsletter, 24-hour reminders and 48-hour automatic confirmation: see [Supabase Cron setup](docs/SCHEDULED_AUTOMATION.md). Requires its additive migration and explicit operator activation; uses the existing Resend sender and Azure HTTP API.

A Virtuoso-branded office singles league, table booking calendar and TV dashboard. React, strict TypeScript, Vite and Tailwind power the frontend; the API uses Azure Functions, Supabase Auth and PostgreSQL. Both isolated mock mode and shared API mode are available. The existing cloud schema is unchanged. Cloud deployment and real email delivery have not been performed.

## Run locally

Install **Node.js 22.12+** (a current supported Node LTS release is recommended), then:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally <http://127.0.0.1:5173>. This starts **mock mode** by default; no accounts or services are needed. For real shared data, configure the frontend and API settings in [.env.example](.env.example) and [api/.env.example](api/.env.example), then follow [Backend setup and deployment](docs/BACKEND_SETUP.md). Run `npm run dev:api` alongside `npm run dev` after configuration. The work-email domain is `virtuoso.tech`.

For the first connection to the existing cloud project, follow [the workstation setup steps](docs/BACKEND_SETUP.md#first-cloud-connection-from-this-workstation). The guide also records the proposed Microsoft 365 shared-mailbox/Graph email integration, which still needs implementation and configuration.

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

## Browser compatibility

Production builds include a modern ES-module bundle and a separate legacy JavaScript bundle targeting Chromium 53+ (webOS 4.x and newer). Vite's legacy plugin conditionally loads the legacy bundle and usage-based language polyfills; modern browsers do not load these polyfills. Development mode remains modern-browser only.

This is a JavaScript compatibility measure, not a guarantee of full TV support. [LG's engine table](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine) lists Chromium 38 for webOS 3.x, which is outside this target. [Tailwind v4 requires modern CSS](https://tailwindcss.com/docs/compatibility), including Chrome 111+, so older TVs may still have layout/rendering limitations. The plugin does not repair CSS, missing browser APIs or outdated TLS certificates. Check `/display` on the actual TV after deployment; a current browser on an external display device is the reliable fallback for unsupported TVs.

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

## Season administration

In **Administration → Season & configuration**, **Add player to season** works for existing drafts and regular seasons regardless of creation date. Draft additions are included when fixtures are generated. Published-season additions fill spare weekly places from the selected first week, with at most two assigned matches per player per week. Preview the added weeks/opponents before accepting; existing fixtures/results stay unchanged and the projected playoff week follows any extension. Closed seasons show the disabled action with an explanation.

**End season** closes outstanding games without starting playoffs, keeps confirmed results/history, and cancels future bookings for those outstanding games. **Delete season** is only available for unused seasons without history, seeds or linked bookings and requires typing the exact name. Both are administrator-only; no database migration is required. Recorded seasons must be ended to preserve their audit history.

## Casual results

Score-review email and the combined public league/casual recent-results feed are documented in [Result emails](docs/RESULT_EMAILS.md). Emails require the additive outbox migration and private Resend settings in Azure; Supabase Auth SMTP alone does not enable match emails.

The new **Casual games** page supports singles/doubles submissions, opposing confirmation, disputes and separate head-to-head records. Production requires the additive database migration described in [Casual results setup](docs/CASUAL_RESULTS.md); no cloud migration has been applied automatically.

## Application features

- Personal dashboard, live calculated standings, top-four indicators, sortable table, and recent form.
- Full round-robin schedule, round/player/status filters, byes, match details, score submission, opponent approval, disputes, postponements, and an audit timeline.
- Player directory, season profiles, regular-season statistics, round-by-round performance, match history, upcoming fixtures, and head-to-head records across seasons.
- Projected and finalized playoff brackets, best-of-five semifinals, best-of-seven finals, automatic advancement, and champion presentation.
- Admin player creation/editing/deactivation, season creation/settings, fixture generation and adjustments, overdue/postponed queues, dispute resolution, score corrections, and announcements.
- In-app notifications for fixtures, approvals, confirmed results, disputes, postponements, and notices; read/unread state is per user.
- Multiple seasons, historical standings and results, persistent theme preference, responsive navigation, keyboard-accessible forms and native modal dialogs.
- Shared league/casual reservations, collision protection, owner/admin management, London-time opening hours, and casual colleagues without league membership.
- Read-only `/display` TV dashboard, automatic refresh, current/next reservations, standings, results, fixtures and a locally generated booking QR code. Public access is explicitly enabled by the operator.
- Public `/rules` playing-rules reference with all eight owner-supplied sections, a contents menu and the official WEPF/EPA PDF. Open it from the main navigation or the TV's Rules button; TV access uses larger reading text and links back to the display.
- Invitation-only authentication, password setup/recovery, login/logout/session handling, server-resolved active roles, transactional writes and append-only result history in API mode. Mock mode retains its labelled identity switcher and reset.

## Project structure

```text
src/
  app/          Application shell, context, state provider, error boundary
  auth/         Supabase session gate, login, invitation and reset callback
  components/   Shared UI, match cards, standings table, administrative forms
  pages/        League screens, booking calendar, read-only TV display
  domain/       Typed models and pure competition rules; unit tests
  data/         Repository contract, API/mock adapters, shared command transitions, seed data
  styles.css    Theme tokens and responsive component styling, alongside Tailwind
api/
  src/          Functions/local adapters, verified identity, validation, transactional persistence
  tests/        Security and disposable local Supabase integration tests
supabase/       Deployed baseline migration, local Auth configuration and pgTAP tests
tests/          Mock desktop/mobile and real local-API browser workflows
public/
  brand/        Official Virtuoso logo files and source attribution
  staticwebapp.config.json   Azure SWA SPA fallback and Node API runtime
scripts/        Development helpers, local integration runners, API artifact packaging
```

`Participant` is a competition entry with a `kind` and a list of player IDs. A fixture references participants, rather than player IDs directly. This supports future two-person teams without changing the basic fixture or standings model. The current season creation UI deliberately offers singles only.

## Data architecture

`LeagueRepository` in `src/data/contracts.ts` is the application boundary. `browserRepository.ts` selects the API or local adapter using `VITE_DATA_MODE`. Components request typed commands through `useLeague()`; they do not mutate stored fixtures or maintain independent copies of standings. The API adapter sends the Supabase bearer token and last snapshot revision; it never sends an actor identity or role. PostgreSQL returns shared state, while only season/theme preferences remain browser-local.

`src/data/commands.ts` applies transitions to a cloned snapshot in both modes. Failed commands leave the original state unchanged. It checks participant/admin permissions, score validity, and allowed transitions. The API independently verifies identity against Supabase and the active application profile before invoking it; browser-selected mock identity is not trusted. Notifications and audit revisions commit in the same database transaction. `src/domain/rules.ts` owns scheduling, scores, ranking, approvals and qualification; `src/domain/bookings.ts` owns time, overlap and reservation rules.

`src/data/seed.ts` generates 12 fictional colleagues, a complete 66-match current schedule, 24 approved regular-season results, two pending results, one dispute, a postponement, leave, notifications, and a completed previous season with playoffs. Sample dates are relative to the first load/reset date, using the Europe/London calendar. No component contains a separate fixture or player dataset.

Mock browser persistence retains the key `virtuoso-pool-league.v1` for compatibility; its schema is version **3**. Migrations preserve old results, audit history, preferences and finalized playoffs, remove obsolete scoring configuration, and add bookings plus a casual-only colleague. No reset is required. Storage events refresh other open mock tabs. Invalid saved JSON and failed writes are reported explicitly. API mode uses none of these sample records and never writes league data to localStorage.

**Mock mode is demo-only persistence and identity.** Its user-editable localStorage cannot support real multi-user operation. API mode uses server authorization, database constraints, transaction locks and revision checks; conflicting edits require refreshing/reviewing. Supabase manages browser authentication sessions. Never copy live credentials into demo data.

## Documented defaults and lifecycle

- Every regular-season pair meets once. The circle scheduling algorithm handles even and odd counts. Dates target two rounds per week by default; there are no exact match times. Players can submit early.
- Regular-season league matches prefer best of three but also accept an agreed single-frame 1–0/0–1 result. Each win counts once; frame totals reflect the actual score. Semifinals remain best of five and the final best of seven. Score entry asks who won, shows scores from the submitting player's perspective and previews the named result. No draws or incomplete playoff scores are accepted. Apply `20261027000100_single_frame_league_results.sql` before deploying this frontend/API update.
- There is no league points system. A 2–0 or 2–1 result each counts as one match won; the losing side records one loss. Only confirmed regular-season results count in standings. A fixture ID is counted at most once. Unequal matches played never produce artificial wins or losses.
- Ranking: matches won descending, frame difference descending, frames won descending, then the confirmed regular-season head-to-head result for exactly two remaining tied players. Without a confirmed meeting, or for groups of three or more, immutable participant ID ascending provides deterministic display order. Multi-player groups do not use a pairwise comparator or an unagreed mini-league rule.
- The full table displays Pos, Player, P, W, L, F, A, +/-, and Win %, with descriptions and sortable statistics. Recent form remains on player profiles/cards. Qualification highlighting shows provisional top-four positions until seeds lock, then the actual finalized qualifiers even after historical corrections.
- Recent form is ordered by the original submission date, oldest to newest; later corrections do not move a match to the front of the history.
- Qualifiers lock automatically after all regular-season matches are confirmed, unless an unresolved tied group spans the fourth/fifth-place cutoff. The last approval still saves successfully in that case; playoff seeding waits. Explicit admin finalization also cannot bypass that tie. An administrator-approved decider workflow is the next frontend milestone. Ties wholly within the top four may use the display fallback for seed order because qualification membership is unchanged.
- Explicit admin finalization requires a reason and confirmation, closes outstanding fixtures without wins or losses, and locks the resolved top four. It is irreversible within the demo except by a full reset.
- Historical regular-season corrections update the table but preserve already finalized playoff seeds. Semifinal winner corrections can update an untouched scheduled final; they are blocked once the final has started. Final corrections update the champion and preserve score history.
- Fixture postponement is explicit and never awards an automatic defeat. Unavailability recording has been retired; archived leave no longer changes new schedules.
- Season start date, players, and round cadence lock at fixture publication. Names remain editable. Deactivating players preserves existing results/entries; reactivate them to confirm outstanding matches. The current admin cannot deactivate themself.
- Multiple seasons may be in progress. The header chooses the viewed season; there is no automatic cross-season archival or deletion.

## Backend and deployment

The website is also installable on supported phones and desktop browsers. See [PWA.md](docs/PWA.md) for install locations, iPhone instructions, cache/privacy decisions, updates and focused production checks.

The API implements identity/profile mapping, shared league data, fixtures/results, approvals/disputes/corrections, seasons/playoffs, administration, reservations, notifications and a sanitized display endpoint. Short writes are serialized and revision-checked; PostgreSQL independently enforces structural invariants and booking collisions. Clients poll shared data every 30 seconds and update immediately after their own writes.

See [BACKEND_SETUP.md](docs/BACKEND_SETUP.md) for every environment variable, invitation-only Supabase settings, local startup, SMTP templates, first-admin bootstrap, API routes, concurrency decisions, and Azure artifact/upload instructions. `npm run package:api` prepares a runtime package; it does not deploy. Private credentials stay exclusively in API environment settings.

In-app notifications are persisted. Due/overdue reminders can be created by an administrator without duplicate daily notices. ACS Email has a disabled delivery interface; real delivery/outbox processing and scheduled reminders remain deferred. Invitations/password resets are gated off by default until SMTP is configured, tested and approved. Qualification-critical deciders still need an agreed format and recorded resolution workflow; the application blocks qualification safely at such ties.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run build:api
npm run test:e2e
npm run test:integration
npm run test:live
```

Playwright uses installed Google Chrome (`channel: chrome`) for desktop and a mobile viewport/touch emulation. Install Chrome before running these tests. This is mobile Chromium emulation, not a claim of testing on a physical iPhone or Safari. Tests use isolated browser contexts and do not alter your normal demo data. They cover navigation, page overflow, user switching, result submission/approval, persistence, disputes, season generation/byes, postponements, player management, announcements, historical champions, themes, and access boundaries.

The mock browser configuration starts/reuses Vite on 5173. Do not reuse an API-mode server for that suite. Local integration tests require running disposable Supabase; live browser tests start the API on 7071 and api-mode Vite on 5174. Stop a development API first. Helpers refuse cloud endpoints and capture local credentials in memory. Test records are retained for audit, test identities deactivated/deleted, and test bookings cancelled. Screenshots and traces are ignored under `.tools/screenshots/` and `test-results/`. Avoid source edits during browser runs.

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for current scope and intentionally deferred integrations, and [public/brand/README.md](public/brand/README.md) for verified branding sources.

### Weekly fixture schedules

Publish draft schedules before their start week. Fixtures use Monday–Sunday playing weeks (two rounds per week by default), displayed as “Week commencing …”; players arrange times or reserve the table separately. Semifinals and the final share the week after the last regular-season week. Overdue status begins the following Monday. Existing PostgreSQL `due_date` values identify their containing week; new schedules store Monday anchors. No migration or rewrite of existing results/bookings is needed. Deploy the frontend and API together.
