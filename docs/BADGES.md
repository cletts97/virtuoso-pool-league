# Achievements

Six badges are included, with original SVG artwork in `public/badges/`:

| Badge             | Requirement                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Season champion   | Win the confirmed playoff final. Each season has its own award.                                                            |
| Runner-up         | Lose the confirmed playoff final.                                                                                          |
| League leader     | Finish the regular season as the official first playoff seed. Historical corrections preserve those locked seeds.          |
| Seven-ball finish | Legally win a frame with all seven opponent colours still on the table.                                                    |
| Break and dish    | Legally break and clear your colours and the black in that opening visit, without the opponent taking a shot.              |
| Reverse dish      | Following the opponent's legal dry break, clear all seven of your colours and the black in your first uninterrupted visit. |

Season awards are automatic and backfilled for existing seasons by the migration. An ended test season without a confirmed final does not invent a champion or runner-up. A corrected final updates the automatic awards while retaining prior award/revocation history. An administrator's explicit revocation remains effective across later synchronizations.

## Claiming and confirming

League and casual result forms have an optional achievement section. Select each achievement and the player who earned it. Achievements refer to a **frame**, so a player who lost the overall match can still earn one if they won a frame. In doubles the award is attributed to the selected player; it is not automatically copied to their teammate. A player must actually have completed the described clearance to claim it.

Each type can be claimed once per person per submitted match. Multiple occurrences of the same type across matches are grouped with a count on the profile. Seven-ball finish can overlap a dish; Break and dish and Reverse dish require different winning frames.

The opposing side explicitly confirms or declines each claim on the match page. League review dialogs also expose these controls. The earner and their teammate cannot approve their own achievement, even if they are administrators. A submitter who nominated their opponent can confirm that opponent's achievement in a separate action. Score confirmation is independent: declining an achievement does not dispute the score. Automatic score confirmation **never** approves a badge.

An explicitly confirmed claim becomes publicly earned only after the score is confirmed. Pending claims remain reviewable after score auto-confirmation. Disputing, correcting, voiding or superseding the score invalidates linked claims and retains their history. Casual resubmissions allow fresh claims. Administrators can grant a replacement after resolving a league correction. Approval links always require the existing authenticated account and server authorization.

## Administration

Open **Administration → Players → Badges** beside a player. Administrators can grant any of the six badges, select a published season for season awards, and optionally record a reason. Manual grants take effect immediately. Revocation requires a reason and an explicit Yes/No confirmation. The badge history records the action, account, time and reason. Season awards are displayed once per person/type/season even if a manual award and automatic award overlap. A season with badge history must be ended instead of deleted.

## Deployment

1. Apply `supabase/migrations/20261118000100_badge_awards.sql` in Supabase SQL Editor, or through your normal migration workflow.
2. Deploy the frontend and API together through the existing workflow.

The migration adds a server-only RLS-protected table and backfills official season awards. It does not change scores, standings, bookings, email settings or Cron jobs. Until it is applied, the API reports badges unavailable and hides/disables badge controls. No new secret or paid service is required.

## TV caching and privacy

Public and TV reads include **earned summaries only**; claims, reviewer identities, reasons and audit histories are excluded from public database queries. The database computes the existing small cache fingerprint over the public badge fields. Pending claims and private audit updates do not change that public badge fingerprint. Confirming an eligible award, revoking it or changing linked match eligibility invalidates the cache at the next normal poll. Unchanged TV polls reuse the cached public snapshot and do not download badge rows again.

TV standings display up to three distinct badge types beside each name, prioritizing season awards. The profile shows the full collection and season names. The six SVGs are static Azure-hosted files, shared across players and cached by the browser for a day. They are never stored in, or downloaded from, Supabase. Badge displays do not add polling or change the existing visible 30-second refresh and hidden-tab pause.
