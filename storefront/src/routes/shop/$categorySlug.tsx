import { createFileRoute } from '@tanstack/react-router';
import { CatalogPage } from '@/components/catalog/CatalogPage';
import { catalogSearchSchema } from '@/lib/catalog';

export const Route = createFileRoute('/shop/$categorySlug')({
  validateSearch: catalogSearchSchema,
  component: CategoryPage,
});

function CategoryPage() {
  const { categorySlug } = Route.useParams();
  return <CatalogPage query={Route.useSearch()} categorySlug={categorySlug} />;
}
