import { createFileRoute } from '@tanstack/react-router';
import { useState, useTransition } from 'react';
import { useCategories, useDeleteCategory } from '@/hooks/useCategories';
import { CategoryDialog } from '@/components/categories/CategoryDialog';
import type { Category } from 'shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const Route = createFileRoute('/categories')({
  component: CategoriesPage,
});

function CategoriesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [, startTransition] = useTransition();

  const { data: categories, isLoading, error } = useCategories(debouncedSearch);
  const deleteMutation = useDeleteCategory();

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    startTransition(() => {
      setDebouncedSearch(value);
    });
  };

  const handleCreate = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  const handleDelete = async (category: Category) => {
    if (!window.confirm(`Delete "${category.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(category.id);
    } catch (error: unknown) {
      const errorMessage = (error as { message?: string })?.message || 'Failed to delete category';
      alert(errorMessage);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-slate-50">
      {/* Hero Header with Editorial Style */}
      <div className="border-b border-slate-200 bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-12">
          <div className="max-w-4xl">
            <h1 className="text-6xl font-light tracking-tight text-slate-900 mb-3">
              Categories
            </h1>
            <p className="text-lg text-slate-600 font-light leading-relaxed">
              Organize your inventory with curated collections. Create, manage, and refine
              categories that bring structure to your catalog.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-10">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Input
                type="search"
                placeholder="Search categories..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10 h-11 border-slate-300 focus-visible:ring-slate-400"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            <Button
              onClick={handleCreate}
              size="lg"
              className="bg-slate-900 hover:bg-slate-800 text-white shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <svg
                className="mr-2 h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Category
            </Button>
          </div>

          {/* Loading State */}
          {isLoading && (
            <Card className="p-12 text-center border-slate-200">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-slate-900 border-r-transparent mb-4"></div>
              <p className="text-slate-600 font-light">Loading categories...</p>
            </Card>
          )}

          {/* Error State */}
          {error && (
            <Card className="p-8 border-red-200 bg-red-50">
              <p className="text-red-800 font-medium">Failed to load categories</p>
              <p className="text-red-600 text-sm mt-1">
                {(error as { message?: string })?.message || 'An error occurred'}
              </p>
            </Card>
          )}

          {/* Empty State */}
          {!isLoading && !error && (!categories || categories.length === 0) && (
            <Card className="p-16 text-center border-slate-200">
              <div className="max-w-md mx-auto">
                <div className="mb-6 text-slate-300">
                  <svg
                    className="mx-auto h-20 w-20"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-light text-slate-900 mb-2">
                  {debouncedSearch ? 'No categories found' : 'No categories yet'}
                </h3>
                <p className="text-slate-600 mb-6 font-light">
                  {debouncedSearch
                    ? 'Try adjusting your search term'
                    : 'Get started by creating your first category'}
                </p>
                {!debouncedSearch && (
                  <Button onClick={handleCreate} variant="outline" size="lg">
                    Create Category
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Categories Table */}
          {!isLoading && !error && categories && categories.length > 0 && (
            <Card className="overflow-hidden border-slate-200 shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 bg-slate-50/50">
                    <TableHead className="font-medium text-slate-700">Name</TableHead>
                    <TableHead className="font-medium text-slate-700">Description</TableHead>
                    <TableHead className="font-medium text-slate-700">Created</TableHead>
                    <TableHead className="text-right font-medium text-slate-700">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category: Category) => (
                    <TableRow
                      key={category.id}
                      className="border-slate-100 hover:bg-slate-50/50 transition-colors"
                    >
                      <TableCell className="font-medium text-slate-900">
                        {category.name}
                      </TableCell>
                      <TableCell className="text-slate-600 max-w-md">
                        {category.description || (
                          <span className="italic text-slate-400">No description</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500 text-sm">
                        {formatDate(category.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(category)}
                            className="hover:bg-slate-100"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(category)}
                            disabled={deleteMutation.isPending}
                            className="hover:bg-red-50 hover:text-red-600"
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Results Count */}
          {!isLoading && categories && categories.length > 0 && (
            <div className="text-center">
              <Badge variant="secondary" className="text-slate-600 font-light">
                {categories.length} {categories.length === 1 ? 'category' : 'categories'}
                {debouncedSearch && ` matching "${debouncedSearch}"`}
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/* Dialog */}
      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editingCategory}
      />
    </div>
  );
}
