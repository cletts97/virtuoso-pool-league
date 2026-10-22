export interface ApiConfig {
  automationEnabled?: boolean;
  automationSecret?: string;
  databaseUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  appUrl: string;
  emailDomains: string[];
  allowAuthEmail: boolean;
  publicDisplay: boolean;
  databaseCa?: string;
  allowResultEmail: boolean;
  resendKey?: string;
  resultEmailFrom?: string;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const required = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`Missing server setting: ${name}`);
    return value;
  };
  const supabaseUrl = required('SUPABASE_URL');
  const appUrl = required('APP_URL');
  const allowResultEmail = env.ALLOW_RESULT_EMAIL === 'true';
  const automationEnabled = env.AUTOMATION_ENABLED === 'true';
  if (automationEnabled && (env.AUTOMATION_SECRET ?? '').trim().length < 32)
    throw new Error('Automation requires an AUTOMATION_SECRET of at least 32 characters.');
  if (allowResultEmail) {
    required('RESEND_API_KEY');
    const from = required('RESULT_EMAIL_FROM');
    if (/[\r\n]/.test(from) || !/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(from))
      throw new Error('RESULT_EMAIL_FROM must be a verified sender email address.');
  }
  for (const value of [supabaseUrl, appUrl]) {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
    )
      throw new Error('HTTPS is required outside localhost.');
  }
  return {
    automationEnabled,
    automationSecret: env.AUTOMATION_SECRET,
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
    allowResultEmail,
    resendKey: env.RESEND_API_KEY,
    resultEmailFrom: env.RESULT_EMAIL_FROM,
  };
}
