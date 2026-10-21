import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AvatarStorage, decodeAvatar, MAX_AVATAR_BYTES } from '../src/avatars';
import { avatarSchema } from '../src/validation';
import { createSeed } from '../../src/data/seed';

// Bounded JPEG frame header for validation tests; not an image-decoder fixture.
const raster = (width = 32, height = 32) =>
  Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0,
    8,
    8,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    1,
    0xff,
    0xd9,
  ]);

describe('private profile photos', () => {
  it('accepts bounded JPEG headers and rejects non-raster, truncated and oversized uploads', () => {
    const image = raster();
    expect(decodeAvatar(image.toString('base64'))).toEqual(image);
    for (const bytes of [
      Buffer.from('<svg></svg>'),
      raster(513),
      raster(1, 0),
      image.subarray(0, 9),
      Buffer.alloc(MAX_AVATAR_BYTES + 1),
    ])
      expect(() => decodeAvatar(bytes.toString('base64'))).toThrow();
    expect(() => decodeAvatar('not base64!')).toThrow();
  });

  it('refuses client-selected paths, account IDs and content types', () => {
    expect(avatarSchema.safeParse({ image: null }).success).toBe(true);
    for (const extra of [
      { id: crypto.randomUUID() },
      { path: 'other/avatar.jpg' },
      { contentType: 'image/svg+xml' },
    ])
      expect(avatarSchema.safeParse({ image: raster().toString('base64'), ...extra }).success).toBe(
        false,
      );
  });

  it('writes and removes only the server-selected profile path', async () => {
    const upload = vi.fn(async () => ({ error: null }));
    const remove = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upload, remove }));
    const storage = new AvatarStorage({ storage: { from } } as unknown as SupabaseClient);
    await storage.save('verified-profile', raster().toString('base64'));
    expect(from).toHaveBeenCalledWith('profile-photos');
    expect(upload).toHaveBeenCalledWith('verified-profile/avatar.jpg', raster(), {
      contentType: 'image/jpeg',
      upsert: true,
      cacheControl: '0',
    });
    await storage.save('verified-profile', null);
    expect(remove).toHaveBeenCalledWith(['verified-profile/avatar.jpg']);
  });

  it('issues short-lived URLs without altering the league revision and tolerates missing Storage', async () => {
    const state = createSeed();
    state.revision = 'unchanged';
    const signed = vi.fn(async () => ({
      error: null,
      data: [
        {
          path: `${state.players[0].id}/avatar.jpg`,
          signedUrl: 'https://storage.example/signed-photo',
          error: null,
        },
      ],
    }));
    const storage = new AvatarStorage({
      storage: { from: () => ({ createSignedUrls: signed }) },
    } as unknown as SupabaseClient);
    await storage.decorate(state);
    expect(state.players[0].avatarUrl).toBe('https://storage.example/signed-photo');
    expect(state.players[1].avatarUrl).toBeUndefined();
    expect(state.revision).toBe('unchanged');
    expect(signed).toHaveBeenCalledWith(
      state.players.map((player) => `${player.id}/avatar.jpg`),
      300,
    );
    const missing = new AvatarStorage({
      storage: {
        from: () => {
          throw new Error('No bucket');
        },
      },
    } as unknown as SupabaseClient);
    expect(await missing.decorate(state)).toBe(state);
  });
});
