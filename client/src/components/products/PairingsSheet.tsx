import { useState } from 'react';
import type { PairedProductSummary, ProductResponse } from 'shared';
import { ArrowDown, ArrowUp, ImageIcon, Plus, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';
import { useProductPairings, useSetProductPairings } from '@/hooks/useRecommendations';
import { useProducts } from '@/hooks/useProducts';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const MAX_PAIRINGS = 4;

interface PairingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductResponse | null;
}

/** "Goes well with": staff picks shown first in "Complete the look" on the product page. */
export function PairingsSheet({ open, onOpenChange, product }: PairingsSheetProps) {
  const productId = open ? product?.id ?? null : null;
  const { data, isLoading, error, refetch } = useProductPairings(productId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto px-4 sm:max-w-lg sm:px-6">
        <SheetHeader className="px-0 pb-2">
          <SheetTitle className="pr-6">Goes well with {product?.name ?? 'this product'}</SheetTitle>
          <SheetDescription>
            Shown first in “Complete the look” on this product’s page, in this order.
          </SheetDescription>
        </SheetHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Loading picks…</p>}
        {error && (
          <div className="space-y-2">
            <ErrorNotice>{errorMessage(error, 'Could not load the picks. Check your connection and try again.')}</ErrorNotice>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
          </div>
        )}
        {product && data && (
          <PairingsEditor
            key={product.id}
            product={product}
            initial={data.pairings}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function toSummary(p: ProductResponse): PairedProductSummary {
  return {
    id: p.id,
    name: p.name,
    image_url: p.image_url,
    is_active: p.is_active,
    in_stock: (p.total_stock ?? p.stock) > 0,
  };
}

function PairingsEditor({
  product, initial, onDone,
}: {
  product: ProductResponse;
  initial: PairedProductSummary[];
  onDone: () => void;
}) {
  const [picks, setPicks] = useState<PairedProductSummary[]>(initial);
  const [search, setSearch] = useState('');
  const [saveError, setSaveError] = useState('');
  const query = useDebouncedValue(search.trim(), 300);
  const saveMutation = useSetProductPairings();

  const results = useProducts({ search: query || undefined, page: 1, limit: 8 });
  const pickedIds = new Set(picks.map((p) => p.id));
  const candidates = (results.data?.items ?? []).filter((p) => p.id !== product.id && !pickedIds.has(p.id));
  const isFull = picks.length >= MAX_PAIRINGS;

  const move = (index: number, delta: -1 | 1) => {
    setPicks((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const remove = (id: string) => setPicks((current) => current.filter((p) => p.id !== id));
  const add = (p: ProductResponse) => {
    if (isFull) return;
    setPicks((current) => [...current, toSummary(p)]);
  };

  const save = async () => {
    setSaveError('');
    try {
      await saveMutation.mutateAsync({ productId: product.id, productIds: picks.map((p) => p.id) });
      toast.success(picks.length ? 'Picks saved' : 'Picks cleared');
      onDone();
    } catch (err) {
      setSaveError(errorMessage(err, 'Could not save the picks. Check your connection and try again.'));
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-6">
      <section aria-labelledby="pairings-current" className="space-y-2">
        <h3 id="pairings-current" className="text-sm font-semibold">
          Chosen ({picks.length} of {MAX_PAIRINGS})
        </h3>
        {picks.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
            No picks yet. The shop fills “Complete the look” from categories that go with this one.
          </p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {picks.map((pick, index) => {
              const note = !pick.is_active ? 'Not shown: hidden' : !pick.in_stock ? 'Not shown: out of stock' : null;
              return (
                <li key={pick.id} className="flex items-center gap-3 px-3 py-2">
                  <Thumb src={pick.image_url} dim={Boolean(note)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{pick.name}</p>
                    {note && <p className="text-xs text-[var(--color-warning-text)]">{note}</p>}
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost" size="sm" className="h-8 w-8 px-0"
                      onClick={() => move(index, -1)} disabled={index === 0}
                      aria-label={`Move ${pick.name} up`} title="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-8 w-8 px-0"
                      onClick={() => move(index, 1)} disabled={index === picks.length - 1}
                      aria-label={`Move ${pick.name} down`} title="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-8 w-8 px-0 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => remove(pick.id)}
                      aria-label={`Remove ${pick.name}`} title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="pairings-add" className="space-y-2">
        <h3 id="pairings-add" className="text-sm font-semibold">Add a product</h3>
        <Label htmlFor="pairings-search" className="sr-only">Search products</Label>
        <Input
          id="pairings-search"
          type="search"
          autoComplete="off"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-describedby="pairings-hint"
        />
        <p id="pairings-hint" className="text-xs text-muted-foreground">
          Up to 4. When fewer are chosen, the shop fills in from categories that go with this one.
        </p>
        {results.isLoading ? (
          <p className="text-sm text-muted-foreground">Searching…</p>
        ) : results.error ? (
          <ErrorNotice>{errorMessage(results.error, 'Could not search products. Check your connection and try again.')}</ErrorNotice>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{query ? `No other products match “${query}”.` : 'No other products to add.'}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {candidates.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                <Thumb src={p.image_url} dim={!p.is_active} />
                <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                <Button
                  variant="outline" size="sm" className="h-8 shrink-0"
                  onClick={() => add(p)} disabled={isFull}
                  aria-label={`Add ${p.name}`}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ErrorNotice>{saveError}</ErrorNotice>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone} disabled={saveMutation.isPending}>Cancel</Button>
        <Button onClick={save} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function Thumb({ src, dim }: { src?: string; dim?: boolean }) {
  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
      {src ? (
        <img src={src} alt="" width={40} height={40} loading="lazy" className={cn('h-full w-full object-cover', dim && 'opacity-60 grayscale')} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <ImageIcon className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
