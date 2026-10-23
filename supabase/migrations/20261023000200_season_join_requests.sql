BEGIN;
CREATE TABLE public.season_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  UNIQUE(season_id,player_id),
  UNIQUE(id,season_id),
  CHECK ((status='pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR (status<>'pending' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);
ALTER TABLE public.season_join_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.season_join_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.season_join_requests TO service_role;
ALTER TABLE public.notifications ADD COLUMN join_request_id uuid,
  ADD CONSTRAINT notifications_join_request_fk FOREIGN KEY(join_request_id,season_id)
    REFERENCES public.season_join_requests(id,season_id) ON DELETE RESTRICT,
  ADD CONSTRAINT notifications_join_request_scope CHECK
    (join_request_id IS NULL OR (season_id IS NOT NULL AND fixture_id IS NULL AND casual_result_id IS NULL));
CREATE INDEX notifications_join_request_idx ON public.notifications(join_request_id)
  WHERE join_request_id IS NOT NULL;

ALTER TABLE public.result_email_outbox DROP CONSTRAINT result_email_outbox_purpose_check;
ALTER TABLE public.result_email_outbox ADD CONSTRAINT result_email_outbox_purpose_check
  CHECK (purpose IN ('review','reminder','newsletter','join_request'));
ALTER TABLE public.result_email_outbox DROP CONSTRAINT result_email_outbox_match_metadata;
ALTER TABLE public.result_email_outbox ADD CONSTRAINT result_email_outbox_match_metadata CHECK
  ((purpose IN ('newsletter','join_request') AND match_kind IS NULL AND match_id IS NULL) OR
   (purpose IN ('review','reminder') AND match_kind IS NOT NULL AND match_id IS NOT NULL));
COMMENT ON TABLE public.season_join_requests IS
  'Private season enrollment requests. API restricts reads to requester/admin and serializes administrator approval with fixture generation.';
COMMIT;
