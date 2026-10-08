import { createFileRoute } from '@tanstack/react-router';
import { CatalogPage } from '@/components/catalog/CatalogPage';
import { catalogSearchSchema } from '@/lib/catalog';

export const Route = createFileRoute('/shop/')({
  validateSearch: catalogSearchSchema,
  component: ShopPage,
});

function ShopPage() {
  return <CatalogPage query={Route.useSearch()} />;
}
