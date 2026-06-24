import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { apiClient } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/api/auth/accept-invite', { token, password });
      navigate({ to: '/login', search: { activated: '1' } });
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired invite link');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Invalid Link</CardTitle>
            <CardDescription>This invite link is missing or invalid.</CardDescription>
          </CardHeader>
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
            <CardTitle className="text-xl">Accept Invitation</CardTitle>
            <CardDescription>Choose a password to activate your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="Repeat password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Activating…' : 'Set Password & Activate'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
