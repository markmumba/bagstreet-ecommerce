import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight, Instagram, Mail, MapPin, MessageCircle } from 'lucide-react';
import { CustomerCareLayout, PolicySection } from '@/components/customer-care/CustomerCareLayout';
import { useSeo } from '@/hooks/useSeo';
import { SHOP_INFO } from '@/lib/shop-info';

export const Route = createFileRoute('/contact')({ component: ContactPage });

function ContactPage() {
  useSeo({
    title: 'Contact Us',
    description: 'Contact Bagstreet on WhatsApp, by email or on Instagram. Visit our shop at Imenti House, Bemack Exhibition, Shop M2, Nairobi.',
    canonicalPath: '/contact',
  });

  const channels = [
    { label: 'WhatsApp', value: SHOP_INFO.phone, href: SHOP_INFO.whatsappUrl, icon: MessageCircle, external: true },
    { label: 'Email', value: SHOP_INFO.email, href: `mailto:${SHOP_INFO.email}`, icon: Mail, external: false },
    { label: 'Instagram', value: SHOP_INFO.instagramHandle, href: SHOP_INFO.instagramUrl, icon: Instagram, external: true },
  ];

  return (
    <CustomerCareLayout title="Contact us" introduction="Questions about a product, an order or a return? Reach our team online, or visit us in Nairobi.">
      <PolicySection title="Get in touch">
        <dl className="divide-y divide-border-subtle">
          {channels.map(({ label, value, href, icon: Icon, external }) => (
            <div key={label} className="flex items-start gap-4 py-5 first:pt-1">
              <Icon className="mt-1 h-5 w-5 shrink-0 text-foreground" strokeWidth={1.4} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <dt className="text-sm text-foreground-faint">{label}</dt>
                <dd>
                  <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className="inline-flex min-h-11 max-w-full items-center gap-2 text-foreground underline underline-offset-4 hover:text-brass-text">
                    <span className="break-words [overflow-wrap:anywhere]">{value}</span>
                    {external && <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </a>
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </PolicySection>

      <PolicySection title="Visit the shop">
        <div className="flex items-start gap-4">
          <MapPin className="mt-1 h-5 w-5 shrink-0 text-foreground" strokeWidth={1.4} aria-hidden="true" />
          <div>
            <address className="not-italic text-foreground">{SHOP_INFO.address}</address>
            <a href={SHOP_INFO.mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-foreground underline underline-offset-4 hover:text-brass-text">
              Open in Google Maps
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </PolicySection>

      <PolicySection title="Help with an order">
        <p>Please include your order number and a short description of what you need help with. For a payment query, include the payment reference if you have it. Never send your password, card PIN or one-time payment codes.</p>
        <p>You can also read our <Link to="/delivery" className="text-foreground underline underline-offset-4">delivery policy</Link> or <Link to="/returns" className="text-foreground underline underline-offset-4">returns and refunds policy</Link> before getting in touch.</p>
      </PolicySection>
    </CustomerCareLayout>
  );
}
