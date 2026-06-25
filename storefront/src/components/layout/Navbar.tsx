import { Link, useNavigate } from '@tanstack/react-router';
import { ShoppingBag, User, Package, Search, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/hooks/useCart';
import { useEffect, useRef, useState } from 'react';

export function Navbar() {
  const { user } = useAuth();
  const { data: cart } = useCart();
  const navigate = useNavigate();
  const headerRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const itemCount = cart?.data?.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) ?? 0;

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSearchOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchOpen(false);
    navigate({ to: '/', search: searchValue.trim() ? { search: searchValue.trim() } : {} });
    setSearchValue('');
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
      <div className="max-w-[1440px] mx-auto px-8 sm:px-12 lg:px-20 h-full">
        {/* Search overlay */}
        {searchOpen && (
          <form onSubmit={submitSearch} className="absolute inset-0 flex items-center px-8 sm:px-12 lg:px-20 bg-background/95 backdrop-blur-sm z-10">
            <Search strokeWidth={1} className="h-4 w-4 text-[var(--foreground-faint)] flex-shrink-0 mr-3" />
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
            >
              <X strokeWidth={1} className="h-5 w-5" />
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
                <Package strokeWidth={1} className="h-4 w-4" />
                Orders
              </Link>
            )}
          </nav>

          {/* Right icons */}
          <div className="flex items-center gap-6">
            {/* Search */}
            <button
              onClick={() => setSearchOpen(true)}
              className="text-foreground-muted hover:text-foreground transition-colors duration-200"
              title="Search"
            >
              <Search strokeWidth={1} className="h-5 w-5" />
            </button>
            <Link to="/cart" className="relative text-foreground-muted hover:text-foreground transition-colors duration-200">
              <ShoppingBag strokeWidth={1} className="h-5 w-5" />
              {itemCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground
                             text-[10px] font-normal h-4 w-4 flex items-center justify-center"
                >
                  {itemCount > 9 ? '9+' : itemCount}
                </span>
              )}
            </Link>

            {user ? (
              <div className="flex items-center gap-4">
                <Link
                  to="/account"
                  className="text-xs tracking-[0.12em] uppercase text-foreground-muted hover:text-foreground transition-colors duration-200 hidden sm:block"
                  style={{ fontFamily: 'var(--font-sans)' }}
                  title="My account"
                >
                  {user.full_name.split(' ')[0]}
                </Link>
                <Link
                  to="/account"
                  className="text-foreground-muted hover:text-foreground transition-colors duration-200 sm:hidden"
                  title="My account"
                >
                  <User strokeWidth={1} className="h-5 w-5" />
                </Link>
              </div>
            ) : (
              <Link
                to="/login"
                className="text-foreground-muted hover:text-foreground transition-colors duration-200"
                title="Sign in"
              >
                <User strokeWidth={1} className="h-5 w-5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
