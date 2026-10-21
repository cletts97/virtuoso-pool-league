import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeagueState } from '../../src/domain/types';
import { ApiError, requireCondition } from './errors';

export const AVATAR_BUCKET = 'profile-photos';
export const MAX_AVATAR_BYTES = 256 * 1024;
const avatarPath = (id: string) => `${id}/avatar.jpg`;

/** Accept bounded JPEG rasters only; never SVG, arbitrary URLs or client-selected paths. */
export function decodeAvatar(encoded: string): Buffer {
  requireCondition(
    encoded.length <= Math.ceil(MAX_AVATAR_BYTES / 3) * 4 && /^[A-Za-z0-9+/]+={0,2}$/.test(encoded),
    400,
    'Choose a JPEG profile photo smaller than 256 KB.',
  );
  const bytes = Buffer.from(encoded, 'base64');
  const invalid = 'The profile photo must be a valid JPEG no larger than 512 × 512 pixels.';
  requireCondition(
    bytes.length >= 12 &&
      bytes.length <= MAX_AVATAR_BYTES &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[bytes.length - 2] === 0xff &&
      bytes[bytes.length - 1] === 0xd9,
    400,
    invalid,
  );
  let offset = 2;
  while (offset + 4 < bytes.length) {
    requireCondition(bytes[offset] === 0xff, 400, invalid);
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    requireCondition(offset + 2 <= bytes.length, 400, invalid);
    const length = bytes.readUInt16BE(offset);
    requireCondition(length >= 2 && offset + length <= bytes.length, 400, invalid);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      requireCondition(length >= 8, 400, invalid);
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      requireCondition(width > 0 && height > 0 && width <= 512 && height <= 512, 400, invalid);
      return bytes;
    }
    offset += length;
  }
  throw new ApiError(400, invalid);
}

export class AvatarStorage {
  constructor(private auth: SupabaseClient) {}

  async save(profileId: string, image: string | null): Promise<void> {
    const bucket = this.auth.storage.from(AVATAR_BUCKET);
    const result =
      image === null
        ? await bucket.remove([avatarPath(profileId)])
        : await bucket.upload(avatarPath(profileId), decodeAvatar(image), {
            contentType: 'image/jpeg',
            upsert: true,
            cacheControl: '0',
          });
    requireCondition(
      !result.error,
      503,
      'Profile photo could not be saved. Check that the private profile-photos storage bucket is configured.',
    );
  }

  async decorate(state: LeagueState): Promise<LeagueState> {
    // Photos must not affect snapshot revisions or make the league unavailable.
    try {
      const { data, error } = await this.auth.storage.from(AVATAR_BUCKET).createSignedUrls(
        state.players.map((p) => avatarPath(p.id)),
        300,
      );
      if (error || !data) return state;
      for (const player of state.players) {
        const photo = data.find((item) => item.path === avatarPath(player.id) && !item.error);
        if (photo?.signedUrl) player.avatarUrl = photo.signedUrl;
      }
    } catch {
      // Missing/unavailable optional Storage leaves initials intact.
    }
    return state;
  }
}
