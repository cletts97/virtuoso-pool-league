import { z } from 'zod';

/** '*' allows any valid email domain; Auth invitation and active-profile checks still apply. */
export function allowedEmail(email: string, domains: string[]): boolean {
  const parsed = z.email().safeParse(email.trim());
  if (!parsed.success) return false;
  const domain = parsed.data.toLowerCase().split('@')[1];
  return domains.includes('*') || domains.includes(domain);
}
