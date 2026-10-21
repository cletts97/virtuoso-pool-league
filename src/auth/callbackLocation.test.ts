import { describe, expect, it } from 'vitest';
import { callbackLocation } from './callbackLocation';

describe('Auth landing routing', () => {
  it.each(['invite', 'recovery'])('preserves a root %s fragment for the SDK', (type) => {
    const hash = `#access_token=example&refresh_token=example&type=${type}`;
    expect(callbackLocation({ pathname: '/', search: '', hash })).toBe(`/auth/callback${hash}`);
  });
  it('routes token-hash links without following a client-supplied redirect', () => {
    const search = '?token_hash=example&type=invite&redirect_to=https://untrusted.example';
    expect(callbackLocation({ pathname: '/', search, hash: '' })).toBe(`/auth/callback${search}`);
  });
  it('routes expired-link errors for a useful message', () => {
    const hash = '#error=access_denied&error_description=Expired';
    expect(callbackLocation({ pathname: '/', search: '', hash })).toBe(`/auth/callback${hash}`);
  });
  it('does not redirect callback pages or unrelated navigation', () => {
    expect(
      callbackLocation({
        pathname: '/auth/callback',
        search: '?token_hash=a&type=invite',
        hash: '',
      }),
    ).toBeUndefined();
    expect(callbackLocation({ pathname: '/rules', search: '', hash: '#snookers' })).toBeUndefined();
    expect(callbackLocation({ pathname: '/', search: '?type=invite', hash: '' })).toBeUndefined();
  });
});
