import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({
    reset: z.string().optional(),
    activated: z.string().optional(),
    /** Where to return after signing in. Same-site paths only, so the link can't send anyone elsewhere. */
    next: z.string().regex(/^\/(?!\/)/).optional().catch(undefined),
  }),
  component: LoginPage,
});

const inputClass =
  'w-full border-0 border-b border-stone bg-transparent px-0 py-2 text-[15px] font-light text-foreground placeholder:text-foreground-faint focus:border-foreground focus:outline-none focus:ring-0 transition-colors duration-200';

const primaryButtonClass =
  'ui-press h-[52px] w-full bg-espresso text-label-caps text-background hover:bg-espresso-hover disabled:cursor-not-allowed disabled:opacity-60';

const secondaryButtonClass =
  'ui-press h-[52px] w-full border border-espresso text-label-caps text-foreground hover:bg-surface-oat';

function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const { reset, activated, next } = Route.useSearch();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const switchMode = (nextMode: 'login' | 'register') => {
    setMode(nextMode);
    setError('');
    setSentTo('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        if (next) window.location.assign(next);
        else navigate({ to: '/' });
      } else {
        await register(email);
        setSentTo(email);
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const notice = reset
    ? 'Your password has been reset. Sign in with your new password.'
    : activated
      ? 'Your account is ready. Sign in with your new password.'
      : '';

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-[400px]">
        <header className="text-center">
          <h1 className="text-headline-lg">{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>
          <p className="mt-3 text-[15px] text-foreground-muted">
            {mode === 'login'
              ? 'Track your orders and check out faster.'
              : "Enter your email and we'll send you a link to set your password."}
          </p>
        </header>

        {notice && mode === 'login' && (
          <p className="mt-8 border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-4 py-3 text-[13px] text-[var(--color-success-text)]" role="status">
            {notice}
          </p>
        )}

        {sentTo ? (
          <div className="mt-10 space-y-6 text-center" role="status">
            <p className="text-[15px] text-foreground-muted">
              We've sent a setup link to <span className="text-foreground">{sentTo}</span>. Open it to choose your password.
              {import.meta.env.DEV && ' In development, the link is also printed in the server terminal.'}
            </p>
            <button type="button" onClick={() => switchMode('login')} className={secondaryButtonClass}>
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-10 space-y-7">
            <div>
              <label htmlFor="login-email" className="text-label-caps text-foreground-faint">Email</label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={`${inputClass} mt-1`}
              />
            </div>

            {mode === 'login' && (
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="login-password" className="text-label-caps text-foreground-faint">Password</label>
                  <Link to="/forgot-password" className="text-[13px] text-foreground-muted underline-offset-4 hover:text-foreground hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <div className="relative mt-1">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((shown) => !shown)}
                    className="ui-press absolute right-0 top-1/2 -translate-y-1/2 p-1 text-foreground-faint hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword
                      ? <EyeOff strokeWidth={1.25} className="h-4 w-4" aria-hidden="true" />
                      : <Eye strokeWidth={1.25} className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="flex items-start gap-2 text-[13px] text-destructive" role="alert">
                <AlertCircle strokeWidth={1.25} className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}

            <button type="submit" disabled={isLoading} className={primaryButtonClass}>
              {mode === 'login'
                ? (isLoading ? 'Signing in…' : 'Sign in')
                : (isLoading ? 'Sending…' : 'Send setup link')}
            </button>
          </form>
        )}

        {!sentTo && (
          <div className="mt-12 border-t border-border pt-10 text-center">
            {mode === 'login' ? (
              <>
                <p className="text-[15px] text-foreground-muted">New to Bagstreet?</p>
                <button type="button" onClick={() => switchMode('register')} className={`${secondaryButtonClass} mt-4`}>
                  Create an account
                </button>
              </>
            ) : (
              <p className="text-[15px] text-foreground-muted">
                Already have an account?{' '}
                <button type="button" onClick={() => switchMode('login')} className="text-foreground underline underline-offset-4 hover:text-brass-text">
                  Sign in
                </button>
              </p>
            )}
            {next === '/checkout' && (
              <Link to="/checkout" className="mt-6 inline-block text-[13px] text-foreground-muted underline underline-offset-4 hover:text-foreground">
                Continue as guest
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
