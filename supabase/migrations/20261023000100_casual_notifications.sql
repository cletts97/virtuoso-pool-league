BEGIN;

-- Casual games do not belong to a season. Keep the existing fixture/season FK.
ALTER TABLE public.notifications
  ALTER COLUMN season_id DROP NOT NULL,
  ADD COLUMN casual_result_id uuid REFERENCES public.casual_results(id) ON DELETE RESTRICT,
  ADD CONSTRAINT notifications_scope_check CHECK (
    (casual_result_id IS NULL AND season_id IS NOT NULL) OR
    (casual_result_id IS NOT NULL AND season_id IS NULL AND fixture_id IS NULL)
  );
CREATE INDEX notifications_casual_result_idx ON public.notifications(casual_result_id)
  WHERE casual_result_id IS NOT NULL;
COMMENT ON TABLE public.notifications IS
  'Recipient-owned league notices and season-independent casual result notifications; server-only writes.';

-- Recover missed review requests for currently pending results, including doubles.
-- No emails are queued or sent by this migration.
INSERT INTO public.notifications(user_id,casual_result_id,kind,title,body,created_at)
SELECT p.id,r.id,'approval','Casual result needs your review',
  'A casual score is awaiting your confirmation. Open the result to confirm or dispute it.',
  coalesce((SELECT (event->>'at')::timestamptz
    FROM jsonb_array_elements(r.history) WITH ORDINALITY AS e(event,position)
    WHERE event->>'action'='submitted' ORDER BY position DESC LIMIT 1),now())
FROM public.casual_results r
JOIN public.profiles p ON p.id=ANY(
  CASE WHEN r.submitted_by IN (r.home_player_id,r.home_partner_id)
    THEN ARRAY[r.away_player_id,r.away_partner_id]
    ELSE ARRAY[r.home_player_id,r.home_partner_id] END)
WHERE r.status='pending' AND p.active AND p.auth_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.notifications n
    WHERE n.casual_result_id=r.id AND n.user_id=p.id AND n.kind='approval');

COMMIT;
