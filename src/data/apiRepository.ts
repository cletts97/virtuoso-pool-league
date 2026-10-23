import type { LeagueState } from '../domain/types';
import type { LeagueCommand, LeagueRepository } from './contracts';
import type { DisplayRepository, DisplaySnapshot } from './display';
import { authClient } from '../auth/client';
export async function authenticatedRequest<T>(path: string, body?: unknown): Promise<T> {
  if (!navigator.onLine)
    throw new Error('You are offline. Reconnect to view current information or save changes.');
  const { data } = await authClient().auth.getSession();
  if (!data.session) throw new Error('Your session has expired. Sign in again.');
  const response = await fetch(`/api${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      // SWA's managed Functions proxy can replace the standard Authorization header.
      'X-VPL-Authorization': `Bearer ${data.session.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 401) await authClient().auth.signOut({ scope: 'local' });
    throw new Error(payload.error ?? 'The service could not complete this request.');
  }
  return payload as T;
}
export class ApiLeagueRepository implements LeagueRepository, DisplayRepository {
  private snapshot?: LeagueState;
  private settings: Partial<Pick<LeagueState, 'selectedSeasonId' | 'theme'>> = {};
  private apply(state: LeagueState): LeagueState {
    const key = `vpl.preferences.${state.currentUserId}`;
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
      this.settings = stored && typeof stored === 'object' ? stored : {};
    } catch {
      this.settings = {};
    }
    const result = {
      ...state,
      theme: this.settings.theme === 'light' ? ('light' as const) : ('dark' as const),
      selectedSeasonId: state.seasons.some((s) => s.id === this.settings.selectedSeasonId)
        ? this.settings.selectedSeasonId!
        : state.selectedSeasonId,
    };
    this.snapshot = result;
    return result;
  }
  async load() {
    const { data } = await authClient().auth.getSession();
    if (!data.session) {
      const response = await fetch('/api/public-state');
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? 'Public league information is unavailable.');
      return this.apply(payload as LeagueState);
    }
    return this.apply(await authenticatedRequest<LeagueState>('/state'));
  }
  async saveAvatar(image: string | null) {
    return this.apply(await authenticatedRequest<LeagueState>('/profile/photo', { image }));
  }
  async execute(command: LeagueCommand) {
    if (!this.snapshot?.revision) throw new Error('Refresh the page before saving.');
    const state = await authenticatedRequest<LeagueState>('/commands', {
      command,
      expectedRevision: this.snapshot!.revision,
    });
    if (command.type === 'createSeason')
      localStorage.setItem(
        `vpl.preferences.${state.currentUserId}`,
        JSON.stringify({ ...this.settings, selectedSeasonId: state.selectedSeasonId }),
      );
    return this.apply(state);
  }
  async preferences(
    patch: Partial<Pick<LeagueState, 'currentUserId' | 'selectedSeasonId' | 'theme'>>,
  ) {
    if (patch.currentUserId) throw new Error('Identity cannot be changed in live mode.');
    if (!this.snapshot) await this.load();
    const settings = { ...this.settings, ...patch };
    localStorage.setItem(
      `vpl.preferences.${this.snapshot!.currentUserId}`,
      JSON.stringify(settings),
    );
    return this.apply(this.snapshot!);
  }
  async reset(): Promise<LeagueState> {
    throw new Error('Demo reset is unavailable in live mode.');
  }
  async loadDisplay(): Promise<DisplaySnapshot> {
    const response = await fetch('/api/display');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Display unavailable.');
    return data as DisplaySnapshot;
  }
}
