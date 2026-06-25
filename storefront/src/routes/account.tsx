import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiClient } from '@/services/api';

export const Route = createFileRoute('/account')({
  component: AccountPage,
});

function AccountPage() {
  const { user, isLoading, logout, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');

  useEffect(() => {
    if (!isLoading && !user) navigate({ to: '/login' });
  }, [isLoading, user, navigate]);

  useEffect(() => {
    if (user) setFullName(user.full_name);
  }, [user]);

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError('');
    setNameSuccess(false);
    if (!fullName.trim() || fullName.trim() === user?.full_name) return;
    setNameSaving(true);
    try {
      await apiClient.patch('/api/auth/profile', { full_name: fullName.trim() });
      await refreshUser();
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch (err: any) {
      setNameError(err?.message || 'Failed to update name');
    } finally {
      setNameSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess(false);
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    setPwSaving(true);
    try {
      await apiClient.patch('/api/auth/profile', { current_password: currentPw, new_password: newPw });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwSuccess(true);
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: any) {
      setPwError(err?.message || 'Failed to update password');
    } finally {
      setPwSaving(false);
    }
  };

  if (isLoading || !user) return null;

  const inputClass = 'w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="max-w-[1440px] mx-auto px-8 sm:px-12 lg:px-20 pt-[calc(72px+48px)] pb-24">
      <h1
        className="text-3xl font-light text-foreground mb-2"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        My Account
      </h1>
      <p className="text-sm text-muted-foreground mb-12" style={{ fontFamily: 'var(--font-sans)' }}>
        {user.email}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-3xl">

        {/* Profile */}
        <section>
          <h2
            className="text-xs tracking-[0.2em] uppercase text-foreground mb-6 pb-3 border-b border-[var(--border-subtle)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Profile
          </h2>
          <form onSubmit={handleNameSubmit} className="space-y-4">
            <div>
              <label className="block text-xs tracking-[0.1em] uppercase text-muted-foreground mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                minLength={2}
                disabled={nameSaving}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs tracking-[0.1em] uppercase text-muted-foreground mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
                Email
              </label>
              <input type="email" value={user.email} disabled className={`${inputClass} opacity-50 cursor-not-allowed`} />
            </div>

            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            {nameSuccess && <p className="text-xs text-green-700">Name updated.</p>}

            <button
              type="submit"
              disabled={nameSaving || !fullName.trim() || fullName.trim() === user.full_name}
              className="bg-primary text-primary-foreground px-6 py-2 text-xs tracking-[0.15em] uppercase hover:opacity-90 transition-opacity disabled:opacity-40"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {nameSaving ? 'Saving…' : 'Save Name'}
            </button>
          </form>
        </section>

        {/* Password */}
        <section>
          <h2
            className="text-xs tracking-[0.2em] uppercase text-foreground mb-6 pb-3 border-b border-[var(--border-subtle)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Change Password
          </h2>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs tracking-[0.1em] uppercase text-muted-foreground mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
                Current Password
              </label>
              <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required disabled={pwSaving} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs tracking-[0.1em] uppercase text-muted-foreground mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
                New Password
              </label>
              <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={8} placeholder="Min 8 characters" disabled={pwSaving} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs tracking-[0.1em] uppercase text-muted-foreground mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
                Confirm New Password
              </label>
              <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required disabled={pwSaving} className={inputClass} />
            </div>

            {pwError && <p className="text-xs text-destructive">{pwError}</p>}
            {pwSuccess && <p className="text-xs text-green-700">Password updated.</p>}

            <button
              type="submit"
              disabled={pwSaving || !currentPw || !newPw || !confirmPw}
              className="bg-primary text-primary-foreground px-6 py-2 text-xs tracking-[0.15em] uppercase hover:opacity-90 transition-opacity disabled:opacity-40"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {pwSaving ? 'Saving…' : 'Update Password'}
            </button>
          </form>
        </section>

      </div>

      {/* Sign out */}
      <div className="mt-16 pt-8 border-t border-[var(--border-subtle)]">
        <button
          onClick={async () => { await logout(); navigate({ to: '/' }); }}
          className="text-xs tracking-[0.15em] uppercase text-muted-foreground hover:text-foreground transition-colors"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
