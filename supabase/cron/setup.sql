-- OPERATOR STEP ONLY: run after migration 20261022000400, API deployment and
-- Azure configuration. This registers live jobs. Never include real secrets here.
-- In Supabase Vault, create vpl_app_url and vpl_automation_key first.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION vpl_private.invoke_automation(task text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE base_url text; secret text; request_id bigint;
BEGIN
  IF task IS NULL OR task NOT IN ('results','weekly') THEN
    RAISE EXCEPTION 'Unknown automation task';
  END IF;
  SELECT rtrim(decrypted_secret,'/') INTO base_url FROM vault.decrypted_secrets WHERE name='vpl_app_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='vpl_automation_key';
  IF base_url IS NULL OR base_url !~ '^https://[^/?#]+$' OR secret IS NULL OR length(secret)<32 THEN
    RAISE EXCEPTION 'Configure the app origin and automation key in Vault';
  END IF;
  SELECT net.http_post(
    url := base_url || '/api/automation/' || task,
    headers := jsonb_build_object('Content-Type','application/json','X-VPL-Automation-Key',secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 45000
  ) INTO request_id;
  RETURN request_id;
END;
$$;
REVOKE ALL ON FUNCTION vpl_private.invoke_automation(text) FROM PUBLIC, anon, authenticated, service_role;

-- Cron runs in GMT/UTC. The API accepts weekly work only at 07:xx Europe/London:
-- 06:00 UTC during BST, 07:00 UTC during GMT. The other call is a harmless no-op.
SELECT cron.schedule('vpl-weekly-newsletter', '0 6,7 * * 1',
  $job$SELECT vpl_private.invoke_automation('weekly');$job$);
SELECT cron.schedule('vpl-hourly-results', '0 * * * *',
  $job$SELECT vpl_private.invoke_automation('results');$job$);
