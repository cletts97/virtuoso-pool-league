# Virtuoso Pool League — Project Specification

## Overview

Virtuoso Pool League is a modern, responsive web application for managing an internal office pool league.

The application will be used by approximately 10–14 colleagues to organize competitive but friendly pool matches, track results, view league standings, and compete in end-of-season playoffs.

The application should be visually polished, intuitive, mobile-friendly, and enjoyable to use.

## Technology Stack

- Frontend: React, TypeScript, Vite
- Styling: Tailwind CSS
- Hosting: Azure Static Web Apps (Free tier)
- Backend: Azure Functions using TypeScript
- Database: PostgreSQL (Supabase)
- Source control: GitHub
- Email notifications: Azure Communication Services Email
- Authentication: Supabase Auth, invitation-only work-email/password accounts (no Microsoft Entra integration)

Keep operating costs as close to zero as reasonably possible.

## League Structure

### Players

- Initially support approximately 10–14 players.
- Support adding, editing, and deactivating players.
- The Players directory lists every active user by default, including casual-only colleagues and users without season membership. Profiles accept both account and existing competition-entry links.
- Player cards and profiles show confirmed individual league and playoff totals, form, history and head-to-head records across all published seasons, independent of the season selector. Combine separate competition entries belonging to the same account; exclude drafts, unconfirmed/invalid results and duplicate fixtures. Casual records remain separate. Users without league matches show zero statistics.
- League standings remain specific to the selected season.
- Allow active accounts to upload, replace and remove their own profile photo through the profile editor. Show photos wherever the shared player avatar appears, with initials as fallback.
- Store profile photos in private Supabase Storage with server-authorized uploads and short-lived image URLs; do not expose private photo URLs through the public TV response.
- Support multiple seasons and historical results.
- When creating a season, administrators select from all active accounts. Create or reuse individual competition entries automatically; no separate Add to league enrollment step is required.

### Regular Season

- Singles round-robin league.
- Each player plays every other player once.
- Automatically generate the fixture list.
- Publish fixtures in advance.
- Target approximately two rounds per week.
- Fixtures are assigned to Monday–Sunday playing weeks, displayed as **Week commencing [Monday]**, with no assigned playing date or time. Default two rounds per week; rounds in the same week share its Monday anchor.
- Administrators can generate and publish fixtures before the season starts, including future Monday starts. Selecting another start date normalizes it to that week's Monday.
- Players arrange their matches themselves without assigned times. Table reservations remain separate and have exact dates/times.
- Allow matches to be played ahead of schedule.
- Regular-season matches use best-of-three frames.
- A 2–0 win and a 2–1 win both count as one match won.
- A loss counts as one match lost.
- There is no league points system.
- Track matches played, wins, losses, frames won, frames lost, frame difference, and win percentage.

#### League Ranking

Rank players using the following criteria, in order:

1. **Matches won (W)** — the player with the most match wins ranks highest.
2. **Frame difference (+/-)** — frames won minus frames lost.
3. **Frames won (F)** — the player who has won more individual frames ranks higher.
4. **Head-to-head result** — where applicable, use the result between the tied players.
5. **Final tiebreaker** — use a documented deterministic fallback for displaying unresolved ties. Qualification-critical ties should be resolved through an administrator-approved decider where necessary.

Head-to-head applies when exactly two players remain tied after W, +/-, and F, using only their confirmed regular-season meeting in the selected season. If that meeting is not confirmed, or three or more players remain tied, immutable participant ID ascending provides display order only. No pairwise head-to-head sort or unagreed mini-league rule is applied to multi-player groups.

An unresolved group spanning fourth and fifth place blocks automatic and explicit playoff qualification. The last match approval must still be saved; the season remains in its regular-season state pending resolution. Ties wholly inside or outside the top four do not change qualification membership and use the display fallback for seed order.

Do not award or display league points anywhere in the application.

#### League Table

Display standings using the following columns:

| Column | Description                  |
| ------ | ---------------------------- |
| Pos    | League position              |
| Player | Player name                  |
| P      | Matches played               |
| W      | Matches won                  |
| L      | Matches lost                 |
| F      | Frames won                   |
| A      | Frames against (frames lost) |
| +/-    | Frame difference             |
| Win %  | Match win percentage         |

- Highlight the top four playoff qualification positions.
- Clearly distinguish between confirmed playoff qualifiers and provisional qualifying positions.
- Calculate standings exclusively from approved match results.
- Pending, disputed, postponed, and unplayed fixtures must not affect standings.
- Where players have played different numbers of matches, display their actual records without awarding artificial points or penalties.
- Do not introduce a points column, points calculation, or points-based tiebreaker.

### Mid-season additions

- Display Add player to season for administrators on every selected season, disabled with an explanation when closed. Existing seasons support the same controls regardless of creation date. Draft seasons allow enrollment without creating fixtures; regular seasons append catch-up matches.
- Administrators may add an active account to a singles season while its regular season remains unfinalized. Closed seasons and seasons with playoff fixtures/locked qualifiers do not allow additions.
- Create or reuse the individual's competition entry, and append one best-of-three fixture against every existing participant. Preserve all existing fixtures, results, rounds and weeks. Reject duplicate enrollment/pairings.
- Append separate catch-up rounds after the current rounds. These backlog fixtures share an administrator-selected catch-up week (default the week containing two weeks from today), rather than regenerating the normal two-rounds-per-week schedule.
- Mark the new fixtures postponed with the selected catch-up week. Scheduled and postponed fixtures display as overdue on the Monday after their playing week ends; the stored result is unchanged and no loss is awarded automatically.
- The new participant starts with zero played/wins/losses. Only approved results affect standings; all new regular-season fixtures must be resolved before normal automatic playoff qualification.

### Postponements

- Do not provide separate unavailability/annual-leave recording. Retain historical records without using them to adjust new fixture dates.
- Allow matches to be postponed.
- Do not automatically penalize players for missed or postponed fixtures.
- Allow postponed matches to be completed after players return.
- Continue other league fixtures while some matches remain outstanding.
- Support a catch-up period before playoffs.
- Allow administrators to resolve overdue or abandoned fixtures.

### Ending and deleting seasons

- Administrators can end an unfinished season with a reason and explicit confirmation, without seeding playoffs or inventing a champion. Preserve confirmed results, standings, playoff seeds and history. Cancel outstanding matches without automatic wins/losses, record cancellation events and cancel future reservations for those outstanding matches. Mark the season complete and notify its participants.
- Permit permanent deletion only when no result/audit history, playoff seeds/champion or linked bookings exist. Require typing the exact season name. Remove the season, unused fixtures, season entries, announcements and notifications atomically; retain accounts, reusable competition entries and casual games. Select another season, or support an empty workspace when the last season is deleted.
- Seasons with recorded history or linked bookings must be ended rather than deleted. No automatic cleanup of historical records is permitted.

### Playoffs

- The top four players qualify based on the final league standings.
- Semifinal 1: first place versus fourth place.
- Semifinal 2: second place versus third place.
- Semifinals use best-of-five frames.
- Final uses best-of-seven frames.
- Both semifinals and the final are assigned to the same playing week: the week immediately after the last regular-season fixture week (including catch-up weeks). Show the projected week before qualifiers are finalized; qualification safeguards remain unchanged. Explicit postponements can move individual playoff weeks.
- Display a visual playoff bracket.
- Record the season champion.

## Score Submission and Approval

- A participant submits the result of a completed match.
- The opposing participant receives a notification.
- The opponent can approve or dispute the submitted result.
- Only an approved result updates the league standings.
- Administrators can resolve disputes and correct results.
- When scheduled automation is enabled, send each opposing active player one reminder after 24 hours from the latest pending submission. Automatically confirm valid still-pending league/casual scores after 48 hours, checked hourly. Never auto-confirm disputed/cancelled results or closed league stages. Record a separate system audit event without impersonating a player; apply the existing standings and playoff progression rules. Resubmitting a disputed casual score restarts its clock.
- Maintain basic result history for accountability.
- Prevent duplicate submissions and self-approval.

## Casual results and head-to-head records

- Provide `/casual` for season-independent singles and doubles results. Any active invited account may play without league membership or a booking.
- Support one-frame games and best-of-three/five/seven matches (default three), completed scores without draws, and a date no later than today. Each side has one or two distinct players.
- Only someone who played may submit. An opposing player confirms or disputes; a submitting player's doubles teammate cannot confirm. The original submitter may correct and resubmit a dispute with the same players.
- Administrators may resolve/correct or void results with a reason. Preserve revisions; voided games cannot be reopened. Only confirmed results affect casual statistics.
- Include disputed casual results in the administration dispute count and Fixtures & disputes queue across all dates, independent of the selected league season, with direct resolution.
- Head-to-head compares exact singles players or doubles teams across all dates, independent of member/side order. Keep league records separate. Multiple real games on the same date are allowed.
- Public casual history shows confirmed scores/players without audit identities, history or reasons. Pending/disputed/voided full game records remain restricted to participants/admins; the separate public recent-results feed may show their names, score and status only.
- Show pending opposing approvals on the dashboard and casual page. When separately enabled, Resend sends opposing players a protected review link for new submissions/resubmissions through a durable server-only outbox.

## Email Notifications

The application should eventually support:

- Upcoming fixture notifications.
- Links to fixtures within the web application.
- Notifications when a score requires confirmation.
- Score approval and dispute notifications.
- When result email delivery is enabled, email all active administrators once for each new league/casual dispute, linking to its protected review page. Recheck administrator access before delivery and skip superseded/resolved disputes.
- Reminders for overdue fixtures.
- A Monday 07:00 Europe/London HTML/plain-text newsletter goes to every active invited/confirmed account, including casual-only colleagues. Include scheduled/postponed published league fixtures due that Monday–Sunday, highlight the recipient's fixtures and label playoff stages. Include league results confirmed/corrected in the previous Monday–Sunday, when present. Skip the newsletter entirely when there are no upcoming league fixtures that week, even if last week had results.

Email links must not bypass authentication or authorization.

Score-review email uses the existing Resend provider via its API, separately configured from Supabase Auth SMTP. Queue jobs atomically with submissions, deliver after commit, deduplicate/retry with bounded leases/backoff and recheck current identity/eligibility before sending. No automatic real email or paid resource provisioning during development. See `docs/RESULT_EMAILS.md` for operator enablement and manual retry behaviour; ACS remains a future adapter option.

Scheduled automation uses Supabase Cron/pg_net to call secret-protected HTTP endpoints on the existing Azure Functions API. Store the scheduler key in Azure settings and Supabase Vault, not frontend variables or job text. Keep it disabled until the additive migration, deployment and explicit operator activation are complete. See `docs/SCHEDULED_AUTOMATION.md`.

## Application Pages

Visitors may browse the dashboard, published seasons, standings, player profiles, fixtures/results, playoffs, rules and upcoming table reservations without signing in. Sign-in is required for all changes, booking/cancellation, result actions, personal notifications, profile editing and administration. Anonymous data must be explicitly allowlisted: exclude draft seasons, private account details, leave records, audit notes and private profile-photo URLs. Unapproved full records remain filtered; the recent-results feed explicitly publishes names, scores and statuses for league/casual submissions, with clear unconfirmed labels. The TV can navigate to the main public dashboard without an account.

1. Dashboard — current standings, upcoming fixtures, recent results, and league highlights.
2. League Table — rankings, wins, losses, frame difference, and player statistics.
3. Fixtures — upcoming, completed, and postponed matches.
4. Match Details — match information, score entry, and approval.
5. Players — player profiles and statistics.
6. Playoffs — semifinal and final bracket.
7. Administration — player management, season management, fixtures, and disputes.
8. Table Bookings — calendar, availability, booking creation and management.
9. Office HUD — dedicated full-screen TV dashboard.
10. Rules — public playing-rules reference, with the owner-supplied WEPF-based summary and official EPA PDF source, accessible from the app and TV dashboard.
    Keep the concise rules page and shared dashboard/TV reminders aligned with the linked EPA-hosted WEPF World Rules poster (abridged January 2020), including nomination/snooker/break exceptions. Only one foot must touch the floor; do not imply both feet are required. This playing-rule reference does not alter competition scoring or result-approval logic.

## Pool Table Booking System

Virtuoso Pool League will include a booking system allowing colleagues to reserve the office pool table for both competitive league fixtures and casual games.

### Booking Requirements

- Allow authenticated users to book the pool table.
- Offer Pool (default) or Table tennis as the booking activity. Both reserve the same convertible table and cannot overlap, regardless of activity. Existing bookings are Pool. Show the activity on reservation cards and on both current/upcoming TV bookings. Table tennis uses casual bookings; league fixtures remain Pool-only. Do not introduce table-tennis results or standings through this booking choice.
- Support two booking types:
  - **League Match** — optionally associated with an existing league fixture.
  - **Casual Game** — available to anyone with an account, including colleagues not participating in the league.
- Provide a calendar showing table availability.
- Support 15 and 30-minute bookings, defaulting to 15 minutes.
- Allow bookings up to seven days in advance.
- Prevent overlapping reservations.
- Allow users to view, modify, and cancel their own bookings.
- Allow administrators to manage all reservations.
- Display the person who made the booking and, where relevant, the participants.
- Allow players to book the table directly from an upcoming league fixture.
- Display today's bookings and upcoming availability on the main dashboard.

A league fixture does not require a table reservation, and casual bookings must not affect league standings.

### Booking Rules

- All bookings must have a valid start time and duration.
- Booking availability should respect configurable office hours. Existing 60-minute reservations remain readable and cancellable, but new or edited reservations use 15 or 30 minutes.
- Overlapping reservations must be rejected.
- Only the booking owner or an administrator can modify or cancel a reservation.
- The backend must enforce these rules independently of frontend validation.
- Booking times should be stored consistently with appropriate timezone handling, displaying times in Europe/London.
- The initial implementation should use mock data and browser-local persistence.
- Real shared booking functionality will be implemented using PostgreSQL and Azure Functions.

## Office TV Dashboard (HUD)

The application will include a dedicated, read-only dashboard designed to run continuously on a landscape 16:9 television positioned near the pool table.

### General Requirements

- Accessible through a dedicated `/display` route.
- Optimized for fullscreen display on a large television.
- Use Virtuoso branding and the existing application design system.
- Large, readable text and clear visual hierarchy.
- Automatically refresh displayed information.
- No administrative controls or account management options.
- Include a Rules link and a clear route back from the rules reference; no sign-in is required to read it.
- No requirement for a personal user account to remain signed in, provided the displayed information is approved for unauthenticated viewing.
- Do not expose email addresses or sensitive account information.

### Display Information

The HUD should prominently display:

1. **Current Booking**
   - Who has reserved the table.
   - League match or casual game.
   - Booking start and end times.
   - Time remaining in the current reservation.

2. **Upcoming Bookings**
   - Share one tile with current availability; retain booking owners, participants, countdown and opening hours.
   - Remaining reservations for the current day.
   - Upcoming players or booking owners.
   - Start times and durations.
   - Clear indication when the table is available.

3. **League Standings**
   - Use a taller tile spanning both main display rows. Return the full standings rather than just five players; show the normal 12–14-player league at 1080p and rotate smaller pages on shorter screens or with long names.
   - Top-ranked players.
   - Matches played, wins and losses.
   - Frame difference where space allows.
   - Highlight the top four playoff qualification positions.
   - Do not display league points.

4. **Recent Results**
   - Recent league and casual submissions, including pending/confirmed/disputed and cancelled/voided scores, labelled by type and status. Exclude unpublished draft fixtures and games with no recorded score.
   - Player names and frame scores.

5. **Upcoming League Fixtures**
   - Highlight important upcoming matches.
   - Show scheduled bookings where applicable.

6. **QR Code**
   - Display a QR code linking directly to the pool table booking page.
   - Allow colleagues to quickly open the app on their phones.

7. **Rules reminders**
   - Keep four reminders on the main dashboard. The TV shows eight reminders in two rows: opponent-ball fouls, the cushion rule, foul-snooker nomination, baulk direction, two visits after a foul, potting the black, black on the break, and feet/moving balls. Include the owner-supplied rack-layout image alongside the TV reminders, with a link to view it full-size.
   - Link to the full rules and keep all TV sections within the 1080p layout. Rotate bookings, results and upcoming fixtures in smaller pages on shorter screens rather than clipping text. Retain the existing white Virtuoso logo.

### Future HUD Enhancements

- Player of the Week.
- Current winning streaks.
- Playoff qualification countdowns.
- League announcements.
- Rotating statistics and highlights.
- Optional automatic rotation between display views.

### Technical Requirements

- The HUD must use the same repository/service architecture as the main application.
- Bookings, fixtures and league results should share consistent data sources.
- The initial demo should function with mock data.
- Once the real backend is implemented, the HUD should retrieve shared information automatically.
- Start with periodic data refresh rather than requiring real-time WebSocket connections.
- Ensure the display works without interaction from a mouse or keyboard.
- Maintain a reliable, readable layout during extended operation.

## Future Features

- Doubles competitions.
- Multiple competition formats.
- Additional awards and achievements.
- Head-to-head records and comparisons.
- Advanced player statistics.
- Historical leaderboards.
- Optional email digests.

## Design Goals

- Use simple, natural language throughout the interface. Prefer descriptive labels and useful instructions over dramatic sports slogans or promotional wording.

- Modern sports dashboard aesthetic.
- Subtle Virtuoso branding.
- Responsive on desktop and mobile.
- Clean typography, cards, tables, and navigation.
- Clear visual distinction between pending, confirmed, and postponed fixtures.
- Accessible controls and readable data.
- Avoid an overly corporate or generic appearance.

## Development Priorities

### Phase 1 — Foundation

- Initialize application.
- Establish project structure.
- Configure frontend tooling.
- Build reusable layout and navigation.
- Create a polished dashboard using mock data.

### Phase 2 — League Management

- Design and implement database schema.
- Implement players, seasons, and fixtures.
- Generate round-robin schedules.
- Implement win/loss-based standings calculations with frame-based tiebreakers.

### Phase 3 — Match Workflow

- Implement authentication and permissions.
- Add score submission and approval.
- Implement result history and disputes.

### Phase 4 — Competition Management

- Implement fixture postponements.
- Implement playoff qualification and brackets.
- Implement administrative controls.

### Phase 5 — Notifications and Deployment

- Integrate email notifications.
- Deploy to Azure Static Web Apps.
- Configure production database and secrets.
- Test end-to-end workflows.

### Phase 6 — Table Booking and Office HUD
- Implement pool table booking management.
- Support league and casual reservations.
- Prevent overlapping bookings.
- Integrate bookings with league fixtures.
- Build dedicated full-screen TV dashboard.
- Display current and upcoming reservations.
- Add QR code for mobile booking access.
- Integrate shared booking data with PostgreSQL.

## Guiding Principles

Build a reliable, maintainable application rather than merely a prototype.

Prioritize correctness of league rules, intuitive workflows, security, and visual quality.

Avoid unnecessary complexity and paid infrastructure until it is justified.

Implementation details may evolve, but material changes to league rules or architecture must be discussed and documented.

## Initial Frontend Implementation Decisions

The initial complete frontend runs locally with mock identity, a typed repository/service layer, and browser-local persistence.

API mode now uses Supabase Auth and the existing PostgreSQL schema through Azure Functions; isolated mock mode remains available. Real email delivery and hosted deployment require separate configuration, testing and owner approval.

The frontend includes administration, approval workflows, historical seasons, and playoffs without provisioning cloud services.

Defaults established for this iteration:

- **Standings:** Deterministic ranking uses matches won, frame difference, frames won, head-to-head where applicable, then immutable participant ID ascending as the final display-only fallback. Qualification-critical ties that remain unresolved require an administrator-approved resolution.
- **No league points:** No points should be calculated, stored, displayed, or used to rank players. Wins and losses are the primary match outcome statistics.
- **Playoff qualification:** Top-four seeds lock automatically after all regular-season fixtures are confirmed, or through explicit administrator finalization with a reason and confirmation, provided no unresolved tie spans the qualification cutoff.
- **Season finalization:** Explicit finalization closes unresolved fixtures without awarding wins, losses, points, or automatic defeats.
- **Historical corrections:** Later historical corrections update standings but preserve finalized playoff seeds. Changes to semifinal winners cannot replace participants in an already started final.
- **Scheduling:** Archived leave records do not adjust new fixtures. Participants or administrators explicitly postpone fixtures; existing agreed weeks are preserved.
- **Schedule configuration:** Draft seasons allow a configurable rounds-per-week target, defaulting to two. Published schedule settings are locked; individual fixture weeks remain adjustable. Existing stored fixture dates identify their containing Monday–Sunday week; new schedules store Monday anchors without rewriting historical data.
- **Competition participants:** The competition participant model supports individual or team entries. The initial management UI is singles only; doubles management is deferred.

See README.md for the complete architecture, local startup, workflow guide, backend integration boundaries, and demo limitations.

See IMPLEMENTATION_STATUS.md for delivered and deferred scope.
