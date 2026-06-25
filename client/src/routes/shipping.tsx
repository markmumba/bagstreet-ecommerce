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
import { Truck, Pencil, Trash2 } from 'lucide-react';

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
                            <h1 className="text-2xl font-bold">Shipping Locations</h1>
                            <p className="text-sm text-muted-foreground">
                                Manage delivery areas and flat-rate prices
                            </p>
                        </div>
                    </div>
                    <Button onClick={() => { resetForm(); setShowForm(true); }}>
                        + Add Location
                    </Button>
                </div>

                {/* Inline form */}
                {showForm && (
                    <div className="border border-border rounded-lg p-4 bg-card space-y-4">
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
                                    className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
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
                                    className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
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
                    <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
                ) : locations.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">
                        No shipping locations yet. Add one above.
                    </div>
                ) : (
                    <div className="border border-border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Price</th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {locations.map((loc) => (
                                    <tr key={loc.id} className="hover:bg-muted/20 transition-colors">
                                        <td className="px-4 py-3 font-medium">{loc.name}</td>
                                        <td className="px-4 py-3 font-mono">{formatPrice(loc.price)}</td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleToggleActive(loc)}
                                                disabled={updateMutation.isPending}
                                                className="cursor-pointer"
                                            >
                                                <Badge variant={loc.is_active ? 'default' : 'secondary'}>
                                                    {loc.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
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
