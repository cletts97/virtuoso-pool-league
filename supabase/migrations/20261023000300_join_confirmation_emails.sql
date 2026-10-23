BEGIN;
-- Enrollment confirmations share the existing durable email delivery queue.
ALTER TABLE public.result_email_outbox DROP CONSTRAINT result_email_outbox_purpose_check;
ALTER TABLE public.result_email_outbox ADD CONSTRAINT result_email_outbox_purpose_check
  CHECK (purpose IN ('review','reminder','newsletter','join_request','join_accepted'));
ALTER TABLE public.result_email_outbox DROP CONSTRAINT result_email_outbox_match_metadata;
ALTER TABLE public.result_email_outbox ADD CONSTRAINT result_email_outbox_match_metadata CHECK
  ((purpose IN ('newsletter','join_request','join_accepted') AND match_kind IS NULL AND match_id IS NULL) OR
   (purpose IN ('review','reminder') AND match_kind IS NOT NULL AND match_id IS NOT NULL));
COMMIT;
