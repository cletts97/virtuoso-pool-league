BEGIN;

-- Season-independent singles/doubles results; never included in league totals.
CREATE TABLE public.casual_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  home_partner_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  away_player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  away_partner_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  played_on date NOT NULL,
  best_of integer NOT NULL CHECK (best_of IN (1,3,5,7)),
  home_score integer NOT NULL CHECK (home_score >= 0),
  away_score integer NOT NULL CHECK (away_score >= 0),
  status text NOT NULL CHECK (status IN ('pending','confirmed','disputed','cancelled')),
  submitted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  history jsonb NOT NULL CHECK (jsonb_typeof(history) = 'array' AND jsonb_array_length(history) > 0),
  CHECK ((home_partner_id IS NULL) = (away_partner_id IS NULL)),
  CHECK (home_player_id <> away_player_id),
  CHECK (home_partner_id IS NULL OR (home_partner_id <> home_player_id AND home_partner_id <> away_player_id)),
  CHECK (away_partner_id IS NULL OR (away_partner_id <> home_player_id AND away_partner_id <> away_player_id AND away_partner_id <> home_partner_id)),
  CHECK (submitted_by IN (home_player_id, home_partner_id, away_player_id, away_partner_id)),
  CHECK ((home_score = (best_of+1)/2 AND away_score < (best_of+1)/2) OR
         (away_score = (best_of+1)/2 AND home_score < (best_of+1)/2))
);
CREATE INDEX casual_results_played_idx ON public.casual_results(played_on DESC);

-- Preserve the audit prefix and identity of a game when correcting/resubmitting.
CREATE FUNCTION vpl_private.guard_casual_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.home_player_id IS DISTINCT FROM OLD.home_player_id OR
     NEW.home_partner_id IS DISTINCT FROM OLD.home_partner_id OR
     NEW.away_player_id IS DISTINCT FROM OLD.away_player_id OR
     NEW.away_partner_id IS DISTINCT FROM OLD.away_partner_id OR
     NEW.submitted_by <> OLD.submitted_by OR OLD.status = 'cancelled' OR
     jsonb_array_length(NEW.history) <= jsonb_array_length(OLD.history) OR
     (SELECT jsonb_agg(value ORDER BY ordinality) FROM jsonb_array_elements(NEW.history) WITH ORDINALITY
       WHERE ordinality <= jsonb_array_length(OLD.history)) IS DISTINCT FROM OLD.history THEN
    RAISE EXCEPTION 'Casual game identity and previous result history are immutable.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER casual_history_guard BEFORE UPDATE ON public.casual_results
FOR EACH ROW EXECUTE FUNCTION vpl_private.guard_casual_history();
ALTER TABLE public.casual_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.casual_results FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.casual_results TO service_role;
REVOKE ALL ON FUNCTION vpl_private.guard_casual_history() FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.casual_results IS 'Server-authorized casual games, independent of seasons. History is append-only; corrections/voids replace no audit events. Client roles have no access.';

COMMIT;
