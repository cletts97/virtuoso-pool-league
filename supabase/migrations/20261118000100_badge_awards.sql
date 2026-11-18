BEGIN;
CREATE TABLE public.badge_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  badge_key text NOT NULL CHECK (badge_key IN ('season_champion','runner_up','league_leader','seven_ball','break_dish','reverse_dish')),
  source text NOT NULL CHECK (source IN ('automatic','manual','claim')),
  status text NOT NULL CHECK (status IN ('pending','confirmed','rejected','revoked')),
  season_id uuid REFERENCES public.seasons(id) ON DELETE RESTRICT,
  fixture_id uuid REFERENCES public.fixtures(id) ON DELETE RESTRICT,
  casual_result_id uuid REFERENCES public.casual_results(id) ON DELETE RESTRICT,
  submission_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  history jsonb NOT NULL CHECK (jsonb_typeof(history)='array' AND jsonb_array_length(history)>0),
  CHECK (fixture_id IS NULL OR casual_result_id IS NULL),
  CHECK ((source='claim' AND badge_key IN ('seven_ball','break_dish','reverse_dish') AND submission_id IS NOT NULL AND num_nonnulls(fixture_id,casual_result_id)=1)
    OR (source<>'claim' AND submission_id IS NULL AND fixture_id IS NULL AND casual_result_id IS NULL)),
  CHECK (badge_key NOT IN ('season_champion','runner_up','league_leader') OR season_id IS NOT NULL),
  CHECK (source<>'automatic' OR badge_key IN ('season_champion','runner_up','league_leader'))
);
CREATE UNIQUE INDEX badge_awards_automatic_key ON public.badge_awards(player_id,badge_key,season_id) WHERE source='automatic';
CREATE UNIQUE INDEX badge_awards_claim_key ON public.badge_awards(player_id,badge_key,submission_id) WHERE source='claim';
CREATE INDEX badge_awards_player_idx ON public.badge_awards(player_id);
ALTER TABLE public.badge_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.badge_awards FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.badge_awards TO service_role;
COMMENT ON TABLE public.badge_awards IS 'Server-authorized achievements. Claims require explicit opposing-player approval; score timeouts never approve badges. Preserve grant/review/revocation history.';

-- Backfill existing official season awards. No historical match achievements
-- are inferred from scores: those require an explicit claim or admin grant.
WITH targets AS (
  SELECT q.season_id,q.participant_id,'league_leader'::text AS badge_key
    FROM public.season_qualifiers q JOIN public.seasons s ON s.id=q.season_id
    WHERE q.seed=1 AND s.status<>'draft'
  UNION ALL
  SELECT s.id,s.champion_id,'season_champion' FROM public.seasons s
    JOIN public.fixtures f ON f.season_id=s.id AND f.stage='final' AND f.status='confirmed'
    WHERE s.status='complete' AND s.champion_id IS NOT NULL
  UNION ALL
  SELECT s.id,CASE WHEN f.home_id=s.champion_id THEN f.away_id ELSE f.home_id END,'runner_up'
    FROM public.seasons s JOIN public.fixtures f ON f.season_id=s.id AND f.stage='final' AND f.status='confirmed'
    WHERE s.status='complete' AND s.champion_id IS NOT NULL
)
INSERT INTO public.badge_awards(player_id,badge_key,source,status,season_id,history)
SELECT m.profile_id,t.badge_key,'automatic','confirmed',t.season_id,
  jsonb_build_array(jsonb_build_object('action','granted','actorId',NULL,'at',now(),'reason','Automatic season award backfill.'))
FROM targets t JOIN public.participant_members m ON m.participant_id=t.participant_id
ON CONFLICT DO NOTHING;
COMMIT;
