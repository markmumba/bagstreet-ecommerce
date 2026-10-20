import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { apiClient } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNotice } from '@/components/ui/notice';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShoppingBag } from 'lucide-react';

export const Route = createFileRoute('/accept-invite')({
  validateSearch: z.object({ token: z.string().default('') }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('The passwords don’t match. Type the same password in both fields.');
      return;
    }

    if (password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/api/auth/accept-invite', { token, password });
      navigate({ to: '/login', search: { activated: '1' } });
    } catch (err: any) {
      setError(err?.message || 'This invite link is invalid or has expired. Ask an admin to send a new invite.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Invalid link</CardTitle>
            <CardDescription>This invite link is missing or invalid. Ask an admin to send you a new invite.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">
              Back to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Bagstreet</h1>
          <p className="text-sm text-muted-foreground">Set your password</p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Accept invitation</CardTitle>
            <CardDescription>Choose a password to activate your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>

              <ErrorNotice>{error}</ErrorNotice>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Activating…' : 'Set password and activate'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
