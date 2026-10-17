import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { signIn, signInErrorText, signOut, useApp } from '../data/hooks';
import { BackButton, Banner, Page, btn, pad } from '../ui/kit';

export function Login() {
  const app = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Only internal app paths, e.g. /new or /score/abc123.
  const nextRaw = params.get('next') ?? '/';
  const next = /^\/[A-Za-z0-9/_-]*$/.test(nextRaw) && !nextRaw.startsWith('//') ? nextRaw : '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(signInErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const input = 'h-[52px] w-full rounded-xl border-2 border-line bg-white px-3 text-base text-ink focus:border-green focus:outline-none';

  return (
    <Page>
      <div className={`${pad} pt-3`}>
        <BackButton to="/" />
      </div>
      <div className={`${pad} flex flex-1 flex-col gap-6 pt-6 pb-8`}>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[clamp(26px,8vw,32px)] leading-tight font-extrabold">{next === '/new' ? 'Sign in to create a match' : 'Scorer & admin login'}</h1>
          <p className="text-muted">Use the group's shared scorer login to create and score matches. Everyone can watch live scores, scorecards, player stats, season stats and the Hall of Shame without logging in.</p>
        </div>

        {app.auth.uid ? (
          <div className="flex flex-col gap-3">
            <Banner>
              Signed in as {app.auth.email} ({app.auth.role === 'admin' ? 'admin' : app.auth.role === 'scorer' ? 'scorer' : 'not a known account'}).
            </Banner>
            <button type="button" className={btn.ghost} onClick={() => signOut()}>
              Sign out
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
              Email
              <input className={input} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted">
              Password
              <span className="flex gap-2">
                <input className={input} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Shared password" required />
                <button type="button" className={btn.ghost + ' flex-none'} onClick={() => setShow((s) => !s)}>
                  {show ? 'Hide' : 'Show'}
                </button>
              </span>
            </label>
            {error && <Banner tone="red">{error}</Banner>}
            <button type="submit" className={btn.primary} disabled={busy || !email || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex flex-col rounded-2xl bg-surface px-3.5 py-3">
            <span className="font-bold">Scorer (shared)</span>
            <span className="text-sm text-muted">Create matches, pick teams, score live, fix mistakes</span>
          </div>
          <div className="flex flex-col rounded-2xl bg-surface px-3.5 py-3">
            <span className="font-bold">Admin (one person)</span>
            <span className="text-sm text-muted">Everything, plus players, photos, titles and settings</span>
          </div>
        </div>
      </div>
    </Page>
  );
}
