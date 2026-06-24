import { createRootRoute, Outlet } from '@tanstack/react-router';
import { Navbar } from '@/components/layout/Navbar';

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-[var(--border-subtle)] py-12">
        <div className="max-w-[1440px] mx-auto px-8 sm:px-12 lg:px-20 text-center">
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
