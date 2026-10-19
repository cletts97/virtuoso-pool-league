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
- Authentication: To be decided during initial architecture planning

Keep operating costs as close to zero as reasonably possible.

## League Structure

### Players
- Initially support approximately 10–14 players.
- Support adding, editing, and deactivating players.
- Track individual player statistics.
- Support multiple seasons and historical results.

### Regular Season
- Singles round-robin league.
- Each player plays every other player once.
- Automatically generate the fixture list.
- Publish fixtures in advance.
- Target approximately two rounds per week.
- Players arrange their matches themselves without assigned times.
- Allow matches to be played ahead of schedule.
- Regular-season matches use best-of-three frames.
- Award three league points for a match win.
- Track wins, losses, frames won, frames lost, and frame difference.
- Use league points and frame difference to determine standings, with further tiebreakers defined before implementation.

### Annual Leave and Postponements
- Allow administrators to record player unavailability.
- Allow matches to be postponed.
- Do not automatically penalize players for approved annual leave.
- Allow postponed matches to be completed after players return.
- Continue other league fixtures while some matches remain outstanding.
- Support a catch-up period before playoffs.
- Allow administrators to resolve overdue or abandoned fixtures.

### Playoffs
- The top four players qualify.
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
2. League Table — rankings, league points, frame difference, and statistics.
3. Fixtures — upcoming, completed, and postponed matches.
4. Match Details — match information, score entry, and approval.
5. Players — player profiles and statistics.
6. Playoffs — semifinal and final bracket.
7. Administration — player management, season management, fixtures, and disputes.

## Future Features

- Doubles competitions.
- Multiple competition formats.
- Additional awards and achievements.
- Head-to-head records.
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
- Implement standings calculations.

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

## Guiding Principles

Build a reliable, maintainable application rather than merely a prototype.

Prioritize correctness of league rules, intuitive workflows, security, and visual quality.

Avoid unnecessary complexity and paid infrastructure until it is justified.

Implementation details may evolve, but material changes to league rules or architecture must be discussed and documented.
