import { expect, it } from 'vitest';
import { isPublicSupabaseKey } from './publicConfig';
it('accepts public keys and rejects privileged or malformed keys', () => {
  const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;
  expect(isPublicSupabaseKey('sb_publishable_example')).toBe(true);
  expect(isPublicSupabaseKey(jwt('anon'))).toBe(true);
  for (const key of ['sb_secret_example', jwt('service_role'), 'invalid', ''])
    expect(isPublicSupabaseKey(key)).toBe(false);
});
