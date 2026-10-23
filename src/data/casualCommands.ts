import type { CasualResult, LeagueState, Score } from '../domain/types';
import { canReviewCasual, validCasualScore } from '../domain/casual';
import { dateOnly, invariant, validateDate } from '../domain/rules';

export type CasualCommand =
  | {
      type: 'submitCasual';
      result: Pick<
        CasualResult,
        'id' | 'homePlayerIds' | 'awayPlayerIds' | 'playedOn' | 'bestOf' | 'score'
      >;
    }
  | { type: 'reviewCasual'; id: string; approve: boolean; reason: string }
  | { type: 'resolveCasual'; id: string; score: Score; reason: string }
  | { type: 'voidCasual'; id: string; reason: string };

export function executeCasualCommand(source: LeagueState, command: CasualCommand): LeagueState {
  const state = structuredClone(source);
  const actor = state.players.find((p) => p.id === state.currentUserId);
  invariant(!state.readOnly && actor?.active, 'An active account is required.');
  invariant(state.casualResultsEnabled !== false, 'Casual results are not available yet.');
  const results = (state.casualResults ??= []);
  const reason = (value: string) => {
    invariant(
      value.trim().length > 0 && value.trim().length <= 300,
      'Enter a reason (maximum 300 characters).',
    );
    return value.trim();
  };
  const audit = (
    r: CasualResult,
    action: CasualResult['history'][number]['action'],
    note?: string,
  ) => {
    r.history.push({
      id: crypto.randomUUID(),
      actorId: actor.id,
      at: new Date().toISOString(),
      action,
      score: { ...r.score },
      reason: note,
    });
  };
  if (command.type === 'submitCasual') {
    const input = command.result;
    const all = [...input.homePlayerIds, ...input.awayPlayerIds];
    invariant(
      [1, 2].includes(input.homePlayerIds.length) &&
        input.homePlayerIds.length === input.awayPlayerIds.length &&
        new Set(all).size === all.length,
      'Choose two distinct players for singles or four for doubles.',
    );
    invariant(
      all.every((id) => state.players.some((p) => p.id === id && p.active)),
      'Choose active accounts.',
    );
    invariant(all.includes(actor.id), 'Only someone who played can submit a casual result.');
    validateDate(input.playedOn);
    invariant(input.playedOn <= dateOnly(), 'The game date cannot be in the future.');
    invariant(
      [1, 3, 5, 7].includes(input.bestOf) && validCasualScore(input.score, input.bestOf),
      'Choose a valid completed score.',
    );
    const existing = results.find((r) => r.id === input.id);
    if (existing) {
      invariant(
        existing.status === 'disputed' && existing.submittedBy === actor.id,
        'This game already has a result.',
      );
      invariant(
        JSON.stringify(existing.homePlayerIds) === JSON.stringify(input.homePlayerIds) &&
          JSON.stringify(existing.awayPlayerIds) === JSON.stringify(input.awayPlayerIds),
        'Players cannot be changed when resubmitting.',
      );
      Object.assign(existing, {
        score: { ...input.score },
        bestOf: input.bestOf,
        playedOn: input.playedOn,
        status: 'pending',
      });
      audit(existing, 'submitted');
    } else {
      const result: CasualResult = {
        ...input,
        status: 'pending',
        submittedBy: actor.id,
        history: [],
      };
      audit(result, 'submitted');
      results.unshift(result);
    }
    const result = results.find((r) => r.id === input.id)!;
    const opponents = result.homePlayerIds.includes(actor.id)
      ? result.awayPlayerIds
      : result.homePlayerIds;
    const names = (ids: string[]) =>
      ids.map((id) => state.players.find((p) => p.id === id)!.name).join(' & ');
    for (const userId of opponents)
      state.notifications.unshift({
        id: crypto.randomUUID(),
        userId,
        seasonId: null,
        casualResultId: result.id,
        kind: 'approval',
        title: 'Casual result needs your review',
        body: `${names(result.homePlayerIds)} ${result.score.home}–${result.score.away} ${names(result.awayPlayerIds)}. Confirm or dispute this score.`,
        createdAt: result.history.at(-1)!.at,
        read: false,
      });
  } else {
    const result = results.find((r) => r.id === command.id);
    invariant(result, 'Casual game not found.');
    if (command.type === 'reviewCasual') {
      invariant(
        canReviewCasual(result, actor.id),
        'Only an opposing player can review a pending result.',
      );
      result.status = command.approve ? 'confirmed' : 'disputed';
      audit(
        result,
        command.approve ? 'approved' : 'disputed',
        command.approve ? undefined : reason(command.reason),
      );
    } else {
      invariant(actor.role === 'admin', 'Administrator access required.');
      invariant(result.status !== 'cancelled', 'This result has been voided.');
      const note = reason(command.reason);
      if (command.type === 'resolveCasual') {
        invariant(
          validCasualScore(command.score, result.bestOf),
          'Choose a valid completed score.',
        );
        result.score = { ...command.score };
        result.status = 'confirmed';
        audit(result, 'corrected', note);
      } else {
        result.status = 'cancelled';
        audit(result, 'cancelled', note);
      }
    }
  }
  return state;
}
