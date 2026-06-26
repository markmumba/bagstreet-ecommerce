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
  useAdjustStock,
  useStockHistory,
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
  low_stock_threshold: string;
}

interface AdjustForm {
  delta: string;
  reason: 'ADMIN_ADJUSTMENT' | 'RESTOCK';
  note: string;
}

const emptyForm: NewVariantForm = {
  size: '', color: '', stock: '0', price_override: '', low_stock_threshold: '5',
};

const emptyAdjust: AdjustForm = { delta: '', reason: 'ADMIN_ADJUSTMENT', note: '' };

export function VariantsSheet({ open, onOpenChange, product }: VariantsSheetProps) {
  const productId = product?.id ?? '';
  const { data: variants = [], isLoading } = useProductVariants(productId);
  const createMutation = useCreateVariant(productId);
  const updateMutation = useUpdateVariant(productId);
  const deleteMutation = useDeleteVariant(productId);
  const adjustMutation = useAdjustStock(productId);

  const [form, setForm] = useState<NewVariantForm>(emptyForm);
  const [error, setError] = useState('');

  // Adjust stock dialog state
  const [adjustingVariant, setAdjustingVariant] = useState<ProductVariantResponse | null>(null);
  const [adjustForm, setAdjustForm] = useState<AdjustForm>(emptyAdjust);

  // History panel state
  const [historyVariant, setHistoryVariant] = useState<ProductVariantResponse | null>(null);
  const { data: history = [], isLoading: historyLoading } = useStockHistory(
    productId, historyVariant?.id ?? '', !!historyVariant
  );

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
        low_stock_threshold: parseInt(form.low_stock_threshold, 10) || 5,
        price_override: form.price_override ? parseFloat(form.price_override) : undefined,
        is_active: true,
      });
      setForm(emptyForm);
    } catch (err: any) {
      setError(err?.message || 'Failed to create variant');
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

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingVariant) return;
    setError('');
    const delta = parseInt(adjustForm.delta, 10);
    if (isNaN(delta) || delta === 0) {
      setError('Delta must be a non-zero integer');
      return;
    }
    try {
      await adjustMutation.mutateAsync({
        variantId: adjustingVariant.id,
        data: {
          delta,
          reason: adjustForm.reason,
          note: adjustForm.note.trim() || undefined,
        },
      });
      setAdjustingVariant(null);
      setAdjustForm(emptyAdjust);
    } catch (err: any) {
      setError(err?.message || 'Failed to adjust stock');
    }
  };

  const variantLabel = (v: ProductVariantResponse) =>
    [v.size, v.color].filter(Boolean).join(' / ') || v.sku.slice(0, 8);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto px-6">
        <SheetHeader className="pb-4">
          <SheetTitle>{product?.name ?? 'Product'} — Variants</SheetTitle>
          <SheetDescription>
            Manage sizes, colors, stock, and thresholds for each variant.
          </SheetDescription>
        </SheetHeader>

        {error && <p className="text-xs text-destructive mb-2">{error}</p>}

        {/* Stock history panel */}
        {historyVariant && (
          <div className="mb-6 border rounded p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">
                Stock History — {variantLabel(historyVariant)}
              </h4>
              <Button size="sm" variant="ghost" onClick={() => setHistoryVariant(null)}>✕</Button>
            </div>
            {historyLoading && <p className="text-xs text-muted-foreground">Loading...</p>}
            {!historyLoading && history.length === 0 && (
              <p className="text-xs text-muted-foreground">No movements recorded yet.</p>
            )}
            {!historyLoading && history.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground text-left">
                      <th className="py-1 pr-3">Date</th>
                      <th className="py-1 pr-3">Delta</th>
                      <th className="py-1 pr-3">Reason</th>
                      <th className="py-1 pr-3">By</th>
                      <th className="py-1">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((m) => (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="py-1 pr-3 text-muted-foreground whitespace-nowrap">
                          {new Date(m.created_at).toLocaleDateString()}
                        </td>
                        <td className={`py-1 pr-3 font-mono font-medium tabular-nums ${m.delta > 0 ? 'text-[var(--color-success-text)]' : 'text-[var(--color-danger-text)]'}`}>
                          {m.delta > 0 ? `+${m.delta}` : m.delta}
                        </td>
                        <td className="py-1 pr-3">{m.reason.replace(/_/g, ' ')}</td>
                        <td className="py-1 pr-3">{m.created_by_name ?? '—'}</td>
                        <td className="py-1 text-muted-foreground">{m.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Adjust stock form */}
        {adjustingVariant && (
          <div className="mb-6 border rounded p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">
                Adjust Stock — {variantLabel(adjustingVariant)}
                <span className="font-normal text-muted-foreground ml-2">
                  (current: {adjustingVariant.stock})
                </span>
              </h4>
              <Button size="sm" variant="ghost" onClick={() => { setAdjustingVariant(null); setError(''); }}>✕</Button>
            </div>
            <form onSubmit={handleAdjustSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Delta <span className="text-muted-foreground">(+/−)</span></Label>
                  <Input
                    type="number"
                    placeholder="+10 or −5"
                    value={adjustForm.delta}
                    onChange={(e) => setAdjustForm(f => ({ ...f, delta: e.target.value }))}
                    disabled={adjustMutation.isPending}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reason</Label>
                  <select
                    className="w-full h-10 border rounded px-3 text-sm bg-background"
                    value={adjustForm.reason}
                    onChange={(e) => setAdjustForm(f => ({ ...f, reason: e.target.value as AdjustForm['reason'] }))}
                    disabled={adjustMutation.isPending}
                  >
                    <option value="ADMIN_ADJUSTMENT">Admin Adjustment</option>
                    <option value="RESTOCK">Restock</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Note (optional)</Label>
                <Input
                  placeholder="e.g. Damaged units removed"
                  value={adjustForm.note}
                  onChange={(e) => setAdjustForm(f => ({ ...f, note: e.target.value }))}
                  disabled={adjustMutation.isPending}
                />
              </div>
              <Button type="submit" size="sm" disabled={adjustMutation.isPending}>
                {adjustMutation.isPending ? 'Saving...' : 'Apply Adjustment'}
              </Button>
            </form>
          </div>
        )}

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
                  <th className="py-2 pr-3 font-medium">Size/Color</th>
                  <th className="py-2 pr-3 font-medium">Stock</th>
                  <th className="py-2 pr-3 font-medium">Threshold</th>
                  <th className="py-2 pr-3 font-medium">Price</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const threshold = (v as any).low_stock_threshold ?? 5;
                  const isLow = v.stock <= threshold && v.stock > 0;
                  const isOut = v.stock === 0;
                  return (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{v.sku.slice(0, 8)}</td>
                      <td className="py-2 pr-3 text-xs">
                        {[v.size, v.color].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={isOut ? 'text-destructive font-medium' : isLow ? 'text-amber-600 font-medium' : ''}>
                          {v.stock}
                        </span>
                        {isOut && <span className="ml-1 text-xs text-destructive">(out)</span>}
                        {isLow && !isOut && <span className="ml-1 text-xs text-amber-600">(low)</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{threshold}</td>
                      <td className="py-2 pr-3 text-xs">
                        {v.price_override != null
                          ? `KES ${v.price_override.toFixed(2)}`
                          : <span className="text-muted-foreground">default</span>}
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
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => { setAdjustingVariant(v); setAdjustForm(emptyAdjust); setError(''); }}
                          >
                            Adjust
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setHistoryVariant(historyVariant?.id === v.id ? null : v)}
                          >
                            History
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs hover:text-destructive"
                            onClick={() => handleDelete(v)}
                            disabled={deleteMutation.isPending}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold mb-3">Add Variant</h3>
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
            <div className="grid grid-cols-3 gap-3">
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
                <Label htmlFor="v-threshold" className="text-xs">Low stock alert at</Label>
                <Input
                  id="v-threshold"
                  type="number"
                  min="0"
                  value={form.low_stock_threshold}
                  onChange={(e) => setForm(f => ({ ...f, low_stock_threshold: e.target.value }))}
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
                  placeholder="Leave blank = default"
                  value={form.price_override}
                  onChange={(e) => setForm(f => ({ ...f, price_override: e.target.value }))}
                  disabled={createMutation.isPending}
                />
              </div>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding...' : 'Add Variant'}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
