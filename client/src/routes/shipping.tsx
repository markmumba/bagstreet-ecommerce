import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    useShippingLocations,
    useCreateShippingLocation,
    useUpdateShippingLocation,
    useDeleteShippingLocation,
} from '@/hooks/useShipping';
import type { ShippingLocationResponse } from 'shared';
import { Plus, Truck, Pencil, Trash2 } from 'lucide-react';

export const Route = createFileRoute('/shipping')({
    component: ShippingPage,
});

function formatPrice(price: number) {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(price);
}

function ShippingPage() {
    const { data: locations = [], isLoading } = useShippingLocations();
    const createMutation = useCreateShippingLocation();
    const updateMutation = useUpdateShippingLocation();
    const deleteMutation = useDeleteShippingLocation();

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', price: '', is_active: true });
    const [formError, setFormError] = useState('');

    const resetForm = () => {
        setForm({ name: '', price: '', is_active: true });
        setFormError('');
        setEditingId(null);
        setShowForm(false);
    };

    const startEdit = (loc: ShippingLocationResponse) => {
        setForm({ name: loc.name, price: String(loc.price), is_active: loc.is_active });
        setEditingId(loc.id);
        setShowForm(true);
        setFormError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const price = parseFloat(form.price);
        if (!form.name.trim()) { setFormError('Name is required'); return; }
        if (isNaN(price) || price < 0) { setFormError('Price must be a non-negative number'); return; }

        try {
            if (editingId) {
                await updateMutation.mutateAsync({ id: editingId, data: { name: form.name, price, is_active: form.is_active } });
            } else {
                await createMutation.mutateAsync({ name: form.name, price, is_active: form.is_active });
            }
            resetForm();
        } catch (err: any) {
            setFormError(err?.message ?? 'Failed to save');
        }
    };

    const handleDelete = async (loc: ShippingLocationResponse) => {
        if (!window.confirm(`Delete "${loc.name}"? This cannot be undone.`)) return;
        try {
            await deleteMutation.mutateAsync(loc.id);
        } catch (err: any) {
            alert(err?.message ?? 'Failed to delete');
        }
    };

    const handleToggleActive = async (loc: ShippingLocationResponse) => {
        try {
            await updateMutation.mutateAsync({ id: loc.id, data: { is_active: !loc.is_active } });
        } catch (err: any) {
            alert(err?.message ?? 'Failed to update');
        }
    };

    return (
        <DashboardLayout>
            <div className="p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Truck className="h-6 w-6 text-muted-foreground" />
                        <div>
                            <h1 className="text-2xl font-semibold leading-tight">Shipping Locations</h1>
                            <p className="text-sm text-muted-foreground">
                                Manage delivery areas and flat-rate prices
                            </p>
                        </div>
                    </div>
                    <Button onClick={() => { resetForm(); setShowForm(true); }}>
                        <Plus className="h-4 w-4" />
                        Add Location
                    </Button>
                </div>

                {/* Inline form */}
                {showForm && (
                    <div className="space-y-4 rounded-xl border border-border bg-card p-5">
                        <h2 className="font-semibold text-sm">
                            {editingId ? 'Edit Location' : 'New Location'}
                        </h2>
                        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-xs font-medium mb-1">Name</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                    placeholder="Nairobi CBD"
                                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/15"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Price (KES)</label>
                                <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={form.price}
                                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                                    placeholder="150"
                                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm tabular-nums focus:outline-none focus:ring-[3px] focus:ring-ring/15"
                                    required
                                />
                            </div>
                            <div className="flex items-end gap-2">
                                <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
                                    <input
                                        type="checkbox"
                                        checked={form.is_active}
                                        onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                                    />
                                    Active
                                </label>
                            </div>
                            {formError && (
                                <p className="col-span-full text-xs text-destructive">{formError}</p>
                            )}
                            <div className="col-span-full flex gap-2">
                                <Button
                                    type="submit"
                                    disabled={createMutation.isPending || updateMutation.isPending}
                                >
                                    {editingId ? 'Update' : 'Create'}
                                </Button>
                                <Button type="button" variant="outline" onClick={resetForm}>
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Table */}
                {isLoading ? (
                    <div className="rounded-xl border bg-card p-6">
                        <div className="space-y-3">
                            <div className="skeleton h-8 w-36" />
                            <div className="skeleton h-4 w-52" />
                            <div className="skeleton h-28 w-full" />
                        </div>
                    </div>
                ) : locations.length === 0 ? (
                    <div className="flex h-[200px] flex-col items-center justify-center gap-3 rounded-xl border bg-card text-sm text-muted-foreground">
                        <Truck className="h-6 w-6" strokeWidth={1.5} />
                        <div className="text-center">
                            <p className="font-medium text-foreground">No shipping locations yet</p>
                            <p className="mt-1">Add a delivery area and flat-rate price.</p>
                        </div>
                        <Button onClick={() => { resetForm(); setShowForm(true); }}>Add location</Button>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                        <table className="w-full text-[13px]">
                            <thead className="sticky top-0 z-10 bg-card">
                                <tr>
                                    <th className="table-header px-4 py-2.5 text-left">Name</th>
                                    <th className="table-header px-4 py-2.5 text-right">Price</th>
                                    <th className="table-header px-4 py-2.5 text-left">Status</th>
                                    <th className="table-header px-4 py-2.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {locations.map((loc) => (
                                    <tr key={loc.id} className="transition-colors hover:bg-[var(--color-bg-hover)]">
                                        <td className="px-4 py-2.5 font-medium">{loc.name}</td>
                                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatPrice(loc.price)}</td>
                                        <td className="px-4 py-2.5">
                                            <button
                                                onClick={() => handleToggleActive(loc)}
                                                disabled={updateMutation.isPending}
                                                className="cursor-pointer"
                                            >
                                                <Badge variant={loc.is_active ? 'success' : 'neutral'}>
                                                    {loc.is_active ? 'active' : 'inactive'}
                                                </Badge>
                                            </button>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => startEdit(loc)}
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDelete(loc)}
                                                    disabled={deleteMutation.isPending}
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
