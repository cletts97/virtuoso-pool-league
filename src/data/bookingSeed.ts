import type { Booking, LeagueState, Player } from '../domain/types';
import { addDays } from '../domain/rules';
import { londonToUtc } from '../domain/bookings';

export const casualColleague: Player = {
  id: 'colleague-01',
  name: 'Riley Bennett',
  department: 'Operations',
  role: 'colleague',
  active: true,
  color: 4,
};
export function seedBookings(state: LeagueState, today: string): Booking[] {
  let date = today;
  while ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) date = addDays(date, 1);
  const fixture = state.fixtures.find(
    (f) => f.status === 'scheduled' && [f.homeId, f.awayId].includes('entry-p01'),
  );
  return [
    { time: '10:00', owner: 'colleague-01', kind: 'casual' as const, guestIds: ['p04'] },
    { time: '12:30', owner: 'p01', kind: 'league' as const, guestIds: [], fixtureId: fixture?.id },
    { time: '15:00', owner: 'p03', kind: 'casual' as const, guestIds: ['p06'] },
  ].map((item, i) => ({
    id: `sample-booking-${i}`,
    ownerId: item.owner,
    kind: item.kind,
    guestIds: item.guestIds,
    fixtureId: item.fixtureId,
    startAt: londonToUtc(date, item.time),
    duration: 30,
    status: 'reserved',
    createdAt: londonToUtc(date, '08:00'),
    updatedAt: londonToUtc(date, '08:00'),
  }));
}
