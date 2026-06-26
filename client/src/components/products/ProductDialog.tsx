import { useState, useEffect } from 'react';
import type { ProductResponse } from 'shared';

type Product = ProductResponse;
import { useCreateProduct, useUpdateProduct, useUpdateProductForm } from '@/hooks/useProducts';
import { useCategoryTree } from '@/hooks/useCategories';
import type { CategoryTreeNode } from 'shared';
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

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
}

export function ProductDialog({ open, onOpenChange, product }: ProductDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isActive, setIsActive] = useState(true);

  const { data: categoryTree } = useCategoryTree();
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();
  const updateFormMutation = useUpdateProductForm();

  const isEditing = !!product;
  const isLoading = createMutation.isPending || updateMutation.isPending || updateFormMutation.isPending;

  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description || '');
      setPrice(product.price.toString());
      setCategoryId(product.category_id?.toString() || '');
      setImageFile(null);
      setIsActive(product.is_active);
    } else {
      setName('');
      setDescription('');
      setPrice('');
      setCategoryId('');
      setImageFile(null);
      setIsActive(true);
    }
  }, [product, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isEditing) {
        if (imageFile) {
          // Image selected — use multipart update
          const formData = new FormData();
          formData.append('name', name.trim());
          formData.append('description', description.trim());
          formData.append('price', price);
          formData.append('is_active', String(isActive));
          formData.append('image_file', imageFile);
          await updateFormMutation.mutateAsync({ id: product.id, data: formData });
        } else {
          await updateMutation.mutateAsync({
            id: product.id,
            data: { name: name.trim(), description: description.trim(), price: parseFloat(price), is_active: isActive },
          });
        }
      } else {
        const formData = new FormData();
        formData.append('name', name.trim());
        formData.append('description', description.trim());
        formData.append('price', price);
        formData.append('stock', '0');
        formData.append('category_id', categoryId);
        formData.append('is_active', String(isActive));
        if (imageFile) formData.append('image_file', imageFile);
        await createMutation.mutateAsync(formData);
      }

      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save product:', error);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setPrice('');
    setCategoryId('');
    setImageFile(null);
    setIsActive(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {isEditing ? 'Edit Product' : 'Create Product'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the product details below.'
              : 'Add a new product to your inventory.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product name"
                required
                maxLength={200}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={categoryId}
                onValueChange={setCategoryId}
                disabled={isLoading || isEditing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {(categoryTree ?? []).map((parent: CategoryTreeNode) => (
                    parent.children.length > 0 ? (
                      <div key={parent.id}>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {parent.name}
                        </div>
                        {parent.children.map((child) => (
                          <SelectItem key={child.id} value={child.id}>
                            › {child.name}
                          </SelectItem>
                        ))}
                      </div>
                    ) : (
                      <SelectItem key={parent.id} value={parent.id}>
                        {parent.name}
                      </SelectItem>
                    )
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this product..."
              rows={3}
              maxLength={1000}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/1000 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">
              Price <span className="text-destructive">*</span>
            </Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
              <Label htmlFor="imageFile">
                Image {!isEditing && <span className="text-destructive">*</span>}
                {isEditing && <span className="text-muted-foreground font-normal"> (leave blank to keep current)</span>}
              </Label>
              {isEditing && product?.image_url && !imageFile && (
                <div className="h-16 w-16 overflow-hidden rounded-md bg-muted">
                  <img src={product.image_url} alt="Current" className="h-full w-full object-cover" />
                </div>
              )}
              <Input
                id="imageFile"
                type="file"
                accept="image/jpeg,image/png,image/jpg,image/webp"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                required={!isEditing}
                disabled={isLoading}
              />
              {imageFile && (
                <p className="text-xs text-muted-foreground">{imageFile.name}</p>
              )}
            </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={isLoading}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="isActive" className="font-normal">
              Product is active and available for sale
            </Label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !name.trim() || !price || (!isEditing && !categoryId)}
            >
              {isLoading ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
