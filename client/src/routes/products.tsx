import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useProducts, useDeleteProduct } from '@/hooks/useProducts';
import { useCategoryOptions } from '@/hooks/useCategories';
import { ProductDialog } from '@/components/products/ProductDialog';
import { ProductsDataTable } from '@/components/products/ProductsDataTable';
import { VariantsSheet } from '@/components/products/VariantsSheet';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import type { ProductResponse, CategoryResponse } from 'shared';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/products')({
  component: ProductsPage,
});

type Product = ProductResponse;

function ProductsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [variantsProduct, setVariantsProduct] = useState<Product | null>(null);
  const [variantsSheetOpen, setVariantsSheetOpen] = useState(false);

  const { data: products, isLoading, error } = useProducts();
  const { data: categories } = useCategoryOptions();
  const deleteMutation = useDeleteProduct();

  const handleCreate = () => {
    setEditingProduct(null);
    setDialogOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setDialogOpen(true);
  };

  const handleOpenVariants = (product: Product) => {
    setVariantsProduct(product);
    setVariantsSheetOpen(true);
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(product.id);
    } catch (error: unknown) {
      const errorMessage = (error as { message?: string })?.message || 'Failed to delete product';
      alert(errorMessage);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories?.find((c: CategoryResponse) => c.id === categoryId);
    return category?.name || 'Unknown';
  };

  const columns: ColumnDef<Product>[] = [
    {
      accessorKey: 'image_url',
      header: 'Image',
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div className="h-12 w-12 overflow-hidden rounded-md bg-muted">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'name',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Name
            <svg
              className="ml-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
          </Button>
        );
      },
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div>
            <div className="font-medium">{product.name}</div>
            <div className="text-xs text-muted-foreground">{product.sku}</div>
          </div>
        );
      },
    },
    {
      accessorKey: 'category_id',
      header: 'Category',
      cell: ({ row }) => {
        const product = row.original;
        return (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            {getCategoryName(product.category_id)}
          </span>
        );
      },
    },
    {
      accessorKey: 'price',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Price
            <svg
              className="ml-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
          </Button>
        );
      },
      cell: ({ row }) => {
        const product = row.original;
        return <div className="font-medium">{formatPrice(product.price)}</div>;
      },
    },
    {
      accessorKey: 'total_stock',
      header: 'Stock',
      cell: ({ row }) => {
        const product = row.original;
        const stockLevel = product.total_stock ?? product.stock;
        let stockColor = 'text-green-600';
        if (stockLevel === 0) {
          stockColor = 'text-red-600';
        } else if (stockLevel < 10) {
          stockColor = 'text-yellow-600';
        }
        return <span className={`font-medium ${stockColor}`}>{stockLevel}</span>;
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => {
        const product = row.original;
        return (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              product.is_active
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {product.is_active ? 'Active' : 'Inactive'}
          </span>
        );
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="-ml-4"
          >
            Created
            <svg
              className="ml-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
              />
            </svg>
          </Button>
        );
      },
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div className="text-sm text-muted-foreground">
            {formatDate(product.created_at)}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenVariants(product)}
            >
              Variants
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleEdit(product)}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(product)}
              disabled={deleteMutation.isPending}
              className="hover:bg-destructive/10 hover:text-destructive"
            >
              Delete
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
            <p className="text-muted-foreground mt-1">
              Manage your product inventory and listings
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center p-12 border rounded-lg">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
              <p className="text-sm text-muted-foreground">Loading products...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 border border-destructive/50 bg-destructive/10 rounded-lg">
            <p className="text-sm font-medium text-destructive">Failed to load products</p>
            <p className="text-sm text-destructive/80 mt-1">
              {(error as { message?: string })?.message || 'An error occurred'}
            </p>
          </div>
        )}

        {!isLoading && !error && products && (
          <ProductsDataTable
            data={products}
            columns={columns}
            onCreateNew={handleCreate}
          />
        )}
      </div>

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editingProduct}
      />

      <VariantsSheet
        open={variantsSheetOpen}
        onOpenChange={setVariantsSheetOpen}
        product={variantsProduct}
      />
    </DashboardLayout>
  );
}
