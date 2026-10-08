import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { ShoppingBag, User, Package, Search, X, Menu } from 'lucide-react';
import type { CategoryTreeNode, ProductResponse } from 'shared';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/hooks/useCart';
import { useStorefrontHome } from '@/hooks/useStorefrontHome';
import { categoryImage } from '@/lib/format';
import { Placeholder } from '@/components/product/Placeholder';
import { useEffect, useRef, useState } from 'react';

export function Navbar() {
  const { user } = useAuth();
  const { data: cart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const liveSearchStartedRef = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Same query (and cache entry) as the homepage's default view.
  const homeQuery = useStorefrontHome({ limit: 48 });
  const tree = (homeQuery.data?.data?.category_tree as CategoryTreeNode[]) ?? [];
  const menuProducts = [
    ...((homeQuery.data?.data?.featured_products as ProductResponse[]) ?? []),
    ...((homeQuery.data?.data?.products as ProductResponse[]) ?? []),
  ];

  const itemCount = cart?.data?.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) ?? 0;
  const cartLabel = itemCount > 0 ? `Cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : 'Cart';
  const currentRouteSearch = typeof (location.search as Record<string, unknown>).search === 'string'
    ? ((location.search as Record<string, unknown>).search as string)
    : '';
  const currentCategory = (location.search as Record<string, unknown>).category;

  // Over the homepage hero the bar is transparent with light type until scrolled or a menu opens.
  const overHero = location.pathname === '/' && !currentRouteSearch && !currentCategory
    && !scrolled && !activeMenu && !mobileOpen && !searchOpen;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menus whenever the route or its params change.
  useEffect(() => {
    setActiveMenu(null);
    setMobileOpen(false);
  }, [location.pathname, location.searchStr]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [mobileOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  const openSearch = () => {
    const initialSearch = location.pathname.startsWith('/shop') ? currentRouteSearch : '';
    liveSearchStartedRef.current = initialSearch.trim().length > 0;
    setSearchValue(initialSearch);
    setSearchOpen(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSearchOpen(false);
      setActiveMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;

    const nextSearch = searchValue.trim();
    if (nextSearch) liveSearchStartedRef.current = true;
    if (!nextSearch && !liveSearchStartedRef.current && currentRouteSearch === '') return;

    const timer = window.setTimeout(() => {
      if (location.pathname === '/shop' && currentRouteSearch === nextSearch) return;
      navigate({
        to: '/shop',
        search: nextSearch ? { search: nextSearch } : {},
        replace: true,
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchValue, searchOpen, currentRouteSearch, location.pathname, navigate]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const nextSearch = searchValue.trim();
    setSearchOpen(false);
    navigate({ to: '/shop', search: nextSearch ? { search: nextSearch } : {}, replace: true });
  };

  const linkTone = overHero ? 'text-background/85 hover:text-background' : 'text-foreground-muted hover:text-foreground';
  const activeTree = tree.find((node) => node.id === activeMenu);

  return (
    <>
    <header
      ref={headerRef}
      onMouseLeave={() => setActiveMenu(null)}
      className={`fixed top-0 left-0 right-0 z-50 h-[72px] border-b transition-colors duration-300 ${
        overHero
          ? 'border-transparent bg-transparent text-background'
          : 'border-border-subtle bg-background/95 text-foreground backdrop-blur-sm'
      }`}
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-20 h-full">
        {/* Search overlay */}
        {searchOpen && (
          <form onSubmit={submitSearch} className="absolute inset-0 flex items-center px-4 sm:px-8 lg:px-20 bg-background/95 backdrop-blur-sm z-10">
            <Search strokeWidth={1} className="h-4 w-4 text-foreground-faint flex-shrink-0 mr-3" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchValue}
              maxLength={200}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search products..."
              aria-label="Search products"
              className="flex-1 bg-transparent border-0 text-sm font-light text-foreground placeholder:text-foreground-faint focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="ml-4 text-foreground-faint hover:text-foreground transition-colors"
              aria-label="Close search"
            >
              <X strokeWidth={1} className="h-5 w-5" aria-hidden="true" />
            </button>
          </form>
        )}

        <div className="grid h-full grid-cols-[1fr_auto_1fr] items-center">
          {/* Left: categories (desktop) / menu toggle (mobile) */}
          <nav aria-label="Primary" className="flex items-center">
            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              className={`-ml-2 p-2 lg:hidden ${linkTone}`}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen
                ? <X strokeWidth={1} className="h-5 w-5" aria-hidden="true" />
                : <Menu strokeWidth={1} className="h-5 w-5" aria-hidden="true" />}
            </button>

            <ul className="hidden lg:flex items-center gap-6 xl:gap-9">
              {tree.map((node) => (
                <li key={node.id} onMouseEnter={() => setActiveMenu(node.id)}>
                  <Link
                    to="/shop/$categorySlug"
                    params={{ categorySlug: node.slug }}
                    onFocus={() => setActiveMenu(node.id)}
                    aria-expanded={node.children.length > 0 ? activeMenu === node.id : undefined}
                    className={`relative flex whitespace-nowrap py-7 text-label-caps transition-colors duration-200 ${linkTone}
                      after:absolute after:inset-x-0 after:bottom-6 after:h-px after:origin-left after:bg-current after:transition-transform after:duration-300
                      ${activeMenu === node.id ? 'after:scale-x-100' : 'after:scale-x-0'}`}
                  >
                    {node.name}
                  </Link>
                </li>
              ))}
              <li onMouseEnter={() => setActiveMenu(null)} className="hidden xl:block">
                <Link to="/shop" className={`whitespace-nowrap py-7 text-label-caps transition-colors duration-200 ${linkTone}`}>
                  Shop all
                </Link>
              </li>
            </ul>
          </nav>

          {/* Brand */}
          <Link to="/" className="justify-self-center">
            <span
              className="text-[22px] tracking-[0.25em] uppercase font-light lg:text-2xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Bagstreet
            </span>
          </Link>

          {/* Right icons */}
          <div className="flex items-center justify-end gap-4 sm:gap-6">
            <button
              onClick={openSearch}
              className={`transition-colors duration-200 ${linkTone}`}
              title="Search"
              aria-label="Search products"
            >
              <Search strokeWidth={1} className="h-5 w-5" aria-hidden="true" />
            </button>

            {user && (
              <Link
                to="/orders"
                className={`hidden sm:block transition-colors duration-200 ${linkTone}`}
                title="My orders"
                aria-label="My orders"
              >
                <Package strokeWidth={1} className="h-5 w-5" aria-hidden="true" />
              </Link>
            )}

            {user ? (
              <Link
                to="/account"
                className={`hidden sm:block text-label-caps transition-colors duration-200 ${linkTone}`}
                title="My account"
              >
                {user.full_name.split(' ')[0]}
              </Link>
            ) : (
              <Link
                to="/login"
                className={`hidden sm:block transition-colors duration-200 ${linkTone}`}
                title="Sign in"
                aria-label="Sign in"
              >
                <User strokeWidth={1} className="h-5 w-5" aria-hidden="true" />
              </Link>
            )}

            <Link
              to="/cart"
              className={`relative flex items-center gap-1.5 transition-colors duration-200 ${linkTone}`}
              aria-label={cartLabel}
            >
              <ShoppingBag strokeWidth={1} className="h-5 w-5" aria-hidden="true" />
              {itemCount > 0 && (
                <span className="text-[12px] tabular-nums">{itemCount > 99 ? '99+' : itemCount}</span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* Desktop mega menu */}
      {activeTree && (activeTree.children.length > 0 || categoryImage(activeTree, menuProducts)) && (
        <MegaMenu node={activeTree} image={categoryImage(activeTree, menuProducts)} />
      )}
    </header>

    {/* Dim the page while the mega menu is open */}
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-40 bg-espresso/15 transition-opacity duration-500 ${
        activeMenu ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    />

    <MobileMenu open={mobileOpen} tree={tree} signedIn={!!user} />
    </>
  );
}

function MegaMenu({ node, image }: { node: CategoryTreeNode; image?: string }) {
  return (
    <div className="absolute inset-x-0 top-full hidden lg:block border-b border-border-subtle bg-background text-foreground animate-in fade-in duration-300">
      <div className="max-w-[1440px] mx-auto grid grid-cols-12 gap-8 px-20 py-12">
        <div className="col-span-3">
          <p className="text-label-caps text-foreground-faint">{node.name}</p>
          <ul className="mt-6 space-y-3">
            {node.children.map((child) => (
              <li key={child.id}>
                <Link
                  to="/shop/$categorySlug"
                  params={{ categorySlug: child.slug }}
                  className="text-[24px] leading-8 transition-colors duration-200 hover:text-brass-text"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {child.name}
                </Link>
              </li>
            ))}
            <li className="pt-3">
              <Link
                to="/shop/$categorySlug"
                params={{ categorySlug: node.slug }}
                className="text-label-caps underline decoration-[0.5px] underline-offset-[6px] hover:text-brass-text"
              >
                View all {node.name}
              </Link>
            </li>
          </ul>
        </div>
        {node.description && (
          <p className="col-span-3 text-[15px] leading-relaxed text-foreground-muted">{node.description}</p>
        )}
        <Link to="/shop/$categorySlug" params={{ categorySlug: node.slug }} className="group col-span-5 col-start-8">
          <div className="aspect-[16/9] overflow-hidden bg-surface">
            {image ? (
              <img
                src={image}
                alt=""
                className="h-full w-full object-cover transition-transform duration-1000 ease-out group-hover:scale-[1.02]"
              />
            ) : (
              <Placeholder seed={`menu-${node.id}`} label={node.name} className="h-full w-full" />
            )}
          </div>
          <p className="mt-4 text-label-caps underline decoration-[0.5px] underline-offset-[6px] group-hover:text-brass-text">
            Explore {node.name}
          </p>
        </Link>
      </div>
    </div>
  );
}

function MobileMenu({ open, tree, signedIn }: { open: boolean; tree: CategoryTreeNode[]; signedIn: boolean }) {
  return (
    <div
      inert={!open}
      className={`fixed inset-x-0 top-[72px] bottom-0 z-40 overflow-y-auto bg-background px-4 pt-6 pb-12 sm:px-8 lg:hidden
        transition-[opacity,transform] duration-500 ${open ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 -translate-y-2'}`}
    >
      <nav aria-label="Mobile">
        <ul className="divide-y divide-border-subtle border-y border-border-subtle">
          {tree.map((node) => (
            <li key={node.id} className="py-5">
              <Link
                to="/shop/$categorySlug"
                params={{ categorySlug: node.slug }}
                className="text-[34px] font-light leading-tight"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {node.name}
              </Link>
              {node.children.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  {node.children.map((child) => (
                    <li key={child.id}>
                      <Link to="/shop/$categorySlug" params={{ categorySlug: child.slug }} className="text-sm text-foreground-muted">
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          <li className="py-5">
            <Link
              to="/shop"
              className="text-[34px] font-light italic leading-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Shop all
            </Link>
          </li>
        </ul>
        <ul className="mt-8 space-y-4 text-label-caps text-foreground-muted">
          {signedIn ? (
            <>
              <li><Link to="/account">My account</Link></li>
              <li><Link to="/orders">My orders</Link></li>
            </>
          ) : (
            <li><Link to="/login">Sign in</Link></li>
          )}
          <li><Link to="/cart">Shopping bag</Link></li>
        </ul>
      </nav>
    </div>
  );
}
