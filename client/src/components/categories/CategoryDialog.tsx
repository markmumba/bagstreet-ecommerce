import { useState, useEffect } from 'react';
import type { CategoryResponse } from 'shared';
import { useCreateCategory, useUpdateCategory, useCategoryOptions } from '@/hooks/useCategories';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CategoryResponse | null;
}

export function CategoryDialog({ open, onOpenChange, category }: CategoryDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [saveError, setSaveError] = useState('');

  const createMutation = useCreateCategory();
  const updateMutation = useUpdateCategory();
  const { data: allCategories } = useCategoryOptions();

  const isEditing = !!category;
  const isLoading = createMutation.isPending || updateMutation.isPending;

  // Only allow top-level categories as parents (parent_id == null), exclude self
  const parentOptions = (allCategories ?? []).filter(
    (cat) => cat.parent_id == null && cat.id !== category?.id
  );

  useEffect(() => {
    setSaveError('');
    if (category) {
      setName(category.name);
      setDescription(category.description || '');
      setParentId(category.parent_id != null ? String(category.parent_id) : 'none');
    } else {
      setName('');
      setDescription('');
      setParentId('none');
    }
  }, [category, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    setSaveError('');
    e.preventDefault();

    const data = {
      name: name.trim(),
      description: description.trim(),
      parent_id: parentId && parentId !== 'none' ? parseInt(parentId, 10) : null,
    };

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: category.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }

      setName('');
      setDescription('');
      setParentId('none');
      onOpenChange(false);
    } catch (error) {
      setSaveError(errorMessage(error, 'The category could not be saved. Check the name and try again.'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {isEditing ? 'Edit Category' : 'Create Category'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the category details below.'
              : 'Add a new category to organize your products.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Handbags"
              required
              maxLength={100}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent">Parent category</Label>
            <Select
              value={parentId}
              onValueChange={setParentId}
              disabled={isLoading}
            >
              <SelectTrigger id="parent">
                <SelectValue placeholder="None (top-level)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (top-level)</SelectItem>
                {parentOptions.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this category…"
              rows={4}
              maxLength={500}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/500 characters
            </p>
          </div>

          <ErrorNotice>{saveError}</ErrorNotice>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? 'Saving…' : isEditing ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
