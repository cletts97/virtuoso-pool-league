-- DRAFT pgTAP regression tests. Run ONLY in a disposable local Supabase database.
-- All test records are rolled back. This file has not been executed by its author.
-- These test structural guarantees; they do not test API authorization or Auth email flows.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

SELECT is(count(*)::integer, 14, 'All 14 application tables exist with RLS enabled')
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
AND c.relname = ANY (ARRAY['profiles','participants','participant_members','seasons',
  'season_participants','season_qualifiers','fixtures','result_events','availability',
  'booking_settings','table_bookings','booking_guests','notifications','announcements']);
SELECT ok(NOT has_table_privilege('anon', 'public.' || t,
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), 'anon cannot access ' || t)
FROM unnest(ARRAY['profiles','participants','participant_members','seasons',
  'season_participants','season_qualifiers','fixtures','result_events','availability',
  'booking_settings','table_bookings','booking_guests','notifications','announcements']) AS names(t);
SELECT ok(NOT has_table_privilege('authenticated', 'public.' || t,
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'), 'authenticated cannot access ' || t)
FROM unnest(ARRAY['profiles','participants','participant_members','seasons',
  'season_participants','season_qualifiers','fixtures','result_events','availability',
  'booking_settings','table_bookings','booking_guests','notifications','announcements']) AS names(t);
SELECT ok(NOT has_table_privilege('anon', 'public.regular_season_totals', 'SELECT'),
  'Anonymous clients cannot read the totals view');
SELECT ok(NOT has_table_privilege('authenticated', 'public.regular_season_totals', 'SELECT'),
  'Authenticated clients cannot bypass the API through the totals view');
SELECT ok(NOT has_table_privilege('service_role', 'public.result_events', 'UPDATE,DELETE,TRUNCATE'),
  'Server API role cannot rewrite or truncate audit history');

-- Historical/unlinked profiles keep test accounts out of the managed Auth schema.
INSERT INTO public.profiles(id, name, active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Test A', false),
  ('00000000-0000-0000-0000-000000000002', 'Test B', false),
  ('00000000-0000-0000-0000-000000000003', 'Test C', false);
SELECT is((SELECT role FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'),
  'colleague', 'Profiles do not default to administrator');
SELECT throws_ok($$INSERT INTO public.profiles(name, active) VALUES ('No identity', true)$$,
  '23514', NULL, 'An active profile must link to an Auth identity');

INSERT INTO public.participants(id, name, kind) VALUES
  ('00000000-0000-0000-0000-000000001001', 'Test A', 'individual'),
  ('00000000-0000-0000-0000-000000001002', 'Test B', 'individual'),
  ('00000000-0000-0000-0000-000000001003', 'Test C', 'individual'),
  ('00000000-0000-0000-0000-000000001004', 'Outside season', 'individual');
INSERT INTO public.participant_members(participant_id, profile_id, member_order) VALUES
  ('00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000000001', 1),
  ('00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000000002', 1),
  ('00000000-0000-0000-0000-000000001003', '00000000-0000-0000-0000-000000000003', 1);
INSERT INTO public.seasons(id, name, start_date, status) VALUES
  ('00000000-0000-0000-0000-000000002001', 'Test season', '2030-01-01', 'regular');
INSERT INTO public.season_participants(season_id, participant_id, entry_order) VALUES
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000001001', 0),
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000001002', 1),
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000001003', 2);

INSERT INTO public.fixtures(id, season_id, round, home_id, away_id, due_date, stage, best_of,
  status, home_score, away_score, submitted_by) VALUES
  ('00000000-0000-0000-0000-000000003001', '00000000-0000-0000-0000-000000002001', 1,
   '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001002',
   '2030-01-07', 'regular', 3, 'pending', 2, 1, '00000000-0000-0000-0000-000000000001');
SELECT is((SELECT sum(played)::integer FROM public.regular_season_totals
  WHERE season_id = '00000000-0000-0000-0000-000000002001'), 0, 'Pending results do not count');
SELECT is((SELECT count(*)::integer FROM public.regular_season_totals
  WHERE season_id = '00000000-0000-0000-0000-000000002001'), 3, 'Zero-game entrants appear');

UPDATE public.fixtures SET status = 'confirmed', confirmed_by = '00000000-0000-0000-0000-000000000002',
  confirmed_at = now(), confirmation_kind = 'opponent'
WHERE id = '00000000-0000-0000-0000-000000003001';
SELECT is((SELECT won FROM public.regular_season_totals
  WHERE season_id = '00000000-0000-0000-0000-000000002001'
  AND participant_id = '00000000-0000-0000-0000-000000001001'), 1, 'Winner gains one win');
SELECT is((SELECT difference FROM public.regular_season_totals
  WHERE season_id = '00000000-0000-0000-0000-000000002001'
  AND participant_id = '00000000-0000-0000-0000-000000001001'), 1, '2-1 produces frame difference +1');
SELECT is((SELECT lost FROM public.regular_season_totals
  WHERE season_id = '00000000-0000-0000-0000-000000002001'
  AND participant_id = '00000000-0000-0000-0000-000000001002'), 1, 'Opponent gains one loss');
SELECT is((SELECT revision FROM public.fixtures WHERE id = '00000000-0000-0000-0000-000000003001'),
  1::bigint, 'Fixture update increments revision');
SELECT throws_ok($$UPDATE public.fixtures SET home_score = 2, away_score = 2
  WHERE id = '00000000-0000-0000-0000-000000003001'$$,
  '23514', NULL, 'Best-of-three cannot finish 2-2');
SELECT throws_ok($$UPDATE public.fixtures SET confirmed_by = submitted_by
  WHERE id = '00000000-0000-0000-0000-000000003001'$$,
  '23514', NULL, 'Normal self-approval is rejected');
SELECT throws_ok($$UPDATE public.fixtures SET confirmation_kind = 'admin_override', override_reason = NULL
  WHERE id = '00000000-0000-0000-0000-000000003001'$$,
  '23514', NULL, 'Admin override requires a reason (API must also verify admin role)');
SELECT throws_ok($$INSERT INTO public.fixtures(season_id, round, home_id, away_id, due_date, stage, best_of)
  VALUES ('00000000-0000-0000-0000-000000002001', 2,
  '00000000-0000-0000-0000-000000001002', '00000000-0000-0000-0000-000000001001',
  '2030-01-08', 'regular', 3)$$, '23505', NULL, 'Reversed duplicate regular pairing is rejected');
SELECT throws_ok($$INSERT INTO public.fixtures(season_id, round, home_id, away_id, due_date, stage, best_of)
  VALUES ('00000000-0000-0000-0000-000000002001', 2,
  '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001004',
  '2030-01-08', 'regular', 3)$$, '23503', NULL, 'Fixture participants must belong to its season');
SELECT throws_ok($$INSERT INTO public.season_qualifiers(season_id, seed, participant_id)
  VALUES ('00000000-0000-0000-0000-000000002001', 1, '00000000-0000-0000-0000-000000001004')$$,
  '23503', NULL, 'Qualifiers must belong to the season');

INSERT INTO public.fixtures(id, season_id, round, home_id, away_id, due_date, stage, bracket_slot, best_of,
  status, home_score, away_score, submitted_by, confirmed_by, confirmed_at, confirmation_kind) VALUES
  ('00000000-0000-0000-0000-000000003002', '00000000-0000-0000-0000-000000002001', 4,
   '00000000-0000-0000-0000-000000001001', '00000000-0000-0000-0000-000000001002',
   '2030-01-14', 'semifinal', 1, 5, 'confirmed', 3, 1,
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', now(), 'opponent');
SELECT is((SELECT played FROM public.regular_season_totals
  WHERE season_id = '00000000-0000-0000-0000-000000002001'
  AND participant_id = '00000000-0000-0000-0000-000000001001'), 1, 'Playoffs do not change regular-season standings');

INSERT INTO public.result_events(id, fixture_id, fixture_revision, action, actor_id, home_score, away_score)
VALUES ('00000000-0000-0000-0000-000000004001', '00000000-0000-0000-0000-000000003001', 1,
  'approved', '00000000-0000-0000-0000-000000000002', 2, 1);
SELECT throws_ok($$UPDATE public.result_events SET reason = 'rewrite'
  WHERE id = '00000000-0000-0000-0000-000000004001'$$,
  '55000', NULL, 'Past result events cannot be rewritten');
SELECT throws_ok($$DELETE FROM public.result_events
  WHERE id = '00000000-0000-0000-0000-000000004001'$$,
  '55000', NULL, 'Past result events cannot be deleted');

INSERT INTO public.table_bookings(id, owner_id, kind, start_at, end_at, duration) VALUES
  ('00000000-0000-0000-0000-000000005001', '00000000-0000-0000-0000-000000000001',
   'casual', '2030-01-07 12:00+00', '2030-01-07 12:30+00', 30);
SELECT lives_ok($$INSERT INTO public.table_bookings(owner_id, kind, start_at, end_at, duration)
  VALUES ('00000000-0000-0000-0000-000000000002', 'casual',
  '2030-01-07 12:30+00', '2030-01-07 13:00+00', 30)$$, 'Back-to-back bookings are allowed');
SELECT throws_ok($$INSERT INTO public.table_bookings(owner_id, kind, start_at, end_at, duration)
  VALUES ('00000000-0000-0000-0000-000000000002', 'casual',
  '2030-01-07 12:15+00', '2030-01-07 12:45+00', 30)$$,
  '23P01', NULL, 'Overlapping reservations are rejected by PostgreSQL');
SELECT lives_ok($$INSERT INTO public.table_bookings(owner_id, kind, start_at, end_at, duration, status)
  VALUES ('00000000-0000-0000-0000-000000000002', 'casual',
  '2030-01-07 12:15+00', '2030-01-07 12:45+00', 30, 'cancelled')$$,
  'Cancelled reservations do not block time');
SELECT throws_ok($$INSERT INTO public.table_bookings(owner_id, kind, start_at, end_at, duration)
  VALUES ('00000000-0000-0000-0000-000000000002', 'casual',
  '2030-01-07 14:00+00', '2030-01-07 14:45+00', 45)$$,
  '23514', NULL, 'Unsupported booking duration is rejected');
SELECT throws_ok($$INSERT INTO public.table_bookings(owner_id, kind, start_at, end_at, duration)
  VALUES ('00000000-0000-0000-0000-000000000002', 'casual',
  '2030-01-07 14:00+00', '2030-01-07 15:00+00', 30)$$,
  '23514', NULL, 'Booking end must agree with its duration');
SELECT throws_ok($$INSERT INTO public.table_bookings(owner_id, kind, start_at, end_at, duration)
  VALUES ('00000000-0000-0000-0000-000000000002', 'casual',
  '2030-01-07 14:01+00', '2030-01-07 14:31+00', 30)$$,
  '23514', NULL, 'Booking start must be on a quarter hour');
SELECT throws_ok($$INSERT INTO public.table_bookings(owner_id, kind, fixture_id, start_at, end_at, duration)
  VALUES ('00000000-0000-0000-0000-000000000002', 'casual',
  '00000000-0000-0000-0000-000000003001', '2030-01-07 15:00+00', '2030-01-07 15:30+00', 30)$$,
  '23514', NULL, 'Casual bookings cannot link to league fixtures');

SELECT is(count(*)::integer, 0, 'No league points column exists')
FROM information_schema.columns WHERE table_schema = 'public'
AND table_name IN ('profiles','participants','seasons','fixtures','regular_season_totals')
AND column_name ILIKE '%points%';
SELECT * FROM finish();
ROLLBACK;
