import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api';
import { ErrorBox } from '../components/ui';
import { useSession } from '../session';

/** Dawn landscape: soft sky, rising sun, layered hills, birds and a sprouting leaf. */
function LoginArt() {
  return (
    <svg className="auth-art" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="la-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--art-sky-top)" />
          <stop offset="0.65" stopColor="var(--art-sky-bottom)" />
        </linearGradient>
        <radialGradient id="la-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--art-glow)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--art-glow)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="600" height="800" fill="url(#la-sky)" />
      <circle cx="400" cy="400" r="190" fill="url(#la-glow)" />
      <circle className="auth-sun" cx="400" cy="400" r="62" fill="var(--art-sun)" />
      <g stroke="var(--art-bird)" strokeWidth="3" fill="none" strokeLinecap="round" className="auth-birds">
        <path d="M120 220 q10 -10 20 0 q10 -10 20 0" />
        <path d="M175 185 q7 -7 14 0 q7 -7 14 0" />
        <path d="M90 265 q6 -6 12 0 q6 -6 12 0" />
      </g>
      <path d="M0 470 C 90 410, 190 425, 290 448 C 390 470, 480 420, 600 438 L600 800 L0 800 Z" fill="var(--art-far)" />
      <path d="M0 535 C 110 490, 220 515, 320 528 C 420 541, 500 500, 600 512 L600 800 L0 800 Z" fill="var(--art-mid)" />
      <path d="M0 600 C 120 565, 230 595, 350 598 C 450 600, 520 578, 600 584 L600 800 L0 800 Z" fill="var(--art-near)" />
      <path d="M0 670 C 130 645, 260 670, 380 666 C 480 662, 540 650, 600 655 L600 800 L0 800 Z" fill="var(--art-front)" />
      <g fill="var(--art-leaf)">
        <path d="M80 668 C 66 630, 86 606, 110 598 C 110 626, 100 650, 80 668 Z" />
        <path d="M84 668 C 56 650, 44 626, 50 608 C 74 615, 84 640, 84 668 Z" />
        <path d="M520 656 C 510 626, 526 606, 546 600 C 546 624, 536 644, 520 656 Z" />
      </g>
    </svg>
  );
}

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

  const requestCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/request-code', { email });
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
    <div className="auth">
      <aside className="auth-side">
        <LoginArt />
        <div className="auth-side-text">
          <div className="auth-brand">🌿 Journal</div>
          <blockquote>
            “Every action you take is a vote for the type of person you wish to become.”
            <cite>James Clear</cite>
          </blockquote>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          {step === 'email' ? (
            <>
              <h1>Welcome back</h1>
              <p className="muted auth-lead">
                Habits, journal, planner and calendar in one calm place. Sign in with your own app email, or the email a journal
                was shared with.
              </p>
              <form className="stack" onSubmit={requestCode}>
                <label className="field">
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                {error && <ErrorBox message={error} />}
                <button className="btn primary auth-btn" disabled={busy || !email}>
                  {busy ? 'Sending…' : 'Email me a sign-in code'}
                </button>
              </form>
              <p className="small muted auth-foot">🔒 No password needed. We'll send a 6-digit code that works once, for 10 minutes.</p>
            </>
          ) : (
            <>
              <h1>Check your inbox</h1>
              <p className="muted auth-lead">
                If <strong>{email}</strong> has access, a 6-digit code is on its way. It can take a minute; check spam too.
              </p>
              <form className="stack" onSubmit={verify}>
                <label className="field">
                  Sign-in code
                  <input
                    className="code-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    placeholder="••••••"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                  />
                </label>
                {error && <ErrorBox message={error} />}
                <button className="btn primary auth-btn" disabled={busy || code.length !== 6}>
                  {busy ? 'Checking…' : 'Sign in'}
                </button>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    className="btn link"
                    onClick={() => {
                      setStep('email');
                      setCode('');
                      setError(null);
                    }}
                  >
                    ← Different email
                  </button>
                  <button type="button" className="btn link" disabled={busy} onClick={() => void requestCode()}>
                    Send a new code
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
