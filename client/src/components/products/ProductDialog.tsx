import { useState, useEffect, useRef } from 'react';
import type { ProductResponse } from 'shared';
import { ImageIcon, Plus, Star, X } from 'lucide-react';
import { useCreateProduct, useUpdateProduct, useUpdateProductForm } from '@/hooks/useProducts';
import { useCategoryTree } from '@/hooks/useCategories';
import type { CategoryTreeNode } from 'shared';
import { cn } from '@/lib/utils';
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

type Product = ProductResponse;

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
}

const maxImageSizeMb = 15;
const maxImageCount = 8;
const maxImageSizeBytes = maxImageSizeMb * 1024 * 1024;

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function ProductDialog({ open, onOpenChange, product }: ProductDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [imageError, setImageError] = useState('');
  const [isActive, setIsActive] = useState(true);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

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
      setImageFiles([]);
      setImageInputKey((key) => key + 1);
      setImageError('');
      setIsActive(product.is_active);
    } else {
      setName('');
      setDescription('');
      setPrice('');
      setCategoryId('');
      setImageFiles([]);
      setImageInputKey((key) => key + 1);
      setImageError('');
      setIsActive(true);
    }
  }, [product, open]);

  useEffect(() => {
    const urls = imageFiles.map((file) => URL.createObjectURL(file));
    setImagePreviewUrls(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imageFiles]);

  const clearSelectedImages = () => {
    setImageFiles([]);
    setImageInputKey((key) => key + 1);
  };

  const handleImageChange = (files: FileList | null) => {
    setImageError('');
    const incomingFiles = Array.from(files ?? []);

    if (incomingFiles.length === 0) {
      return;
    }

    const duplicateKeys = new Set(imageFiles.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
    const nextFiles = incomingFiles.filter((file) => !duplicateKeys.has(`${file.name}-${file.size}-${file.lastModified}`));

    if (nextFiles.length === 0) {
      setImageInputKey((key) => key + 1);
      return;
    }

    const remainingSlots = maxImageCount - imageFiles.length;
    if (nextFiles.length > remainingSlots) {
      setImageInputKey((key) => key + 1);
      setImageError(
        remainingSlots > 0
          ? `You can add ${remainingSlots} more image${remainingSlots === 1 ? '' : 's'}.`
          : `Choose up to ${maxImageCount} product images.`
      );
      return;
    }

    const oversizedFile = nextFiles.find((file) => file.size > maxImageSizeBytes);
    if (oversizedFile) {
      setImageInputKey((key) => key + 1);
      setImageError(`Image must be ${maxImageSizeMb}MB or smaller.`);
      return;
    }

    setImageFiles((currentFiles) => [...currentFiles, ...nextFiles]);
    setImageInputKey((key) => key + 1);
  };

  const removeSelectedImage = (indexToRemove: number) => {
    setImageFiles((files) => {
      const nextFiles = files.filter((_, index) => index !== indexToRemove);
      if (nextFiles.length === 0) setImageInputKey((key) => key + 1);
      return nextFiles;
    });
  };

  const makePrimaryImage = (primaryIndex: number) => {
    setImageFiles((files) => {
      const selected = files[primaryIndex];
      if (!selected) return files;
      return [selected, ...files.filter((_, index) => index !== primaryIndex)];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isEditing && imageFiles.length === 0) {
      setImageError('Add at least one product image.');
      return;
    }

    try {
      if (isEditing) {
        if (imageFiles.length > 0) {
          // Image selected: use multipart update.
          const formData = new FormData();
          formData.append('name', name.trim());
          formData.append('description', description.trim());
          formData.append('price', price);
          formData.append('is_active', String(isActive));
          imageFiles.forEach((file) => formData.append('image_files', file));
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
        imageFiles.forEach((file) => formData.append('image_files', file));
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
    clearSelectedImages();
    setImageError('');
    setIsActive(true);
  };

  const submitLabel = isLoading
    ? imageFiles.length > 0
      ? imageFiles.length === 1 ? 'Optimizing image...' : 'Optimizing images...'
      : 'Saving...'
    : isEditing
      ? 'Update'
      : 'Create';
  const canAddImages = imageFiles.length < maxImageCount;

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

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="imageFile">
                Product images {!isEditing && <span className="text-destructive">*</span>}
              </Label>
              <p className="text-xs text-muted-foreground">
                Add up to {maxImageCount} images. The first image is used as the main product image.
                {isEditing ? ' Selecting new images replaces the current gallery.' : ''}
              </p>
            </div>

            {isEditing && (product?.images?.length || product?.image_url) && imageFiles.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Current gallery</p>
                <div className="flex gap-2 overflow-x-auto rounded-lg border bg-muted/30 p-2">
                  {(product.images?.length ? product.images : [{ id: 'primary', url: product.image_url }]).map((image, index) => (
                    <div key={image.id} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <img src={image.url} alt={product.name} className="h-full w-full object-cover" />
                      {index === 0 && (
                        <span className="absolute left-1.5 top-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                          Main
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Input
                ref={imageInputRef}
                key={imageInputKey}
                id="imageFile"
                type="file"
                accept="image/jpeg,image/png,image/jpg,image/webp,image/heic,image/heif"
                multiple
                onChange={(e) => handleImageChange(e.target.files)}
                className="sr-only"
                disabled={isLoading || !canAddImages}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => imageInputRef.current?.click()}
                disabled={isLoading || !canAddImages}
              >
                <Plus className="h-4 w-4" strokeWidth={1.8} />
                {imageFiles.length > 0 ? 'Add images' : 'Choose images'}
              </Button>
              <p className="text-xs text-muted-foreground">
                {imageFiles.length}/{maxImageCount} selected
              </p>
            </div>

            {imageFiles.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {imageFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className={cn(
                      'group relative overflow-hidden rounded-lg border bg-background',
                      index === 0 && 'border-primary shadow-sm'
                    )}
                  >
                    <div className="aspect-square bg-muted">
                      {imagePreviewUrls[index] ? (
                        <img
                          src={imagePreviewUrls[index]}
                          alt={file.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="h-5 w-5" strokeWidth={1.7} />
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeSelectedImage(index)}
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-background/95 text-muted-foreground shadow-sm transition hover:text-destructive"
                      aria-label={`Remove ${file.name}`}
                      disabled={isLoading}
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.9} />
                    </button>

                    {index === 0 ? (
                      <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
                        <Star className="h-3 w-3 fill-current" strokeWidth={1.7} />
                        Main
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => makePrimaryImage(index)}
                        className="absolute left-1.5 top-1.5 rounded-md bg-background/95 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground opacity-0 shadow-sm transition hover:text-foreground group-hover:opacity-100 focus:opacity-100"
                        disabled={isLoading}
                      >
                        Make main
                      </button>
                    )}

                    <div className="space-y-0.5 p-2">
                      <p className="truncate text-xs font-medium text-foreground" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {imageError && <p className="text-xs text-destructive">{imageError}</p>}
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
              disabled={isLoading || !!imageError || !name.trim() || !price || (!isEditing && (!categoryId || imageFiles.length === 0))}
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
