import { useState } from 'react';
import type { CategoryResponse } from 'shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';
import { useSetCategoryPairings } from '@/hooks/useRecommendations';
import { toast } from '@/lib/toast';

const MAX_CATEGORY_PAIRINGS = 6;

/** Choose the top-level categories that go with `category`. The order they're ticked in is their priority. */
export function CategoryPairingsDialog({
  category, topLevel, current, onClose,
}: {
  category: CategoryResponse | null;
  /** All top-level categories. */
  topLevel: CategoryResponse[];
  /** The category's paired ids, in priority order. */
  current: string[];
  onClose: () => void;
}) {
  return (
    <Dialog open={!!category} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        {category && (
          <PairingsForm key={category.id} category={category} topLevel={topLevel} current={current} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PairingsForm({
  category, topLevel, current, onClose,
}: {
  category: CategoryResponse;
  topLevel: CategoryResponse[];
  current: string[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(current);
  const [error, setError] = useState('');
  const mutation = useSetCategoryPairings();
  const others = topLevel.filter((c) => c.id !== category.id);
  const isFull = selected.length >= MAX_CATEGORY_PAIRINGS;

  const toggle = (id: string, checked: boolean) =>
    setSelected((s) => (checked ? (s.includes(id) ? s : [...s, id]) : s.filter((x) => x !== id)));

  const save = async () => {
    setError('');
    try {
      await mutation.mutateAsync({ category_id: category.id, paired_category_ids: selected });
      toast.success(`Saved what goes with ${category.name}`);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not save. Check your connection and try again.'));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Goes with {category.name}</DialogTitle>
        <DialogDescription>
          Products from these categories fill “Complete the look” when a product has no picks of its own.
        </DialogDescription>
      </DialogHeader>

      {others.length === 0 ? (
        <p className="text-sm text-muted-foreground">There are no other top-level categories yet.</p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-xs text-muted-foreground">
            Up to {MAX_CATEGORY_PAIRINGS}. The order you tick them in is the order they’re used.
          </legend>
          {others.map((c) => {
            const position = selected.indexOf(c.id);
            const checked = position >= 0;
            const inputId = `pair-${c.id}`;
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                <input
                  type="checkbox"
                  id={inputId}
                  checked={checked}
                  disabled={!checked && isFull}
                  onChange={(e) => toggle(c.id, e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <label htmlFor={inputId} className="min-w-0 flex-1 truncate text-sm">{c.name}</label>
                {checked && (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                    <span className="sr-only">Priority </span>{position + 1}
                  </span>
                )}
              </div>
            );
          })}
        </fieldset>
      )}

      <ErrorNotice>{error}</ErrorNotice>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
        <Button onClick={save} disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save'}</Button>
      </DialogFooter>
    </>
  );
}
