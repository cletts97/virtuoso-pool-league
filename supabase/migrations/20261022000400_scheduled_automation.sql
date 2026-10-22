BEGIN;
-- Distinguish scheduled confirmations from an opponent or administrator decision.
ALTER TABLE public.fixtures DROP CONSTRAINT fixtures_confirmation_kind_check;
ALTER TABLE public.fixtures ADD CONSTRAINT fixtures_confirmation_kind_check
  CHECK (confirmation_kind IN ('opponent','admin_override','automatic'));
ALTER TABLE public.fixtures DROP CONSTRAINT fixtures_confirmation_metadata;
ALTER TABLE public.fixtures ADD CONSTRAINT fixtures_confirmation_metadata CHECK (
  (status='confirmed' AND confirmed_at IS NOT NULL AND confirmation_kind IS NOT NULL AND
    ((confirmation_kind='automatic' AND confirmed_by IS NULL AND length(btrim(override_reason))>0 AND override_reason IS NOT NULL)
     OR (confirmation_kind IN ('opponent','admin_override') AND confirmed_by IS NOT NULL))) OR
  (status<>'confirmed' AND confirmed_by IS NULL AND confirmed_at IS NULL AND confirmation_kind IS NULL AND override_reason IS NULL)
);
ALTER TABLE public.result_events ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.result_events DROP CONSTRAINT result_events_action_check;
ALTER TABLE public.result_events ADD CONSTRAINT result_events_action_check CHECK
  (action IN ('submitted','approved','auto_approved','disputed','corrected','postponed','rescheduled','cancelled'));
ALTER TABLE public.result_events ADD CONSTRAINT result_events_system_actor CHECK
  ((action='auto_approved' AND actor_id IS NULL AND reason IS NOT NULL AND length(btrim(reason))>0)
   OR (action<>'auto_approved' AND actor_id IS NOT NULL));

-- Reuse the durable queue; distinguish the initial review, one reminder per
-- submission, and a weekly newsletter. Its event UUID is the stable weekly key.
ALTER TABLE public.result_email_outbox
  ADD COLUMN purpose text NOT NULL DEFAULT 'review' CHECK (purpose IN ('review','reminder','newsletter')),
  ADD COLUMN html text,
  ADD COLUMN source_event_id uuid,
  ALTER COLUMN match_kind DROP NOT NULL,
  ALTER COLUMN match_id DROP NOT NULL,
  ADD CONSTRAINT result_email_outbox_match_metadata CHECK
    ((purpose='newsletter' AND match_kind IS NULL AND match_id IS NULL) OR
     (purpose<>'newsletter' AND match_kind IS NOT NULL AND match_id IS NOT NULL));
COMMENT ON TABLE public.result_email_outbox IS
  'Server-only review/dispute, 24-hour reminder and weekly newsletter email queue. Leased delivery with bounded retry and per-purpose/event/recipient deduplication.';
COMMIT;
