import { createClient } from '@supabase/supabase-js';
import { readConfig } from './config';
import { createPool } from './database';
import { LeagueService } from './service';
import { createHandler } from './http';
const config = readConfig();
const auth = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
export const pool = createPool(config);
export const handleApi = createHandler(
  new LeagueService(pool, auth, config.emailDomains),
  auth,
  config,
);
