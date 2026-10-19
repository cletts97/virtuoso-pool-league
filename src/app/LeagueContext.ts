import { createContext, useContext } from 'react';
import type { LeagueState, Season } from '../domain/types';
import type { LeagueCommand } from '../data/contracts';
export interface LeagueContextValue {
  state: LeagueState;
  season: Season;
  busy: boolean;
  run(command: LeagueCommand, message?: string): Promise<boolean>;
  preferences(
    patch: Partial<Pick<LeagueState, 'currentUserId' | 'selectedSeasonId' | 'theme'>>,
  ): Promise<void>;
  reset(): Promise<void>;
  feedback?: { text: string; error: boolean };
  clearFeedback(): void;
}
export const LeagueContext = createContext<LeagueContextValue | null>(null);
export function useLeague() {
  const context = useContext(LeagueContext);
  if (!context) throw new Error('League provider is missing.');
  return context;
}
