-- One convertible table: activity does not change the existing overlap exclusion.
-- Existing reservations are pool bookings. League fixtures remain pool-only.
BEGIN;
ALTER TABLE public.table_bookings
  ADD COLUMN sport text NOT NULL DEFAULT 'pool',
  ADD CONSTRAINT table_bookings_sport_check CHECK (sport IN ('pool', 'table_tennis')),
  ADD CONSTRAINT table_bookings_league_sport_check CHECK (kind <> 'league' OR sport = 'pool');
COMMENT ON COLUMN public.table_bookings.sport IS
  'Activity on the single shared table. Pool and table tennis reservations share collision protection.';
COMMIT;
