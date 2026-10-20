import type { LeagueState } from '../domain/types';
import { DEFAULT_BOOKING_CONFIG } from '../domain/bookings';
import { casualColleague } from './bookingSeed';

type LegacyState = Omit<LeagueState, 'version' | 'bookings' | 'bookingConfig'> &
  Partial<Pick<LeagueState, 'bookings' | 'bookingConfig'>> & { version: 1 | 2 };

/** Keep the existing storage key and preserve fixtures, audit history and locked seeds. */
export function migrateDemoState(value: LeagueState | LegacyState): LeagueState {
  if (value.version === 3) return value;
  return {
    ...value,
    version: 3,
    bookings: value.bookings ?? [],
    bookingConfig: value.bookingConfig ?? structuredClone(DEFAULT_BOOKING_CONFIG),
    players: value.players.some((p) => p.id === casualColleague.id)
      ? value.players
      : [...value.players, { ...casualColleague }],
    seasons: value.seasons.map((season) => ({
      ...season,
      config: { roundsPerWeek: season.config.roundsPerWeek },
    })),
    announcements: value.announcements.map((notice) =>
      notice.id === 'welcome' && notice.body.includes('Three points for a win.')
        ? {
            ...notice,
            body: notice.body.replace('Three points for a win.', 'Every match win counts.'),
          }
        : notice,
    ),
  };
}
