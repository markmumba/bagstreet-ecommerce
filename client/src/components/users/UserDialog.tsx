import { useState, useEffect } from 'react';
import { USER_ROLE } from 'shared';
import type { UserResponse } from 'shared';
import { useCreateUser, useUpdateUser } from '@/hooks/useUsers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserResponse | null;
}

export function UserDialog({ open, onOpenChange, user }: UserDialogProps) {
  const isEditing = !!user;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<typeof USER_ROLE.ADMIN | typeof USER_ROLE.MANAGER>(USER_ROLE.MANAGER);
  const [isActive, setIsActive] = useState<'true' | 'false'>('true');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (open) {
      if (user) {
        setFullName(user.full_name);
        setEmail(user.email);
        setRole((user.role as typeof USER_ROLE.ADMIN | typeof USER_ROLE.MANAGER) ?? USER_ROLE.MANAGER);
        setIsActive(user.is_active ? 'true' : 'false');
      } else {
        setFullName('');
        setEmail('');
        setRole(USER_ROLE.MANAGER);
        setIsActive('true');
      }
      setError(null);
    }
  }, [open, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({
          id: user.id,
          data: {
            full_name: fullName.trim(),
            role,
            is_active: isActive === 'true',
          },
        });
      } else {
        await createMutation.mutateAsync({
          email: email.trim(),
          full_name: fullName.trim(),
          role,
        });
      }
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save user');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit User' : 'Create Staff User'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the user details below.'
              : 'An invite link will be emailed to the user.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              required
              disabled={isPending}
            />
          </div>

          {!isEditing && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@example.com"
                required
                disabled={isPending}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof USER_ROLE.ADMIN | typeof USER_ROLE.MANAGER)} disabled={isPending}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={USER_ROLE.MANAGER}>Manager</SelectItem>
                <SelectItem value={USER_ROLE.ADMIN}>Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isEditing && (
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select value={isActive} onValueChange={(v) => setIsActive(v as 'true' | 'false')} disabled={isPending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !fullName.trim()}>
              {isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
