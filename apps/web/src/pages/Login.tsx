import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api';
import { ErrorBox } from '../components/ui';
import { useSession } from '../session';

/**
 * Two-step email code sign-in. The server answers the same way for any email, so this
 * page can't be used to discover which address has access.
 */
export function Login() {
  const { refresh } = useSession();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requestCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ data: { message: string } }>('/auth/request-code', { email });
      setNotice(res.data.data.message);
      setStep('code');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/verify-code', { email, code });
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="card login">
        <h1>Journal dashboard</h1>
        <p className="muted" style={{ margin: 0 }}>
          A private view of routine, journal, planner and urge-tracking records. Sign in with the email the journal was shared with, or your own app email.
        </p>
        {step === 'email' ? (
          <form className="stack" onSubmit={requestCode}>
            <label className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 600 }}>
                Email
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            {error && <ErrorBox message={error} />}
            <button className="btn primary" disabled={busy || !email}>
              {busy ? 'Sending…' : 'Send sign-in code'}
            </button>
          </form>
        ) : (
          <form className="stack" onSubmit={verify}>
            {notice && <p className="small muted" style={{ margin: 0 }}>{notice}</p>}
            <label className="stack" style={{ gap: 6 }}>
              <span className="small" style={{ fontWeight: 600 }}>
                6-digit code sent to {email}
              </span>
              <input
                className="code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </label>
            {error && <ErrorBox message={error} />}
            <button className="btn primary" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn" onClick={() => { setStep('email'); setCode(''); setError(null); }}>
                Use a different email
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void requestCode()}>
                Send a new code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
