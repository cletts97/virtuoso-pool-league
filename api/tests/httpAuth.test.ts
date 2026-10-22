import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ApiConfig } from '../src/config';
import type { LeagueService } from '../src/service';
import { createHandler } from '../src/http';
import { ApiError } from '../src/errors';

describe('application bearer forwarding through SWA', () => {
  it('allows only the read-only public endpoint without an authenticated identity', async () => {
    const identity = vi.fn(async () => {
      throw new ApiError(401, 'Sign in.');
    });
    const publicState = vi.fn(async () => ({ readOnly: true }));
    const handle = createHandler(
      { identity, publicState } as unknown as LeagueService,
      {} as SupabaseClient,
      {} as ApiConfig,
    );
    expect((await handle(new Request('https://league.example/api/public-state'))).status).toBe(200);
    expect(identity).not.toHaveBeenCalled();
    for (const path of ['/commands', '/profile/photo', '/admin/invitations']) {
      const response = await handle(
        new Request(`https://league.example/api${path}`, {
          method: 'POST',
          headers: { 'X-VPL-Authorization': 'Bearer forged' },
          body: JSON.stringify({ type: 'updateProfile', name: 'Unauthorized' }),
        }),
      );
      expect(response.status).toBe(401);
    }
  });
  function setup() {
    const user = { id: 'verified-user' };
    const identity = vi.fn(async (token: string) => {
      if (token !== 'supabase-user-token') throw new ApiError(401, 'Invalid session.');
      return user;
    });
    const me = vi.fn(async () => ({ id: user.id, role: 'player' }));
    const handle = createHandler(
      { identity, me } as unknown as LeagueService,
      {} as SupabaseClient,
      {} as ApiConfig,
    );
    return { handle, identity, me };
  }

  it('verifies the user token even when Azure supplies a different Authorization token', async () => {
    const { handle, identity } = setup();
    const response = await handle(
      new Request('https://league.example/api/me', {
        headers: {
          Authorization: 'Bearer azure-host-token',
          'X-VPL-Authorization': 'Bearer supabase-user-token',
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(identity).toHaveBeenCalledWith('supabase-user-token');
  });

  it('retains standard bearer support for existing local API clients', async () => {
    const { handle } = setup();
    const response = await handle(
      new Request('https://league.example/api/me', {
        headers: { Authorization: 'Bearer supabase-user-token' },
      }),
    );
    expect(response.status).toBe(200);
  });

  it('does not accept an invalid app token or fall back to another supplied identity', async () => {
    const { handle, identity, me } = setup();
    const response = await handle(
      new Request('https://league.example/api/me', {
        headers: {
          Authorization: 'Bearer supabase-user-token',
          'X-VPL-Authorization': 'Bearer forged-token',
        },
      }),
    );
    expect(response.status).toBe(401);
    expect(identity).toHaveBeenCalledExactlyOnceWith('forged-token');
    expect(me).not.toHaveBeenCalled();
  });
});
