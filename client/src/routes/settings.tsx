import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { BellRing, Mail, Shield, UserRound } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useOrderHandoverSettings, useUpdateOrderHandoverSettings } from '@/hooks/useSettings';
import { useUsers } from '@/hooks/useUsers';
import { USER_ROLE, type UserResponse } from 'shared';

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const [handoverEnabled, setHandoverEnabled] = useState(false);
  const [managerId, setManagerId] = useState('');
  const [saved, setSaved] = useState(false);

  const { data: handoverRes, isLoading: handoverLoading } = useOrderHandoverSettings();
  const { data: managersRes, isLoading: managersLoading } = useUsers({
    page: 1,
    limit: 100,
    role: USER_ROLE.MANAGER,
    status: 'true',
  });
  const updateHandover = useUpdateOrderHandoverSettings();

  const handover = handoverRes?.data;
  const managers: UserResponse[] = managersRes?.data ?? [];
  const canSaveHandover = !handoverEnabled || Boolean(managerId);

  useEffect(() => {
    if (!handover) return;
    setHandoverEnabled(handover.enabled);
    setManagerId(handover.manager_id ?? '');
  }, [handover]);

  const handleSaveHandover = async () => {
    setSaved(false);
    await updateHandover.mutateAsync({
      enabled: handoverEnabled,
      manager_id: handoverEnabled ? managerId : null,
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage account and shop operations</p>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BellRing className="h-5 w-5 text-muted-foreground" strokeWidth={1.7} />
              Order handover
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">Alert a manager for order fulfillment</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  When enabled, order alerts go to admins and the selected manager.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={handoverEnabled}
                aria-label="Toggle order handover alerts"
                onClick={() => setHandoverEnabled((enabled) => !enabled)}
                disabled={handoverLoading || updateHandover.isPending}
                className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:opacity-50 ${
                  handoverEnabled ? 'border-primary bg-primary' : 'border-border bg-muted'
                }`}
              >
                <span
                  className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${
                    handoverEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="handover-manager">
                  Duty manager
                </label>
                <Select
                  value={managerId}
                  onValueChange={setManagerId}
                  disabled={managersLoading || updateHandover.isPending}
                >
                  <SelectTrigger id="handover-manager">
                    <SelectValue placeholder={managersLoading ? 'Loading managers...' : 'Select manager'} />
                  </SelectTrigger>
                  <SelectContent>
                    {managers.map((manager) => (
                      <SelectItem key={manager.id} value={manager.id}>
                        {manager.full_name} - {manager.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Managers can still view orders when this is off, but they will not be actively alerted.
                </p>
              </div>

              <Button
                type="button"
                onClick={handleSaveHandover}
                disabled={!canSaveHandover || handoverLoading || updateHandover.isPending}
              >
                {updateHandover.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>

            {!canSaveHandover && (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Select a manager before enabling handover.
              </p>
            )}
            {updateHandover.error && (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {(updateHandover.error as any)?.message || 'Failed to update order handover'}
              </p>
            )}
            {saved && (
              <p className="rounded-xl border border-[var(--color-success-border)] bg-[var(--color-success-bg)] px-3 py-2 text-sm text-[var(--color-success-text)]">
                Order handover updated.
              </p>
            )}
          </CardContent>
        </Card>

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
