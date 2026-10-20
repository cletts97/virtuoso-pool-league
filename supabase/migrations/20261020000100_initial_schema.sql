-- Virtuoso Pool League: initial application schema.
-- Target: a fresh Supabase project, PostgreSQL 15 or newer.
-- Architecture: Supabase Auth + Azure Functions + server-only application data.
-- Review and test locally before applying. This does NOT configure Auth settings,
-- send invitations, implement API authorization, or import browser demo data.
-- No application passwords, league points, or stored rankings are created.

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Run this migration in a Supabase database with auth.users.';
  END IF;
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'PostgreSQL 15+ is required for security-invoker views.';
  END IF;
END;
$$;

CREATE SCHEMA vpl_private;
REVOKE ALL ON SCHEMA vpl_private FROM PUBLIC, anon, authenticated;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  department text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'colleague'
    CHECK (role IN ('player', 'admin', 'colleague')),
  active boolean NOT NULL DEFAULT true,
  color integer NOT NULL DEFAULT 0 CHECK (color >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_active_requires_identity CHECK (NOT active OR auth_user_id IS NOT NULL)
);
COMMENT ON TABLE public.profiles IS
  'Maps to frontend Player, including non-league colleagues. No emails or passwords. Role is server-managed.';

CREATE TABLE public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  kind text NOT NULL CHECK (kind IN ('individual', 'team')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.participant_members (
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  member_order smallint NOT NULL CHECK (member_order IN (1, 2)),
  PRIMARY KEY (participant_id, profile_id),
  UNIQUE (participant_id, member_order)
);
CREATE INDEX participant_members_profile_idx ON public.participant_members(profile_id);
COMMENT ON TABLE public.participant_members IS
  'Ordered Participant.playerIds. API must require one member for singles and two for doubles at publication, and freeze published memberships.';

CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  start_date date NOT NULL CHECK (isfinite(start_date)),
  format text NOT NULL DEFAULT 'singles' CHECK (format IN ('singles', 'doubles')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'regular', 'playoffs', 'complete')),
  rounds_per_week integer NOT NULL DEFAULT 2 CHECK (rounds_per_week > 0),
  champion_id uuid,
  finalized_reason text,
  finalized_at timestamptz,
  finalized_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.season_participants (
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE RESTRICT,
  entry_order integer NOT NULL CHECK (entry_order >= 0),
  PRIMARY KEY (season_id, participant_id),
  UNIQUE (season_id, entry_order)
);
CREATE INDEX season_participants_participant_idx ON public.season_participants(participant_id);
ALTER TABLE public.seasons ADD CONSTRAINT seasons_champion_membership_fk
  FOREIGN KEY (id, champion_id) REFERENCES public.season_participants(season_id, participant_id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.season_qualifiers (
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  seed smallint NOT NULL CHECK (seed BETWEEN 1 AND 4),
  participant_id uuid NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, seed),
  UNIQUE (season_id, participant_id),
  FOREIGN KEY (season_id, participant_id)
    REFERENCES public.season_participants(season_id, participant_id) ON DELETE RESTRICT
);
COMMENT ON TABLE public.season_qualifiers IS
  'Snapshot of finalized playoff seeds. Do not recompute after historical corrections. Unresolved qualification ties must block automatic finalization.';

CREATE TABLE public.fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  round integer NOT NULL CHECK (round > 0),
  home_id uuid NOT NULL,
  away_id uuid NOT NULL,
  due_date date NOT NULL CHECK (isfinite(due_date)),
  stage text NOT NULL CHECK (stage IN ('regular', 'semifinal', 'final')),
  bracket_slot smallint,
  best_of smallint NOT NULL CHECK (best_of IN (3, 5, 7)),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'pending', 'confirmed', 'disputed', 'postponed', 'cancelled')),
  home_score smallint,
  away_score smallint,
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  confirmed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  confirmed_at timestamptz,
  confirmation_kind text CHECK (confirmation_kind IN ('opponent', 'admin_override')),
  override_reason text,
  note text,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, season_id),
  FOREIGN KEY (season_id, home_id)
    REFERENCES public.season_participants(season_id, participant_id) ON DELETE RESTRICT,
  FOREIGN KEY (season_id, away_id)
    REFERENCES public.season_participants(season_id, participant_id) ON DELETE RESTRICT,
  CONSTRAINT fixtures_distinct_opponents CHECK (home_id <> away_id),
  CONSTRAINT fixtures_stage_format CHECK (
    (stage = 'regular' AND best_of = 3 AND bracket_slot IS NULL) OR
    (stage = 'semifinal' AND best_of = 5 AND bracket_slot IS NOT NULL AND bracket_slot IN (1, 2)) OR
    (stage = 'final' AND best_of = 7 AND bracket_slot IS NOT NULL AND bracket_slot = 1)
  ),
  CONSTRAINT fixtures_score_pair CHECK ((home_score IS NULL) = (away_score IS NULL)),
  CONSTRAINT fixtures_valid_score CHECK (
    home_score IS NULL OR
    (home_score = (best_of + 1) / 2 AND away_score BETWEEN 0 AND (best_of - 1) / 2) OR
    (away_score = (best_of + 1) / 2 AND home_score BETWEEN 0 AND (best_of - 1) / 2)
  ),
  CONSTRAINT fixtures_submitted_result CHECK (
    status NOT IN ('pending', 'disputed', 'confirmed') OR
    (home_score IS NOT NULL AND submitted_by IS NOT NULL)
  ),
  CONSTRAINT fixtures_confirmation_metadata CHECK (
    (status = 'confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL
      AND confirmation_kind IS NOT NULL) OR
    (status <> 'confirmed' AND confirmed_by IS NULL AND confirmed_at IS NULL
      AND confirmation_kind IS NULL AND override_reason IS NULL)
  ),
  CONSTRAINT fixtures_no_normal_self_approval CHECK (
    confirmation_kind IS DISTINCT FROM 'opponent' OR confirmed_by <> submitted_by
  ),
  CONSTRAINT fixtures_override_has_reason CHECK (
    confirmation_kind IS DISTINCT FROM 'admin_override' OR
    (override_reason IS NOT NULL AND length(btrim(override_reason)) > 0)
  )
);
CREATE UNIQUE INDEX fixtures_regular_pair_unique
  ON public.fixtures(season_id, least(home_id, away_id), greatest(home_id, away_id))
  WHERE stage = 'regular';
CREATE UNIQUE INDEX fixtures_playoff_slot_unique
  ON public.fixtures(season_id, stage, bracket_slot) WHERE stage <> 'regular';
CREATE INDEX fixtures_schedule_idx ON public.fixtures(season_id, stage, round, due_date);
CREATE INDEX fixtures_home_idx ON public.fixtures(home_id);
CREATE INDEX fixtures_away_idx ON public.fixtures(away_id);
CREATE INDEX fixtures_status_idx ON public.fixtures(status);
COMMENT ON TABLE public.fixtures IS
  'Current match snapshot. API authorizes actors, checks transitions/expected revision, and appends result_events in the SAME transaction. Database structural checks do not replace API authorization.';

CREATE TABLE public.result_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL REFERENCES public.fixtures(id) ON DELETE RESTRICT,
  fixture_revision bigint NOT NULL CHECK (fixture_revision >= 0),
  action text NOT NULL CHECK (action IN (
    'submitted', 'approved', 'disputed', 'corrected', 'postponed', 'rescheduled', 'cancelled'
  )),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  home_score smallint,
  away_score smallint,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  UNIQUE (fixture_id, fixture_revision),
  CHECK ((home_score IS NULL) = (away_score IS NULL)),
  CHECK (home_score IS NULL OR (home_score >= 0 AND away_score >= 0))
);
CREATE INDEX result_events_actor_idx ON public.result_events(actor_id);
COMMENT ON TABLE public.result_events IS
  'Append-only Fixture.history / ResultRevision. Corrections append records; they do not edit past events.';

CREATE TABLE public.availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  from_date date NOT NULL CHECK (isfinite(from_date)),
  to_date date NOT NULL CHECK (isfinite(to_date)),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date)
);
CREATE INDEX availability_profile_dates_idx ON public.availability(profile_id, from_date, to_date);
COMMENT ON COLUMN public.availability.reason IS 'Private operational data; never include in the public TV API.';

CREATE TABLE public.booking_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  time_zone text NOT NULL DEFAULT 'Europe/London' CHECK (time_zone = 'Europe/London'),
  opens_at time NOT NULL DEFAULT '08:00',
  closes_at time NOT NULL DEFAULT '18:00',
  weekdays smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at),
  CHECK (mod(extract(epoch FROM opens_at), 900) = 0),
  CHECK (mod(extract(epoch FROM closes_at), 900) = 0),
  CHECK (cardinality(weekdays) BETWEEN 1 AND 7 AND array_ndims(weekdays) = 1
    AND weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[] AND array_position(weekdays, NULL) IS NULL)
);
INSERT INTO public.booking_settings(singleton) VALUES (true);
COMMENT ON TABLE public.booking_settings IS
  'Matches BookingConfig: Sunday=0, Monday=1. API also rejects repeated weekdays. Single office pool table.';

CREATE TABLE public.table_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('league', 'casual')),
  fixture_id uuid REFERENCES public.fixtures(id) ON DELETE RESTRICT,
  start_at timestamptz NOT NULL CHECK (isfinite(start_at)),
  end_at timestamptz NOT NULL CHECK (isfinite(end_at)),
  duration smallint NOT NULL CHECK (duration IN (15, 30, 60)),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'cancelled')),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'league' OR fixture_id IS NULL),
  CHECK (end_at > start_at),
  CHECK (end_at - start_at = duration * interval '1 minute'),
  CHECK (mod(extract(epoch FROM start_at), 900) = 0),
  CONSTRAINT table_bookings_no_overlap EXCLUDE USING gist (
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status = 'reserved')
);
CREATE INDEX table_bookings_start_idx ON public.table_bookings(start_at) WHERE status = 'reserved';
CREATE INDEX table_bookings_owner_idx ON public.table_bookings(owner_id);
CREATE INDEX table_bookings_fixture_idx ON public.table_bookings(fixture_id) WHERE fixture_id IS NOT NULL;
COMMENT ON CONSTRAINT table_bookings_no_overlap ON public.table_bookings IS
  'Database-level protection for ONE table, including concurrent writes. Back-to-back bookings are allowed; cancelled reservations do not block time.';
COMMENT ON TABLE public.table_bookings IS
  'API also enforces active owner, seven-day horizon, office hours, linked fixture eligibility and one upcoming reservation per fixture. Clock-dependent rules do NOT belong in CHECK constraints.';

CREATE TABLE public.booking_guests (
  booking_id uuid NOT NULL REFERENCES public.table_bookings(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  guest_order integer NOT NULL CHECK (guest_order >= 0),
  PRIMARY KEY (booking_id, profile_id),
  UNIQUE (booking_id, guest_order)
);
CREATE INDEX booking_guests_profile_idx ON public.booking_guests(profile_id);
COMMENT ON TABLE public.booking_guests IS
  'Booking.guestIds. API must reject an inactive guest or owner listed as their own guest.';

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('upcoming', 'approval', 'approved', 'disputed', 'postponement', 'notice')),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  body text NOT NULL DEFAULT '',
  fixture_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  FOREIGN KEY (fixture_id, season_id) REFERENCES public.fixtures(id, season_id) ON DELETE RESTRICT
);
CREATE INDEX notifications_user_time_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX notifications_fixture_idx ON public.notifications(fixture_id) WHERE fixture_id IS NOT NULL;
COMMENT ON TABLE public.notifications IS
  'Existing season-scoped LeagueNotification model. API returns only recipient-owned notifications. Booking-only notifications need a future explicit model change.';

CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX announcements_season_time_idx ON public.announcements(season_id, created_at DESC);

-- Timestamp helpers. These are private triggers, not public RPC endpoints.
CREATE FUNCTION vpl_private.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE FUNCTION vpl_private.touch_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;
CREATE FUNCTION vpl_private.profile_identity_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.auth_user_id IS NULL THEN
    NEW.active := false;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_identity_change BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION vpl_private.profile_identity_change();
CREATE TRIGGER fixtures_touch BEFORE UPDATE ON public.fixtures
  FOR EACH ROW EXECUTE FUNCTION vpl_private.touch_revision();
CREATE TRIGGER bookings_touch BEFORE UPDATE ON public.table_bookings
  FOR EACH ROW EXECUTE FUNCTION vpl_private.touch_revision();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['participants','seasons','availability','booking_settings'] LOOP
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION vpl_private.touch_updated_at()', t);
  END LOOP;
END;
$$;

CREATE FUNCTION vpl_private.prevent_result_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Result events are append-only. Record a correction instead.' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER result_events_append_only BEFORE UPDATE OR DELETE ON public.result_events
  FOR EACH ROW EXECUTE FUNCTION vpl_private.prevent_result_event_mutation();

-- Supabase Auth owns account creation/passwords. User metadata supplies ONLY a
-- display name: it never supplies role, active status, or permissions.
CREATE FUNCTION vpl_private.handle_auth_user_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles(id, auth_user_id, name, role, active)
  VALUES (
    NEW.id, NEW.id,
    left(coalesce(nullif(btrim(NEW.raw_user_meta_data ->> 'name'), ''), 'Invited colleague'), 120),
    'colleague', true
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER vpl_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION vpl_private.handle_auth_user_created();

-- Backfill any accounts created through Supabase Auth before this migration.
-- Review these in the Auth dashboard before rollout; no one becomes admin here.
INSERT INTO public.profiles(id, auth_user_id, name, role, active)
SELECT id, id,
  left(coalesce(nullif(btrim(raw_user_meta_data ->> 'name'), ''), 'Invited colleague'), 120),
  'colleague', true
FROM auth.users;

-- Derived totals only: no Points, ranking fallback, or head-to-head logic here.
-- The existing canonical rules module should perform ranking on the backend.
CREATE VIEW public.regular_season_totals WITH (security_invoker = true) AS
WITH outcomes AS (
  SELECT season_id, home_id AS participant_id,
    home_score AS frames_for, away_score AS frames_against
  FROM public.fixtures WHERE status = 'confirmed' AND stage = 'regular'
  UNION ALL
  SELECT season_id, away_id AS participant_id,
    away_score AS frames_for, home_score AS frames_against
  FROM public.fixtures WHERE status = 'confirmed' AND stage = 'regular'
), totals AS (
  SELECT season_id, participant_id, count(*)::integer AS played,
    count(*) FILTER (WHERE frames_for > frames_against)::integer AS won,
    count(*) FILTER (WHERE frames_for < frames_against)::integer AS lost,
    sum(frames_for)::integer AS frames_won, sum(frames_against)::integer AS frames_lost
  FROM outcomes GROUP BY season_id, participant_id
)
SELECT sp.season_id, sp.participant_id,
  coalesce(t.played, 0) AS played, coalesce(t.won, 0) AS won, coalesce(t.lost, 0) AS lost,
  coalesce(t.frames_won, 0) AS frames_won, coalesce(t.frames_lost, 0) AS frames_lost,
  coalesce(t.frames_won, 0) - coalesce(t.frames_lost, 0) AS difference,
  CASE WHEN coalesce(t.played, 0) = 0 THEN 0::numeric
    ELSE 100.0 * t.won / t.played END AS win_percentage
FROM public.season_participants sp
LEFT JOIN totals t USING (season_id, participant_id);
COMMENT ON VIEW public.regular_season_totals IS
  'Approved regular-season results only, including zero-game entrants. Win percentage is 0..100. Playoffs never alter the league table. No ranking or form is stored.';

-- Access model: ALL application data goes through authenticated Azure Functions.
-- Enable RLS, revoke inherited/client grants, and intentionally define NO client
-- policies. This also blocks logged-in app admins from direct table writes.
-- service_role bypasses RLS: every API operation MUST authorize the verified actor.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','participants','participant_members','seasons','season_participants',
    'season_qualifiers','fixtures','result_events','availability','booking_settings',
    'table_bookings','booking_guests','notifications','announcements'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM service_role', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
  END LOOP;
END;
$$;
REVOKE UPDATE, DELETE ON public.result_events FROM service_role;
REVOKE ALL ON public.regular_season_totals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.regular_season_totals TO service_role;
REVOKE ALL ON FUNCTION vpl_private.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vpl_private.touch_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vpl_private.profile_identity_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vpl_private.prevent_result_event_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION vpl_private.handle_auth_user_created() FROM PUBLIC, anon, authenticated;

COMMIT;
