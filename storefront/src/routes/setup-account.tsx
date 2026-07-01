import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { apiClient } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import type { UserResponse } from 'shared';

export const Route = createFileRoute('/setup-account')({
  validateSearch: z.object({ token: z.string().default('') }),
  component: SetupAccountPage,
});

interface InvitePreview {
  email: string;
  full_name: string;
  role: string;
  expires_at: string;
}

function SetupAccountPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(Boolean(token));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    setChecking(true);
    setError('');

    apiClient.post<InvitePreview>('/api/auth/verify-invite', { token })
      .then((res) => {
        if (!cancelled) setInvite(res.data ?? null);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'This setup link is invalid or has expired.');
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post<{ access_token: string; user: UserResponse }>('/api/auth/accept-invite', { token, password });
      const accessToken = res.data?.access_token;
      if (accessToken) {
        localStorage.setItem('bagstreet_store_token', accessToken);
        apiClient.setAuthToken(accessToken);
        await refreshUser();
      }
      navigate({ to: '/account' });
    } catch (err: any) {
      setError(err?.message || 'This setup link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <p className="text-lg font-semibold">Invalid link</p>
          <p className="text-sm text-muted-foreground mt-2">This setup link is missing or invalid.</p>
          <Link to="/login" className="block mt-4 text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <p className="text-lg font-semibold">Checking setup link</p>
          <p className="text-sm text-muted-foreground mt-2">One moment while we verify your account link.</p>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <p className="text-lg font-semibold">Link expired</p>
          <p className="text-sm text-muted-foreground mt-2">{error || 'This setup link is invalid or has expired.'}</p>
          <Link to="/login" className="block mt-4 text-sm text-primary hover:underline">
            Request a new setup link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-3xl font-bold text-primary">Bagstreet</Link>
          <p className="text-muted-foreground mt-2">Set your password</p>
        </div>

        <div className="border border-border rounded-xl bg-card p-8 shadow-sm">
          <h2 className="text-lg font-semibold mb-1">Activate account</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Choose a password for {invite.email}.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
                autoFocus
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
                required
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
            >
              {submitting ? '...' : 'Set password'}
            </button>

            <Link to="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">
              Back to sign in
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
