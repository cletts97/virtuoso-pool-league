# Frontend implementation status

## Backend integration — in progress (20 October 2026)

- Reviewed AGENTS, PROJECT, README, implementation status, all database design/setup/review documents, the deployed initial SQL migration, and all pgTAP tests. The old validation-only review task is superseded by the explicit backend-integration request. The deployed migration is unchanged.
- Reconciled interrupted booking work: repaired TV result-card layout; the earlier booking selector/setup fixes are present. All 14 booking browser cases have now passed across the main run and a targeted rerun after Vite warmed its dependency cache. A final full regression run remains pending.
- Added explicit API/mock modes, Supabase sign-in/password/callback screens, session gates, API repository, and live-mode removal of demo identity/reset controls.
- Added Azure Functions HTTP adapter, local HTTP runner using the same handlers, PostgreSQL mapping, parameterized transactional writes, active-profile checks, strict request validation, concurrency revision guards, sanitized public display, and account enrollment/invitation controls. No cloud calls or schema changes.
- Server serializes short writes with a transaction-scoped advisory lock, additionally locks linked fixtures, and commits results/events/notifications/playoffs together. Existing pure competition and booking rules remain authoritative.
- Local Docker was started by the owner. Local Supabase is running; integration tests exposed a configuration distinction: global signup must be disabled while the email provider remains enabled. Local settings are being verified accordingly. Invitation domain is configurable, with `virtuoso.tech` agreed by the owner. Real email remains disabled by default.
- Next: finish local Auth/database/concurrency tests, live-browser workflows, code cleanup, deployment/configuration documentation, and final regression validation. Do not interpret file presence as validated completion.

## Current milestone — table bookings and office display (in progress, 20 October 2026)

- Reviewed the new PROJECT.md booking/HUD requirements and existing service boundaries.
- Added booking models, centralized time/overlap/ownership rules, mock commands, schema 3 migration, and a casual-only demo colleague without a league entry.
- Added the booking calendar, owner/admin reservation forms, configurable opening hours, dashboard availability, and fixture booking links.
- Added a separate read-only `/display` route and allowlisted display repository view, local QR generation, automatic refresh, queue paging, and London-time countdowns.
- Now validating desktop/mobile/TV layouts, booking workflows, DST transitions, migration, permissions, and existing league regression coverage. Check results will be recorded when executed.
- Database, real authentication, shared booking concurrency, Azure and email remain deferred. Existing qualification-decider work is unchanged.

## Previous milestone — win-based standings (20 October 2026)

Scope: align the existing frontend with the updated PROJECT.md; retain the current architecture and stop after this milestone.

- Removed scoring fields from the season configuration and derived standings model. Standings now rank confirmed regular-season results by wins, frame difference, frames won, applicable head-to-head, then immutable participant ID for display.
- Documented head-to-head applicability: exactly two players tied on the first three criteria, with their direct result confirmed in the selected regular season. Multi-player or unplayed ties use stable display order without a cyclic pairwise sort.
- Full league table now uses Pos, Player, P, W, L, F, A, +/-, Win %, with tooltips/descriptions. Updated dashboard, player cards/profiles, administration, seeded notices, and workflow copy.
- Highlighting distinguishes provisional positions from actual locked qualifiers, including historical corrections that change the table after seeds lock.
- Added a version 1 → 2 localStorage migration that preserves results, history, preferences and finalized playoffs; existing browser data does not need resetting.
- Added a qualification guard: unresolved ties spanning fourth/fifth place cannot be finalized automatically or by an admin override. Final match approvals still persist. The UI explains that a decider is required.
- Match formats remain BO3 / BO5 / BO7. No new dependencies, backend integrations or infrastructure.
- Milestone complete and stopped at the requested boundary. Validation on 20 October 2026: strict type checking, lint (no warnings), all 55 unit/service tests, all 22 desktop/mobile browser tests, production build, and `git diff --check` passed. Reviewed updated desktop/mobile standings screenshots.
- Browser regression coverage verifies the exact table columns, sorting, provisional/confirmed qualifier labels, no scoring references on primary screens, legacy-save migration, result approval/persistence, and the existing administrative/playoff workflows.
- No backend integration, dependency installation, commit, push or deployment was performed in this milestone.

## Recommended next milestone — administrator-approved qualification deciders

The revised requirement for an administrative decider is not yet implemented as a playable/recordable workflow. This milestone detects and safely blocks unresolved cutoff ties; it does not fabricate a qualifying order or let a free-text finalization reason override the result.

Next: agree the decider format and procedure for multi-player ties, then add scheduling, result recording/approval, an auditable resolution record, and qualification from that resolution. Decider results must not inflate regular-season records. This is a business-rule decision to settle before implementation.

## Remaining original requirements and follow-up work

- Core singles frontend workflows are implemented: schedules/byes, submissions/approvals/disputes/corrections, players, availability, notifications, historical seasons and playoffs. These remain mock-backed.
- Qualification decider management is the immediate gap introduced by the revised ranking rules.
- An individually abandoned fixture can be rescheduled/postponed; closing unresolved fixtures currently happens through whole-season finalization. A dedicated per-fixture abandonment decision/audit workflow remains a later admin enhancement.
- Doubles team/competition management UI remains deferred; the data model supports team entries.
- Automatic ongoing upcoming/overdue reminders remain deferred; seeded reminders and action-triggered in-app notices work, but there is no background scheduler.
- Real database, API, authentication, email, hosting deployment, broader browser/accessibility verification, and formal SVG/font assets remain deferred as detailed below.

## Implemented

- Complete navigable React/TypeScript/Vite application with responsive dark and light themes and verified Virtuoso branding.
- Dashboard that follows the selected player and season, calculated league table, sortable statistics, qualification indicators, and clickable player profiles.
- Round-robin fixtures grouped by rounds; odd-player byes; player/round/status filters; match details and full result history.
- Legal score controls, opponent-only approval, disputes, admin resolution, result corrections, and append-only score/action audit records.
- Postponement and rescheduling with reasons and notifications; overdue fixtures never produce automatic defeats.
- Player directory, profile statistics/form, season performance, match histories, upcoming fixtures, and cross-season head-to-head records.
- Provisional/finalized playoff bracket, first-versus-fourth and second-versus-third seeding, semifinal/final workflows, and champion presentation.
- Player management; draft season creation/settings; schedule publication; recorded leave and clash review; overdue/postponed/disputed queues; league announcements.
- Multiple seasons, historical standings/results/champions, per-user in-app inbox, mock identity switching, localStorage persistence, and confirmed demo reset.
- Pure domain rules, typed repository/notification contracts, centralized command validation, and realistic internally consistent seed data.
- Unit/service tests and desktop/mobile browser workflow tests. See the final handoff for commands actually executed and their results.

## Validation performed on 19 October 2026

- Strict TypeScript check passed (`npm run typecheck`).
- ESLint passed without warnings (`npm run lint`).
- 39 unit/service tests passed (`npm test`).
- 18 Playwright desktop/mobile workflow tests passed (`npm run test:e2e`). Includes full playoff progression to champion, modal errors, keyboard tabs, persistence, and 320/390/768/1024/1440-pixel layout checks.
- Production build passed (`npm run build`).
- Dependency installation audit reported zero vulnerabilities after upgrading the toolchain.
- Desktop dark/light, league-table, playoff, and mobile screenshots were generated and inspected. Browser tests reported no JavaScript page errors or horizontal page overflow on the inspected routes.
- `git diff --check` passed. No commits, pushes, deployments, or cloud resources were created.

## Deliberately deferred

- **Production authentication and authorization:** provider choice remains undecided. The demo selector and local service guards are not security controls for real users.
- **Database and API:** no Azure Functions, PostgreSQL/Supabase schema/migrations, or database connection yet. Server validation, database constraints, transactional approval, concurrency and idempotency are required before real multi-user use.
- **Email:** no outgoing email or background reminder scheduler. In-app notifications work; the notification contract provides the future server integration point.
- **Deployment:** no Azure resources, deployment, CI/CD publishing, or Git commit/push. Static Web Apps fallback configuration is prepared only.
- **Doubles UI:** the participant model supports teams, but creating/managing doubles competitions is not exposed. Do not interpret the model as a validated doubles product.
- **Arbitrary playoff rollback:** corrections preserve finalized seeds. Winner changes are blocked once downstream play has started; reseeding or replaying an already played final requires a future explicit administrative rollback workflow.
- **Broader browser/accessibility certification:** automated browser coverage is Chrome desktop and mobile emulation. Physical device/Safari testing and a formal accessibility audit remain appropriate before production use.
- **Formal brand package:** official web PNGs are included. SVG variants, definitive brand rules, and approved fonts can replace these when supplied.

## Demo constraints

- Data is stored only in this browser. Clearing site storage removes it. Cross-tab refresh is supported; concurrent multi-user writes are not.
- Initial sample season dates are relative to the first load/reset date. Demo names and records are fictional.
- Competition rules are fixed to the agreed wins/frames ranking, match formats, and top-four qualification. Draft-season cadence and dates are configurable. Existing fixture dates can be adjusted individually.
- A full reset discards all demo changes. Explicit regular-season finalization closes unresolved matches without awarding wins or losses and does not have a selective undo.
