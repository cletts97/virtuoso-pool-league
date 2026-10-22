import { createClient } from '@supabase/supabase-js';
import { readConfig } from './config';
import { createPool } from './database';
import { LeagueService } from './service';
import { createHandler } from './http';
import { ResultEmailQueue } from './resultEmails';
import { DisabledEmailDelivery, ResendEmailDelivery } from './email';
const config = readConfig();
const auth = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
export const pool = createPool(config);
export const handleApi = createHandler(
  new LeagueService(
    pool,
    auth,
    config.emailDomains,
    new ResultEmailQueue(
      pool,
      auth,
      config.allowResultEmail
        ? new ResendEmailDelivery(config.resendKey!, config.resultEmailFrom!)
        : new DisabledEmailDelivery(),
      config.allowResultEmail,
      config.appUrl,
      config.emailDomains,
      config.automationEnabled,
    ),
    config.appUrl,
  ),
  auth,
  config,
);
