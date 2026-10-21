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
            ? 'Request a password reset for your invited work account.'
            : 'Sign in with your invited work email. Casual players are welcome too.'}
        </p>
        <form className="form-stack" onSubmit={(e) => void submit(e)}>
          <label>
            Work email
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
  useEffect(() => {
    if (!liveMode) return;
    let alive = true;
    void Promise.resolve()
      .then(() => authClient().auth.getSession())
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
  }, []);
  async function accept() {
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
      window.history.replaceState({}, '', '/auth/callback');
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
  return (
    <main className="auth-page">
      <div className="auth-card">
        <img src="/brand/virtuoso-white.png" alt="Virtuoso" />
        <h1>Set your password.</h1>
        <p>Choose a password of at least 12 characters for your Virtuoso Pool League account.</p>
        {message && (
          <p role="alert" className="form-error">
            {message}
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
