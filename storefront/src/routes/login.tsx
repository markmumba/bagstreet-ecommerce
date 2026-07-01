import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { useAuth } from '@/context/AuthContext';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({
    reset: z.string().optional(),
    activated: z.string().optional(),
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const { reset, activated } = Route.useSearch();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setIsLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        navigate({ to: '/' });
      } else {
        await register(email);
        setSuccessMessage(
          import.meta.env.DEV
            ? 'Check your email for the setup link. In development, the link is also printed in the server terminal.'
            : 'Check your email for the setup link.'
        );
        setEmail('');
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-3xl font-bold text-primary">Bagstreet</Link>
          <p className="text-muted-foreground mt-2">
            {mode === 'login' ? 'Sign in to your account' : 'Enter your email to start setup'}
          </p>
        </div>

        {reset && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            Password reset — please sign in with your new password.
          </div>
        )}

        {activated && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            Account activated — please sign in with your new password.
          </div>
        )}

        <div className="border border-border rounded-xl bg-card p-8 shadow-sm">
          {/* Toggle */}
          <div className="flex rounded-lg border border-border p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Sign in
            </button>
            <button
              onClick={() => { setMode('register'); setError(''); setSuccessMessage(''); setPassword(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'register' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                required
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {mode === 'login' && (
              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            {mode === 'login' && (
              <div className="flex justify-end -mt-2">
                <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
                  Forgot password?
                </Link>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
            {successMessage && (
              <p className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
                {successMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
            >
              {isLoading ? '...' : mode === 'login' ? 'Sign in' : 'Send setup link'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
