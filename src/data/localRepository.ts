import type { LeagueState } from '../domain/types';
import type { LeagueCommand, LeagueRepository } from './contracts';
import { invariant } from '../domain/rules';
import { executeCommand } from './commands';
import { createSeed } from './seed';

export const STORAGE_KEY = 'virtuoso-pool-league.v1';
export class LocalLeagueRepository implements LeagueRepository {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {}
  private read(): LeagueState {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return this.write(createSeed());
    try {
      const value = JSON.parse(raw) as LeagueState;
      invariant(
        value.version === 1 &&
          Array.isArray(value.players) &&
          Array.isArray(value.participants) &&
          Array.isArray(value.seasons) &&
          Array.isArray(value.fixtures) &&
          Array.isArray(value.notifications) &&
          Array.isArray(value.availability) &&
          Array.isArray(value.announcements) &&
          value.players.some((p) => p.id === value.currentUserId) &&
          value.seasons.some((s) => s.id === value.selectedSeasonId),
        'Invalid demo data.',
      );
      return value;
    } catch {
      throw new Error(
        'Saved demo data could not be read. Reset the demo to restore the sample league.',
      );
    }
  }
  private write(state: LeagueState): LeagueState {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      throw new Error(
        'Browser storage is unavailable or full. Your change was not saved. Enable local storage and try again.',
      );
    }
    return state;
  }
  async load() {
    return this.read();
  }
  async execute(command: LeagueCommand) {
    return this.write(executeCommand(this.read(), command));
  }
  async preferences(
    patch: Partial<Pick<LeagueState, 'currentUserId' | 'selectedSeasonId' | 'theme'>>,
  ) {
    const state = this.read();
    if (patch.currentUserId)
      invariant(
        state.players.some((p) => p.id === patch.currentUserId && p.active),
        'Select an active player.',
      );
    if (patch.selectedSeasonId)
      invariant(
        state.seasons.some((s) => s.id === patch.selectedSeasonId),
        'Season not found.',
      );
    return this.write({ ...state, ...patch });
  }
  async reset() {
    return this.write(createSeed());
  }
}
