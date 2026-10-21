import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authClient, liveMode } from './client';
export function SignIn() {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [reset, setReset] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate(),
    location = useLocation();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (reset) {
        const response = await fetch('/api/auth/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setMessage(body.message);
      } else {
        const { error } = await authClient().auth.signInWithPassword({ email, password });
        if (error) throw error;
        const from = location.state?.from as unknown;
        navigate(
          typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/',
          { replace: true },
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Sign-in could not be completed.');
    } finally {
      setBusy(false);
    }
  }
  if (!liveMode)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Demo workspace</h1>
          <p>No account is required in mock mode.</p>
          <Link className="button primary" to="/">
            Open the league
          </Link>
        </div>
      </main>
    );
  return (
    <main className="auth-page">
      <div className="auth-card">
        <img src="/brand/virtuoso-white.png" alt="Virtuoso" />
        <div className="eyebrow">POOL LEAGUE</div>
        <h1>{reset ? 'Back in the game.' : 'Welcome to the league.'}</h1>
        <p>
          {reset
            ? 'Request a password reset for your invited account.'
            : 'Sign in with your invited email address. Casual players are welcome too.'}
        </p>
        <form className="form-stack" onSubmit={(e) => void submit(e)}>
          <label>
            Email address
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {!reset && (
            <label>
              Password
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
          {message && (
            <p className="form-error" role="status">
              {message}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? 'Please wait…' : reset ? 'Send reset email' : 'Sign in'}
          </button>
          <button
            className="text-link"
            type="button"
            onClick={() => {
              setReset(!reset);
              setMessage('');
            }}
          >
            {reset ? 'Back to sign in' : 'Forgot your password?'}
          </button>
        </form>
        <p className="field-help">Invitation only. Contact your league administrator for access.</p>
      </div>
    </main>
  );
}
export function AuthCallback() {
  const [ready, setReady] = useState(false),
    [message, setMessage] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token_hash'));
  const [type] = useState(() => new URLSearchParams(window.location.search).get('type'));
  const [implicitSession] = useState(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (!fragment.has('access_token') && !fragment.has('refresh_token')) return;
    return {
      access_token: fragment.get('access_token') ?? '',
      refresh_token: fragment.get('refresh_token') ?? '',
    };
  });
  const [linkError] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    return query.has('error') || fragment.has('error') || fragment.has('error_description');
  });
  useEffect(() => {
    if (linkError) {
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    // An invitation/reset token must be exchanged even if another account is signed in.
    if (!liveMode || token) return;
    let alive = true;
    // Default Supabase dashboard invitations use implicit fragments. Our SDK uses
    // PKCE for new flows, so explicitly verify/adopt this session and scrub its URL.
    if (implicitSession) window.history.replaceState({}, '', window.location.pathname);
    void Promise.resolve()
      .then(async () => {
        const result = implicitSession
          ? await authClient().auth.setSession(implicitSession)
          : await authClient().auth.getSession();
        return { data: { session: result.data.session }, error: result.error };
      })
      .then(({ data, error }) => {
        if (alive) {
          setReady(!!data.session);
          if (error)
            setMessage(
              'This link is invalid or expired. Request a new invitation or password reset.',
            );
        }
      })
      .catch((e: Error) => {
        if (alive) setMessage(e.message);
      });
    return () => {
      alive = false;
    };
  }, [token, linkError, implicitSession]);
  async function accept() {
    if (!liveMode) return;
    setBusy(true);
    try {
      if (!token || !['invite', 'recovery'].includes(type ?? ''))
        throw new Error('This link is invalid or expired.');
      const { error } = await authClient().auth.verifyOtp({
        token_hash: token,
        type: type as 'invite' | 'recovery',
      });
      if (error) throw error;
      setReady(true);
      window.history.replaceState({}, '', window.location.pathname);
    } catch {
      setMessage('This link is invalid or expired. Request a new invitation or password reset.');
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    if (password !== confirm) {
      setMessage('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await authClient().auth.updateUser({ password });
      if (error) throw error;
      await authClient().auth.signOut();
      navigate('/login', { replace: true });
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!liveMode)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Invitations are unavailable in demo mode.</h1>
          <p>
            This application was built without live authentication enabled. Ask your administrator
            to configure the Supabase build settings and redeploy in API mode, then reopen your
            invitation.
          </p>
          <Link className="text-link" to="/login">
            Back to sign in
          </Link>
        </div>
      </main>
    );
  return (
    <main className="auth-page">
      <div className="auth-card">
        <img src="/brand/virtuoso-white.png" alt="Virtuoso" />
        <h1>Set your password.</h1>
        <p>Choose a password of at least 12 characters for your Virtuoso Pool League account.</p>
        {(linkError || message) && (
          <p role="alert" className="form-error">
            {linkError
              ? 'This link is invalid or expired. Request a new invitation or password reset.'
              : message}
          </p>
        )}
        {ready ? (
          <form className="form-stack" onSubmit={(e) => void save(e)}>
            <label>
              New password
              <input
                required
                type="password"
                minLength={12}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Confirm password
              <input
                required
                type="password"
                minLength={12}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              Save password and sign in
            </button>
          </form>
        ) : token ? (
          <button className="button primary" disabled={busy} onClick={() => void accept()}>
            Continue securely
          </button>
        ) : (
          <p className="field-help">
            Open the complete link from your invitation or reset email. If it has expired, request a
            new one.
          </p>
        )}
        <Link className="text-link" to="/login">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
