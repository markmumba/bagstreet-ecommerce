import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { UserDialog } from '@/components/users/UserDialog';
import { useUsers, useDeleteUser } from '@/hooks/useUsers';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { USER_ROLE } from 'shared';
import type { UserResponse } from 'shared';
import { Plus, Users } from 'lucide-react';

export const Route = createFileRoute('/users')({
  component: UsersPage,
});

const LIMIT = 20;

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function UsersPage() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Server-side filter state
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [roleFilter, statusFilter]);

  const { data: res, isLoading, error } = useUsers({
    page,
    limit: LIMIT,
    search: debouncedSearch || undefined,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
  });

  const users: UserResponse[] = res?.data ?? [];
  const total = (res as any)?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const deleteMutation = useDeleteUser();

  useEffect(() => {
    if (currentUser && currentUser.role !== USER_ROLE.ADMIN) {
      navigate({ to: '/orders' });
    }
  }, [currentUser, navigate]);

  const handleEdit = (u: UserResponse) => {
    setEditingUser(u);
    setDialogOpen(true);
  };

  const handleDelete = async (u: UserResponse) => {
    if (u.id === currentUser?.id) {
      alert("You can't delete your own account.");
      return;
    }
    if (!window.confirm(`Delete "${u.full_name}"? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync(u.id);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete user');
    }
  };

  const columns: ColumnDef<UserResponse>[] = [
    {
      accessorKey: 'full_name',
      header: 'Name',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.full_name}</p>
          <p className="text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <Badge variant={row.original.role === USER_ROLE.ADMIN ? 'default' : 'neutral'}>
          {row.original.role.toLowerCase()}
        </Badge>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) =>
        row.original.is_active ? (
          <Badge variant="success">active</Badge>
        ) : (
          <Badge variant="neutral">inactive</Badge>
        ),
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => handleEdit(row.original)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDelete(row.original)}
            disabled={deleteMutation.isPending}
            className="hover:bg-destructive/10 hover:text-destructive"
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold leading-tight">Users</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage staff accounts</p>
          </div>
        </div>

        {isLoading && (
          <div className="rounded-xl border bg-card p-6">
            <div className="space-y-3">
              <div className="skeleton h-8 w-32" />
              <div className="skeleton h-4 w-48" />
              <div className="skeleton h-28 w-full" />
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4">
            <p className="text-sm font-medium text-destructive">Failed to load users</p>
          </div>
        )}

        {!isLoading && !error && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <Input
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full max-w-[240px]"
              />
              <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value={USER_ROLE.ADMIN}>Admin</SelectItem>
                  <SelectItem value={USER_ROLE.MANAGER}>Manager</SelectItem>
                  <SelectItem value={USER_ROLE.CUSTOMER}>Customer</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <div className="ml-auto text-sm text-muted-foreground">
                {total} user{total !== 1 ? 's' : ''}
              </div>
              <Button onClick={() => { setEditingUser(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4" />
                New User
              </Button>
            </div>

            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((h) => (
                        <TableHead key={h.id}>
                          {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-[200px] text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-3">
                          <Users className="h-6 w-6" strokeWidth={1.5} />
                          <div>
                            <p className="font-medium text-foreground">No users found</p>
                            <p className="mt-1 text-sm text-muted-foreground">Invite a staff member to manage the admin.</p>
                          </div>
                          <Button onClick={() => { setEditingUser(null); setDialogOpen(true); }}>
                            Invite user
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground tabular-nums">
                Page {page} of {totalPages} · {total} total
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <UserDialog open={dialogOpen} onOpenChange={setDialogOpen} user={editingUser} />
    </DashboardLayout>
  );
}
