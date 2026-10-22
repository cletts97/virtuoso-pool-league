BEGIN;
CREATE TABLE public.result_email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  match_kind text NOT NULL CHECK (match_kind IN ('league','casual')),
  match_id uuid NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','skipped','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(event_id,recipient_id)
);
CREATE INDEX result_email_due_idx ON public.result_email_outbox(next_attempt_at) WHERE status IN ('pending','sending');
ALTER TABLE public.result_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.result_email_outbox FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.result_email_outbox TO service_role;
COMMENT ON TABLE public.result_email_outbox IS 'Server-only score-review emails. Unique per submission event/recipient; leased post-commit delivery with bounded retries. No client policies.';
COMMIT;
