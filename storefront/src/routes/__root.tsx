import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Navbar } from '@/components/layout/Navbar';

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-background flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:text-foreground focus:shadow"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main-content" className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--border-subtle)] py-12">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 lg:px-20 text-center">
          <p
            className="text-xs tracking-[0.2em] uppercase text-[var(--foreground-faint)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            © {new Date().getFullYear()} Bagstreet — Luxury Handbags &amp; Accessories
          </p>
        </div>
      </footer>
    </div>
  ),
});
