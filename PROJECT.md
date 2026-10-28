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
- Support adding, editing, and deactivating players. User editing does not require or display a department.
- Administrators may delete another user with explicit Yes/No confirmation. Remove the Supabase Auth account and private profile photo, prevent future access/reactivation, cancel their future owned reservations, and remove them from user management. Retain an inactive anonymized “Deleted user” profile and competition entries to preserve match records and immutable audit references. Do not permit self-deletion. This is account deletion, not erasure of competition history.
- The Players directory lists active accounts who belong to a published, unfinished league (regular season or playoffs, including a future published league), or have a valid confirmed league/playoff result in any historical season. Exclude casual-only accounts, pending join requests and draft-only members. Directory eligibility and all-season stats do not depend on the selected season. Profiles still accept account and existing competition-entry links.
- Player cards and profiles show confirmed individual league and playoff totals, form, history and head-to-head records across all published seasons, independent of the season selector. Combine separate competition entries belonging to the same account; exclude drafts, unconfirmed/invalid results and duplicate fixtures. Casual records remain separate. Users without league matches show zero statistics.
- League standings remain specific to the selected season.
- Allow active accounts to upload, replace and remove their own profile photo through the profile editor. Show photos wherever the shared player avatar appears, with initials as fallback.
- Store profile photos in private Supabase Storage with server-authorized uploads and short-lived image URLs; do not expose private photo URLs through the public TV response.
- Keep public.profiles.name authoritative. Self-service display-name changes and administrator name edits also update the linked Supabase Auth user_metadata.name, preserving unrelated metadata and roles. Existing accounts synchronize when their name is next saved; no automatic bulk backfill.
- Support multiple seasons and historical results.
- Draft seasons may be created with zero players so colleagues can join from their dashboards. Player selection at creation is optional; require at least four enrolled players before generating/publishing fixtures, enforced by the API/shared business logic and explained in the administration UI.
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
- Regular-season matches preferably use best-of-three frames, but players may agree to a completed single-frame match when time is limited. Accept 1–0, 0–1, 2–0, 0–2, 2–1 and 1–2; reject draws and other incomplete scores. Keep the stored regular fixture format best-of-three with a stage-specific single-frame score exception. Semifinal/final targets are unchanged.
- A 1–0, 2–0 or 2–1 win each counts as one match won. Frame statistics use the actual submitted frames.
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

### Requests to join a league

- Signed-in active users who are not enrolled can join upcoming leagues immediately, without administrator approval. Drafts count as not started; published leagues permit direct joining until 00:00 Europe/London on the Monday of their start week. Once that week begins, require a request and administrator approval. Advertise eligible leagues on their dashboard with the start week for upcoming leagues and “League in progress” for ongoing leagues. Hide join cards for existing participants and closed/full leagues.
- Keep one enrollment/request record per user per season. Direct joining records acceptance by the joining player and immediately hides their join card; active-season requests show pending/accepted/declined status on the dashboard. Declined requests are not automatically resubmittable; administrators can still add the user manually.
- For approval requests, notify every active administrator in-app and, when existing Resend result-email delivery is enabled, by email. Direct upcoming joins do not generate administrator approval requests. Alerts link to the protected administration queue, and in-app join alerts remain visible across season selection. Keep requests private to their requester and administrators; never expose them in anonymous snapshots.
- Administrators can accept or decline requests. Draft acceptance enrolls the account before fixture generation. Published-season acceptance schedules new fixtures from an administrator-selected first week (default the current week or season start, whichever is later). Preview the new schedule and projected playoff week before approval. Preserve existing pairings/results and prevent duplicate requests/enrollment under concurrent saves. Notify the requester of the decision in-app. Successful direct joins and accepted requests also queue a membership confirmation email through the existing Resend settings; no confirmation email for declined requests. Recheck active identity and membership before delivering.
- Draft joining adds the player before fixture generation. For already published future schedules, preserve existing fixtures/bookings/results and distribute additional pairings into available weekly places starting in the season's start week.
- Stop acceptance once the season closes, qualification locks or the requester becomes inactive. Recheck administrator access and pending/open-season status before email delivery; use the existing durable outbox, retries and delivery settings. No email links perform enrollment directly.

### Mid-season additions

- Display Add player to season for administrators on every selected season, disabled with an explanation when closed. Existing seasons support the same controls regardless of creation date. Draft seasons allow enrollment without creating fixtures; regular seasons append catch-up matches.
- Administrators may add an active account to a singles season while its regular season remains unfinalized. Closed seasons and seasons with playoff fixtures/locked qualifiers do not allow additions.
- Create or reuse the individual's competition entry, and append one best-of-three fixture against every existing participant. Preserve all existing fixtures, results, rounds and weeks. Reject duplicate enrollment/pairings.
- Append separate rounds after the existing rounds, but assign weeks independently: fill the earliest spare weekly places from the selected first week, with at most two assigned regular-season matches per participant per week. Prefer opponents with one existing fixture that week before those with none. Count existing non-cancelled fixtures, including confirmed matches, in their assigned week. Preserve existing over-capacity or overdue schedules rather than silently moving them, and never add to a full week. Players can still play early; this is an assigned-week limit within the season.
- Mark additional fixtures scheduled, add weeks after the existing schedule when needed, and derive the projected playoff week from the new last league week. Do not regenerate published fixtures or rewrite previously created catch-up fixtures. Scheduled and postponed fixtures display as overdue on the Monday after their playing week ends; no loss is awarded automatically.
- The new participant starts with zero played/wins/losses. Only approved results affect standings; all new regular-season fixtures must be resolved before normal automatic playoff qualification.

#### Optional batch acceptance and future-week revision

- Administrators can select pending requests for one published singles season and preview accepting the players together while rebalancing future weeks. Individual acceptance and manual additions retain the existing preserve-all-weeks behavior above.
- Preserve every existing fixture in the current or an earlier week, any fixture with a submitted result or result history (including future pending, disputed and confirmed results), and fixtures with reserved bookings. Cancelled fixtures remain unchanged. Move only future scheduled/postponed fixtures without results or reserved bookings; preserve their IDs, pairings, round numbers, status and prior history.
- Create each missing new-versus-existing and new-versus-new pairing once. New pairings can fill spare places this week, prioritizing a game between joiners. Never assign additional games to a player with two existing games in that week.
- Rebalance future weeks to aim for two assigned regular-season fixtures per player per week, with a maximum of two. Ordinary byes and protected fixtures can prevent a full two-game week. Preserve any pre-existing protected over-capacity week without adding further fixtures to those players. No dedicated catch-up week is introduced; extend the league when necessary and project all playoffs into the week after the last league week.
- Preview new/moved fixture counts, joining players' weekly workloads, all players' weekly totals, individual changed weeks and the projected end/playoff weeks. Require explicit confirmation. Recompute and validate the plan server-side and apply enrollment, request approval, new fixtures and changed weeks in one revision-checked transaction; reject stale previews or concurrent duplicate approvals.
- Record every changed week in the fixture audit trail and notify affected participants in-app. Accepted players receive the existing membership notification/confirmation email. No results or bookings are rewritten and no real email is sent by previewing.

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
- Score entry first asks whether the participant won or lost, then offers valid scores from their own perspective with their frames first. Show the named home/away result before saving, mapping it to the stored order. Administrators who did not play select the named winner. Use the same clear winner/score controls for casual submissions and corrections while retaining each casual match's selected format.
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
- Casual submissions and resubmissions create unread, season-independent in-app approval notifications for each opposing player (never the submitter or their doubles teammate), linking directly to the result. Show these in Notifications and its unread bell count regardless of selected season; read state persists between sessions.
- Show pending opposing approvals on the dashboard and casual page. When separately enabled, Resend sends opposing players a protected review link for new submissions/resubmissions through a durable server-only outbox.

## Email Notifications

The application should eventually support:

- Upcoming fixture notifications.
- Links to fixtures within the web application.
- Notifications when a score requires confirmation.
- Score approval and dispute notifications.
- When result email delivery is enabled, email all active administrators once for each new league/casual dispute, linking to its protected review page. Recheck administrator access before delivery and skip superseded/resolved disputes.
- Reminders for overdue fixtures.
- Administrators can preview and manually send the current week’s newsletter from Administration → Season & configuration → League communications. Preview shows a personalized HTML/plain-text example and active-recipient count, with explicit send confirmation. No published upcoming fixtures means sending is disabled. Revalidate preview content/recipients and administrator access on send; share weekly deduplication with scheduled delivery, so a newsletter can only be queued once per week. Queue only after confirmation; failed delivery uses existing email retry controls.
- A Monday 07:00 Europe/London HTML/plain-text newsletter goes to every active invited/confirmed account, including casual-only colleagues. Include scheduled/postponed published league fixtures due that Monday–Sunday, highlight the recipient's fixtures and label playoff stages. Include league results confirmed/corrected in the previous Monday–Sunday, when present. Skip the newsletter entirely when there are no upcoming league fixtures that week, even if last week had results.

Email links must not bypass authentication or authorization.

Score-review email uses the existing Resend provider via its API, separately configured from Supabase Auth SMTP. Queue jobs atomically with submissions, deliver after commit, deduplicate/retry with bounded leases/backoff and recheck current identity/eligibility before sending. No automatic real email or paid resource provisioning during development. See `docs/RESULT_EMAILS.md` for operator enablement and manual retry behaviour; ACS remains a future adapter option.

Manual newsletter sending and Send pending emails automatically continue short HTTP delivery batches until no immediately eligible email remains. Show progress and distinguish delayed retries from messages being sent. A separate one-minute Supabase Cron delivery job continues already queued emails if the sender closes the site; the hourly result automation and weekly newsletter schedules remain separate. Retain provider pacing, retry delays, leases and duplicate protection rather than running an unbounded HTTP request.

Scheduled automation uses Supabase Cron/pg_net to call secret-protected HTTP endpoints on the existing Azure Functions API. Store the scheduler key in Azure settings and Supabase Vault, not frontend variables or job text. Keep it disabled until the additive migration, deployment and explicit operator activation are complete. See `docs/SCHEDULED_AUTOMATION.md`.

## Application Pages

Visitors may browse the dashboard, published seasons, standings, player profiles, fixtures/results, playoffs, rules and upcoming table reservations without signing in. Sign-in is required for all changes, booking/cancellation, result actions, personal notifications, profile editing and administration. Anonymous data must be explicitly allowlisted: exclude draft seasons, private account details, leave records, audit notes and private profile-photo URLs. Unapproved full records remain filtered; the recent-results feed explicitly publishes names, scores and statuses for league/casual submissions, with clear unconfirmed labels. The TV can navigate to the main public dashboard without an account.

1. Dashboard — current standings, upcoming fixtures, recent results, and league highlights. Without a real selected season, clearly display “No league scheduled”, retain bookings/casual results/rules and hide fallback draft badges, zero-player competition statistics and season-only panels.
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
   - Link to the full rules and keep all TV sections within the 1080p layout. Rotate bookings, results and upcoming fixtures in smaller pages on shorter screens rather than clipping text. Use the saved official orange gradient Virtuoso logo across the application and newsletter.

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

### Installable mobile web app

- Offer installation beside the theme button in the mobile header, hidden in standalone mode and on larger layouts, without requiring app stores. Desktop users may use their browser's installation menu.
- Use the browser installation prompt where supported; show Safari Add to Home Screen instructions on iPhone/iPad. Installed launches use a standalone window.
- Keep authentication, shared data and mutations online-only. Cache public static assets only; offline launches show a reconnect page. Never service-worker-cache API responses or account/invitation documents.
- Ask before reloading to activate an update. Preserve the existing online-only legacy TV display behavior.
- Phone push notifications and native store distribution are outside this iteration.

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
