import { useEffect, useState, type ReactNode } from 'react';
import { authClient, liveMode } from './client';
export function AuthGate({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null | undefined>(undefined),
    [error, setError] = useState('');
  useEffect(() => {
    if (!liveMode) return;
    let unsubscribe = () => {};
    let alive = true;
    void Promise.resolve()
      .then(() => {
        if (!alive) return;
        const auth = authClient();
        void auth.auth.getSession().then(({ data, error }) => {
          if (alive) {
            setUserId(data.session?.user.id ?? null);
            if (error) setError('Please sign in again.');
          }
        });
        const { data } = auth.auth.onAuthStateChange((_event, session) => {
          setUserId(session?.user.id ?? null);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  if (!liveMode) return children;
  if (error)
    return (
      <main className="error-screen">
        <h1>Sign-in unavailable</h1>
        <p>{error}</p>
      </main>
    );
  if (userId === undefined)
    return (
      <main className="error-screen">
        <div className="loader" />
        <p>Checking your session…</p>
      </main>
    );
  return <div key={userId ?? 'public'}>{children}</div>;
}
