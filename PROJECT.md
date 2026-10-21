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
- Track individual player statistics.
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
- Players arrange their matches themselves without assigned times.
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

### Annual Leave and Postponements

- Allow administrators to record player unavailability.
- Allow matches to be postponed.
- Do not automatically penalize players for approved annual leave.
- Allow postponed matches to be completed after players return.
- Continue other league fixtures while some matches remain outstanding.
- Support a catch-up period before playoffs.
- Allow administrators to resolve overdue or abandoned fixtures.

### Playoffs

- The top four players qualify based on the final league standings.
- Semifinal 1: first place versus fourth place.
- Semifinal 2: second place versus third place.
- Semifinals use best-of-five frames.
- Final uses best-of-seven frames.
- Display a visual playoff bracket.
- Record the season champion.

## Score Submission and Approval

- A participant submits the result of a completed match.
- The opposing participant receives a notification.
- The opponent can approve or dispute the submitted result.
- Only an approved result updates the league standings.
- Administrators can resolve disputes and correct results.
- Maintain basic result history for accountability.
- Prevent duplicate submissions and self-approval.

## Email Notifications

The application should eventually support:

- Upcoming fixture notifications.
- Links to fixtures within the web application.
- Notifications when a score requires confirmation.
- Score approval and dispute notifications.
- Reminders for overdue fixtures.

Email links must not bypass authentication or authorization.

## Application Pages

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

## Pool Table Booking System

Virtuoso Pool League will include a booking system allowing colleagues to reserve the office pool table for both competitive league fixtures and casual games.

### Booking Requirements

- Allow authenticated users to book the pool table.
- Support two booking types:
  - **League Match** — optionally associated with an existing league fixture.
  - **Casual Game** — available to anyone with an account, including colleagues not participating in the league.
- Provide a calendar showing table availability.
- Support 15, 30, and 60-minute bookings, defaulting to 30 minutes.
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
- Booking availability should respect configurable office hours.
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
   - Remaining reservations for the current day.
   - Upcoming players or booking owners.
   - Start times and durations.
   - Clear indication when the table is available.

3. **League Standings**
   - Top-ranked players.
   - Matches played, wins and losses.
   - Frame difference where space allows.
   - Highlight the top four playoff qualification positions.
   - Do not display league points.

4. **Recent Results**
   - Recently completed and approved matches.
   - Player names and frame scores.

5. **Upcoming League Fixtures**
   - Highlight important upcoming matches.
   - Show scheduled bookings where applicable.

6. **QR Code**
   - Display a QR code linking directly to the pool table booking page.
   - Allow colleagues to quickly open the app on their phones.

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

- Implement postponements and player unavailability.
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
- **Annual leave scheduling:** New schedule generation moves due-date clashes to three days after recorded leave, checking subsequent leave intervals. Published fixtures are adjusted explicitly by an administrator or postponed by a participant; they are not silently penalized or moved when leave is recorded.
- **Schedule configuration:** Draft seasons allow a configurable rounds-per-week target, defaulting to two. Published schedule settings are locked; individual fixture dates remain adjustable.
- **Competition participants:** The competition participant model supports individual or team entries. The initial management UI is singles only; doubles management is deferred.

See README.md for the complete architecture, local startup, workflow guide, backend integration boundaries, and demo limitations.

See IMPLEMENTATION_STATUS.md for delivered and deferred scope.
