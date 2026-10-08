import type { ReactNode } from 'react';
import { useLayoutEffect } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { ArrowUpRight, Mail, MessageCircle } from 'lucide-react';
import { CUSTOMER_CARE_LINKS, SHOP_INFO } from '@/lib/shop-info';

export function CustomerCareLayout({
  title,
  introduction,
  children,
}: {
  title: string;
  introduction: string;
  children: ReactNode;
}) {
  const pathname = useLocation({ select: (location) => location.pathname });

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-28 sm:px-8 sm:pb-24 sm:pt-32 lg:px-20">
      <header className="border-b border-border-subtle pb-8 sm:pb-10">
        <p className="text-xs font-medium text-foreground-faint">Customer care</p>
        <h1 className="mt-3 text-4xl font-light leading-tight sm:text-5xl" style={{ fontFamily: 'var(--font-display)' }}>
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-foreground-muted sm:text-base">{introduction}</p>
      </header>

      <div className="grid gap-8 pt-8 sm:pt-10 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="Customer care" className="print:hidden">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 lg:sticky lg:top-24 lg:flex-col lg:items-start lg:gap-2">
            {CUSTOMER_CARE_LINKS.map(({ to, label }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="inline-flex min-h-11 items-center border-b text-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                  inactiveProps={{ className: 'border-transparent text-foreground-muted' }}
                  activeProps={{ className: 'border-foreground font-medium text-foreground', 'aria-current': 'page' }}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <article className="min-w-0 max-w-[68ch] text-sm leading-7 text-foreground-muted sm:text-base">
          {children}

          <div className="mt-12 border-t border-border-subtle pt-8 print:hidden">
            <h2 className="text-lg font-medium text-foreground">Need a hand?</h2>
            <p className="mt-2">For order questions, please include your order number when you get in touch.</p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <a href={SHOP_INFO.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-foreground underline underline-offset-4 hover:text-brass-text">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                WhatsApp {SHOP_INFO.phone}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              <a href={`mailto:${SHOP_INFO.email}`} className="inline-flex min-h-11 items-center gap-2 break-all text-foreground underline underline-offset-4 hover:text-brass-text">
                <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
                {SHOP_INFO.email}
              </a>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

export function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8 last:mb-0 sm:mb-10">
      <h2 className="mb-3 text-xl font-medium leading-7 text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
