import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { apiClient } from '@/services/api';

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiClient.post('/api/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="text-3xl font-bold text-primary">Bagstreet</Link>
          <p className="text-muted-foreground mt-2">Reset your password</p>
        </div>

        <div className="border border-border rounded-xl bg-card p-8 shadow-sm">
          <h2 className="text-lg font-semibold mb-1">Forgot password</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Enter your email and we'll send you a reset link.
          </p>

          {submitted ? (
            <div className="space-y-4">
              <p className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                If that email is registered you will receive a reset link shortly.
              </p>
              <Link to="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  required
                  autoFocus
                  disabled={submitting}
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary text-primary-foreground py-2.5 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? '...' : 'Send reset link'}
              </button>

              <Link to="/login" className="block text-center text-sm text-muted-foreground hover:text-foreground">
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
