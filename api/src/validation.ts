import { z } from 'zod';
const id = z.uuid();
const text = z.string().trim().min(1).max(1000);
const date = z.iso.date();
const score = z.strictObject({
  home: z.number().int().min(0).max(4),
  away: z.number().int().min(0).max(4),
});
const fields = { fixtureId: id, reason: text.max(300) };
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('endSeason'), seasonId: id, reason: text.min(5).max(300) }),
  z.strictObject({ type: z.literal('deleteSeason'), seasonId: id, confirmName: text.max(120) }),
  z.strictObject({
    type: z.literal('submitCasual'),
    result: z.strictObject({
      id,
      homePlayerIds: z.array(id).min(1).max(2),
      awayPlayerIds: z.array(id).min(1).max(2),
      playedOn: date,
      bestOf: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]),
      score,
    }),
  }),
  z.strictObject({
    type: z.literal('reviewCasual'),
    id,
    approve: z.boolean(),
    reason: z.string().max(300),
  }),
  z.strictObject({ type: z.literal('resolveCasual'), id, score, reason: text.max(300) }),
  z.strictObject({ type: z.literal('voidCasual'), id, reason: text.max(300) }),
  z.strictObject({ type: z.literal('requestSeasonJoin'), seasonId: id }),
  z.strictObject({ type: z.literal('reviewSeasonJoin'), id, approve: z.boolean(), dueDate: date }),
  z.strictObject({ type: z.literal('deleteUser'), id }),
  z.strictObject({ type: z.literal('updateProfile'), name: text.max(70) }),
  z.strictObject({ type: z.literal('submit'), fixtureId: id, score }),
  z.strictObject({
    type: z.literal('review'),
    fixtureId: id,
    approve: z.boolean(),
    reason: z.string().max(300),
  }),
  z.strictObject({ type: z.literal('correct'), ...fields, score }),
  z.strictObject({ type: z.literal('postpone'), ...fields, dueDate: date }),
  z.strictObject({ type: z.literal('reschedule'), ...fields, dueDate: date }),
  z.strictObject({ type: z.literal('finalize'), seasonId: id, reason: text.max(300) }),
  z.strictObject({ type: z.literal('generate'), seasonId: id }),
  z.strictObject({ type: z.literal('addSeasonPlayer'), seasonId: id, playerId: id, dueDate: date }),
  z.strictObject({
    type: z.literal('createSeason'),
    name: text.max(80),
    startDate: date,
    participantIds: z.array(id).min(4).max(40),
    roundsPerWeek: z.number().int().min(1).max(7),
  }),
  z.strictObject({
    type: z.literal('updateSeason'),
    seasonId: id,
    name: text.max(80),
    startDate: date,
    roundsPerWeek: z.number().int().min(1).max(7),
  }),
  z.strictObject({
    type: z.literal('savePlayer'),
    id,
    name: text.max(70),
    department: z.string().trim().max(70),
    active: z.boolean(),
  }),
  z.strictObject({ type: z.literal('enrolPlayer'), id }),
  z.strictObject({ type: z.literal('announce'), seasonId: id, title: text.max(100), body: text }),
  z.strictObject({ type: z.literal('readNotifications'), ids: z.array(id).max(1000) }),
  z.strictObject({
    type: z.literal('saveBooking'),
    id: id.optional(),
    booking: z.strictObject({
      kind: z.enum(['league', 'casual']),
      sport: z.enum(['pool', 'table_tennis']).optional(),
      startAt: z.iso.datetime(),
      duration: z.union([z.literal(15), z.literal(30)]),
      fixtureId: id.optional(),
      guestIds: z.array(id).max(40),
    }),
  }),
  z.strictObject({ type: z.literal('cancelBooking'), id }),
  z.strictObject({
    type: z.literal('bookingConfig'),
    config: z.strictObject({
      timeZone: z.literal('Europe/London'),
      opensAt: z.string().regex(/^\d{2}:\d{2}$/),
      closesAt: z.string().regex(/^\d{2}:\d{2}$/),
      weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    }),
  }),
]);
export const requestSchema = z.strictObject({
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  command: commandSchema,
});
export const inviteSchema = z.strictObject({ email: z.email().max(254), name: text.max(70) });
export const resetSchema = z.strictObject({ email: z.email().max(254) });
export const avatarSchema = z.strictObject({ image: z.string().min(1).max(349528).nullable() });
export type ApiCommand = z.infer<typeof commandSchema>;
