import { Link } from '@tanstack/react-router';
import type { CategoryTreeNode } from 'shared';
import { useStorefrontHome } from '@/hooks/useStorefrontHome';
import { CUSTOMER_CARE_LINKS, SHOP_INFO } from '@/lib/shop-info';

export function Footer() {
  const homeQuery = useStorefrontHome({ limit: 48 });
  const tree = (homeQuery.data?.data?.category_tree as CategoryTreeNode[]) ?? [];

  return (
    <footer className="border-t border-border-subtle">
      <div className="max-w-[1440px] mx-auto grid grid-cols-2 gap-x-6 gap-y-12 px-4 py-16 sm:px-8 lg:grid-cols-12 lg:px-20 lg:py-20">
        <div className="col-span-2 lg:col-span-4">
          <Link to="/" className="text-2xl tracking-[0.25em] uppercase font-light" style={{ fontFamily: 'var(--font-display)' }}>
            Bagstreet
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-foreground-muted">
            Luxury handbags, shoes and silk — curated for the modern woman.
          </p>
        </div>

        <FooterColumn title="Shop" className="lg:col-span-2">
          {tree.map((node) => (
            <li key={node.id}>
              <Link to="/shop/$categorySlug" params={{ categorySlug: node.slug }} className="hover:text-brass-text">{node.name}</Link>
            </li>
          ))}
          <li><Link to="/shop" className="hover:text-brass-text">Shop all</Link></li>
        </FooterColumn>

        <FooterColumn title="Account" className="lg:col-span-2">
          <li><Link to="/account" className="hover:text-brass-text">My account</Link></li>
          <li><Link to="/orders" className="hover:text-brass-text">Orders</Link></li>
          <li><Link to="/cart" className="hover:text-brass-text">Shopping bag</Link></li>
        </FooterColumn>

        <FooterColumn title="Customer care" className="col-span-2 lg:col-span-4">
          {CUSTOMER_CARE_LINKS.map(({ to, label }) => (
            <li key={to}><Link to={to} className="hover:text-brass-text">{label}</Link></li>
          ))}
          <li><a href={SHOP_INFO.whatsappUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brass-text">WhatsApp {SHOP_INFO.phone}</a></li>
          <li><a href={`mailto:${SHOP_INFO.email}`} className="break-all hover:text-brass-text">{SHOP_INFO.email}</a></li>
        </FooterColumn>
      </div>

      <div className="border-t border-border-subtle">
        <p className="max-w-[1440px] mx-auto px-4 py-6 text-label-caps text-foreground-faint sm:px-8 lg:px-20">
          © {new Date().getFullYear()} Bagstreet — Luxury Handbags &amp; Accessories
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, className = '', children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <p className="text-label-caps text-foreground-faint">{title}</p>
      <ul className="mt-5 space-y-3 text-sm">{children}</ul>
    </div>
  );
}
