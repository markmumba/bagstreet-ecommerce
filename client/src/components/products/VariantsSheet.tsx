import { useState } from 'react';
import type { ProductResponse, ProductVariantResponse } from 'shared';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  useProductVariants,
  useCreateVariant,
  useUpdateVariant,
  useDeleteVariant,
} from '@/hooks/useVariants';

interface VariantsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductResponse | null;
}

interface NewVariantForm {
  size: string;
  color: string;
  stock: string;
  price_override: string;
}

const emptyForm: NewVariantForm = { size: '', color: '', stock: '0', price_override: '' };

export function VariantsSheet({ open, onOpenChange, product }: VariantsSheetProps) {
  const productId = product?.id ?? '';
  const { data: variants = [], isLoading } = useProductVariants(productId);
  const createMutation = useCreateVariant(productId);
  const updateMutation = useUpdateVariant(productId);
  const deleteMutation = useDeleteVariant(productId);

  const [form, setForm] = useState<NewVariantForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStock, setEditStock] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.size.trim() && !form.color.trim()) {
      setError('Provide at least a size or color');
      return;
    }
    try {
      await createMutation.mutateAsync({
        size: form.size.trim() || undefined,
        color: form.color.trim() || undefined,
        stock: parseInt(form.stock, 10) || 0,
        price_override: form.price_override ? parseFloat(form.price_override) : undefined,
        is_active: true,
      });
      setForm(emptyForm);
    } catch (err: any) {
      setError(err?.message || 'Failed to create variant');
    }
  };

  const handleStockSave = async (variant: ProductVariantResponse) => {
    try {
      await updateMutation.mutateAsync({
        variantId: variant.id,
        data: { stock: parseInt(editStock, 10) || 0 },
      });
      setEditingId(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to update stock');
    }
  };

  const handleToggleActive = async (variant: ProductVariantResponse) => {
    await updateMutation.mutateAsync({
      variantId: variant.id,
      data: { is_active: !variant.is_active },
    });
  };

  const handleDelete = async (variant: ProductVariantResponse) => {
    if (!window.confirm(`Delete variant SKU ${variant.sku}?`)) return;
    try {
      await deleteMutation.mutateAsync(variant.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete variant');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto px-6">
        <SheetHeader className="pb-4">
          <SheetTitle>{product?.name ?? 'Product'} — Variants</SheetTitle>
          <SheetDescription>
            Manage sizes, colors, and stock for each variant.
          </SheetDescription>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-r-transparent" />
          </div>
        )}

        {!isLoading && variants.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">No variants yet. Add one below.</p>
        )}

        {!isLoading && variants.length > 0 && (
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-left">
                  <th className="py-2 pr-3 font-medium">SKU</th>
                  <th className="py-2 pr-3 font-medium">Size</th>
                  <th className="py-2 pr-3 font-medium">Color</th>
                  <th className="py-2 pr-3 font-medium">Stock</th>
                  <th className="py-2 pr-3 font-medium">Price</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{v.sku.slice(0, 8)}</td>
                    <td className="py-2 pr-3">{v.size ?? '—'}</td>
                    <td className="py-2 pr-3">{v.color ?? '—'}</td>
                    <td className="py-2 pr-3">
                      {editingId === v.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            value={editStock}
                            onChange={(e) => setEditStock(e.target.value)}
                            className="w-16 h-7 text-xs"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleStockSave(v)}
                            disabled={updateMutation.isPending}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setEditingId(null)}
                          >
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="underline underline-offset-2 text-left hover:text-primary"
                          onClick={() => { setEditingId(v.id); setEditStock(String(v.stock)); }}
                        >
                          {v.stock}
                        </button>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {v.price_override != null
                        ? `KES ${v.price_override.toFixed(2)}`
                        : <span className="text-muted-foreground text-xs">default</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        variant={v.is_active ? 'default' : 'secondary'}
                        className="cursor-pointer text-xs"
                        onClick={() => handleToggleActive(v)}
                      >
                        {v.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs hover:text-destructive"
                        onClick={() => handleDelete(v)}
                        disabled={deleteMutation.isPending}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3">Add Variant</h3>
          {error && (
            <p className="text-xs text-destructive mb-2">{error}</p>
          )}
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="v-size" className="text-xs">Size</Label>
                <Input
                  id="v-size"
                  placeholder="38, S, M, One Size..."
                  value={form.size}
                  onChange={(e) => setForm(f => ({ ...f, size: e.target.value }))}
                  disabled={createMutation.isPending}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="v-color" className="text-xs">Color</Label>
                <Input
                  id="v-color"
                  placeholder="Black, Tan..."
                  value={form.color}
                  onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                  disabled={createMutation.isPending}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="v-stock" className="text-xs">Stock <span className="text-destructive">*</span></Label>
                <Input
                  id="v-stock"
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) => setForm(f => ({ ...f, stock: e.target.value }))}
                  disabled={createMutation.isPending}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="v-price" className="text-xs">Price override</Label>
                <Input
                  id="v-price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Leave blank = use product price"
                  value={form.price_override}
                  onChange={(e) => setForm(f => ({ ...f, price_override: e.target.value }))}
                  disabled={createMutation.isPending}
                />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding...' : 'Add Variant'}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
