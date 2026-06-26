import { createFileRoute } from '@tanstack/react-router';
import { Mail, Shield, UserRound } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your admin account preferences</p>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {(user?.full_name || user?.email || 'User').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user?.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border p-4">
                <UserRound className="mb-3 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Name</p>
                <p className="mt-1 truncate text-sm font-medium">{user?.full_name}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <Mail className="mb-3 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Email</p>
                <p className="mt-1 truncate text-sm font-medium">{user?.email}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <Shield className="mb-3 h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Role</p>
                <div className="mt-1">
                  <Badge variant="neutral">{user?.role?.toLowerCase()}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
