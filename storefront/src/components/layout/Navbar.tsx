import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { ShoppingBag, User, Package, Search, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/hooks/useCart';
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

  const itemCount = cart?.data?.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) ?? 0;
  const cartLabel = itemCount > 0 ? `Cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : 'Cart';
  const currentRouteSearch = typeof (location.search as Record<string, unknown>).search === 'string'
    ? ((location.search as Record<string, unknown>).search as string)
    : '';

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    liveSearchStartedRef.current = currentRouteSearch.trim().length > 0;
    setSearchValue(location.pathname === '/' ? currentRouteSearch : '');
    searchInputRef.current?.focus();
  }, [searchOpen, currentRouteSearch, location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSearchOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;

    const nextSearch = searchValue.trim();
    if (nextSearch) liveSearchStartedRef.current = true;
    if (!nextSearch && !liveSearchStartedRef.current && currentRouteSearch === '') return;

    const timer = window.setTimeout(() => {
      if (location.pathname === '/' && currentRouteSearch === nextSearch) return;
      navigate({
        to: '/',
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
    navigate({ to: '/', search: nextSearch ? { search: nextSearch } : {}, replace: true });
  };

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 right-0 z-50 h-[72px]
                 border-b border-[var(--border-subtle)]
                 bg-background/0 backdrop-blur-none
                 transition-all duration-500
                 [&.scrolled]:bg-background/95 [&.scrolled]:backdrop-blur-sm"
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-20 h-full">
        {/* Search overlay */}
        {searchOpen && (
          <form onSubmit={submitSearch} className="absolute inset-0 flex items-center px-4 sm:px-8 lg:px-20 bg-background/95 backdrop-blur-sm z-10">
            <Search strokeWidth={1} className="h-4 w-4 text-[var(--foreground-faint)] flex-shrink-0 mr-3" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search products..."
              className="flex-1 bg-transparent border-0 text-sm font-light text-foreground placeholder:text-[var(--foreground-faint)] focus:outline-none"
              style={{ fontFamily: 'var(--font-sans)' }}
            />
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="ml-4 text-[var(--foreground-faint)] hover:text-foreground transition-colors"
              aria-label="Close search"
            >
              <X strokeWidth={1} className="h-5 w-5" aria-hidden="true" />
            </button>
          </form>
        )}

        <div className="flex items-center justify-between h-full">
          {/* Brand */}
          <Link to="/" className="flex-shrink-0">
            <span
              className="text-xl tracking-[0.25em] uppercase font-light text-foreground"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Bagstreet
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden sm:flex items-center gap-10">
            <Link
              to="/"
              className="text-xs tracking-[0.15em] uppercase font-normal text-foreground-muted hover:text-foreground transition-colors duration-200"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Shop
            </Link>

            {user && (
              <Link
                to="/orders"
                className="text-xs tracking-[0.15em] uppercase font-normal text-foreground-muted hover:text-foreground transition-colors duration-200 flex items-center gap-1.5"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                <Package strokeWidth={1} className="h-4 w-4" aria-hidden="true" />
                Orders
              </Link>
            )}
          </nav>

          {/* Right icons */}
          <div className="flex items-center gap-4 sm:gap-6">
            {/* Search */}
            <button
              onClick={() => setSearchOpen(true)}
              className="text-foreground-muted hover:text-foreground transition-colors duration-200"
              title="Search"
              aria-label="Search products"
            >
              <Search strokeWidth={1} className="h-5 w-5" aria-hidden="true" />
            </button>
            <Link
              to="/cart"
              className="relative text-foreground-muted hover:text-foreground transition-colors duration-200"
              aria-label={cartLabel}
            >
              <ShoppingBag strokeWidth={1} className="h-5 w-5" aria-hidden="true" />
              {itemCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-primary text-primary-foreground
                             text-[10px] font-normal h-4 w-4 flex items-center justify-center"
                >
                  {itemCount > 9 ? '9+' : itemCount}
                </span>
              )}
            </Link>

            {user && (
              <Link
                to="/orders"
                className="text-foreground-muted hover:text-foreground transition-colors duration-200 sm:hidden"
                title="My orders"
                aria-label="My orders"
              >
                <Package strokeWidth={1} className="h-5 w-5" aria-hidden="true" />
              </Link>
            )}

            {user ? (
              <div className="flex items-center gap-4">
                <Link
                  to="/account"
                  className="text-xs tracking-[0.12em] uppercase text-foreground-muted hover:text-foreground transition-colors duration-200 hidden sm:block"
                  style={{ fontFamily: 'var(--font-sans)' }}
                  title="My account"
                  aria-label="My account"
                >
                  {user.full_name.split(' ')[0]}
                </Link>
                <Link
                  to="/account"
                  className="text-foreground-muted hover:text-foreground transition-colors duration-200 sm:hidden"
                  title="My account"
                  aria-label="My account"
                >
                  <User strokeWidth={1} className="h-5 w-5" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <Link
                to="/login"
                className="text-foreground-muted hover:text-foreground transition-colors duration-200"
                title="Sign in"
                aria-label="Sign in"
              >
                <User strokeWidth={1} className="h-5 w-5" aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
