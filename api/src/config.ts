export interface ApiConfig {
  databaseUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  appUrl: string;
  emailDomains: string[];
  allowAuthEmail: boolean;
  publicDisplay: boolean;
  databaseCa?: string;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const required = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`Missing server setting: ${name}`);
    return value;
  };
  const supabaseUrl = required('SUPABASE_URL');
  const appUrl = required('APP_URL');
  for (const value of [supabaseUrl, appUrl]) {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
    )
      throw new Error('HTTPS is required outside localhost.');
  }
  return {
    databaseUrl: required('DATABASE_URL'),
    supabaseUrl,
    supabaseKey: required('SUPABASE_SECRET_KEY'),
    appUrl,
    emailDomains: (env.WORK_EMAIL_DOMAINS ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),
    allowAuthEmail: env.ALLOW_AUTH_EMAIL === 'true',
    publicDisplay: env.PUBLIC_DISPLAY_ENABLED === 'true',
    databaseCa: env.DATABASE_CA_CERT,
  };
}
