import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, X, AlertCircle } from 'lucide-react';
import { browserRepository as repository } from '../data/browserRepository';
import { LeagueContext } from './LeagueContext';
import type { LeagueState } from '../domain/types';
import type { LeagueCommand } from '../data/contracts';
import { liveMode, authClient } from '../auth/client';
import { dateOnly } from '../domain/rules';

export function LeagueProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LeagueState>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean }>();
  const clearFeedback = useCallback(() => setToast(undefined), []);
  const load = useCallback(() => {
    if (document.querySelector('dialog[open]')) return;
    repository
      .load()
      .then((next) => {
        setState(next);
        setError('');
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30_000);
    window.addEventListener('storage', load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', load);
    };
  }, [load]);
  useEffect(() => {
    if (state) document.documentElement.dataset.theme = state.theme;
  }, [state]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = window.setTimeout(() => setToast(undefined), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function run(command: LeagueCommand, message = 'Changes saved.') {
    setBusy(true);
    try {
      setState(await repository.execute(command));
      setToast({ text: message, error: false });
      return true;
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : 'Something went wrong.', error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function preferences(
    patch: Partial<Pick<LeagueState, 'currentUserId' | 'selectedSeasonId' | 'theme'>>,
  ) {
    try {
      setState(await repository.preferences(patch));
    } catch (e) {
      setToast({ text: (e as Error).message, error: true });
    }
  }
  async function reset() {
    try {
      setState(await repository.reset());
      setError('');
      setToast({ text: 'Demo league restored.', error: false });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (error)
    return (
      <main className="error-screen">
        <AlertCircle size={36} />
        <h1>We couldn’t load your league</h1>
        <p>{error}</p>
        {liveMode ? (
          <div className="form-actions">
            <button className="button primary" onClick={load}>
              Try again
            </button>
            <button className="button secondary" onClick={() => void authClient().auth.signOut()}>
              Sign out
            </button>
          </div>
        ) : (
          <button
            className="button primary"
            onClick={() => {
              if (window.confirm('Reset all locally saved demo changes?')) void reset();
            }}
          >
            Reset demo data
          </button>
        )}
      </main>
    );
  if (!state)
    return (
      <main className="error-screen" aria-busy="true">
        <div className="loader" />
        <p>Getting the table ready…</p>
      </main>
    );
  const season = state.seasons.find((s) => s.id === state.selectedSeasonId) ?? {
    id: '',
    name: 'No season yet',
    startDate: dateOnly(),
    participantIds: [],
    format: 'singles' as const,
    status: 'draft' as const,
    config: { roundsPerWeek: 2 },
    qualifiers: [],
  };
  return (
    <LeagueContext.Provider
      value={{ state, season, run, preferences, reset, busy, feedback: toast, clearFeedback }}
    >
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.text}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast(undefined)}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </LeagueContext.Provider>
  );
}
