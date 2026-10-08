import { createFileRoute } from '@tanstack/react-router';
import { CustomerCareLayout, PolicySection } from '@/components/customer-care/CustomerCareLayout';
import { useSeo } from '@/hooks/useSeo';
import { SHOP_INFO } from '@/lib/shop-info';

export const Route = createFileRoute('/returns')({ component: ReturnsPage });

function ReturnsPage() {
  useSeo({
    title: 'Returns and Refunds',
    description: 'Bagstreet accepts returns of unused items in original condition within 24 hours of dispatch for a refund or exchange. Find out how to contact us.',
    canonicalPath: '/returns',
  });

  return (
    <CustomerCareLayout title="Returns and refunds" introduction="Need to return something? Here is our return window and how to arrange a refund or exchange.">
      <PolicySection title="Our return policy">
        <p className="text-foreground">{SHOP_INFO.returns}</p>
        <p>The 24-hour window starts when your item is dispatched, not when it is delivered. Contact us within that window to arrange the return. If your item has not arrived yet or you are unsure when it was dispatched, get in touch so we can help.</p>
        <p>This is our standard return policy. It does not limit your statutory rights, including rights relating to faulty, damaged, incorrect or misdescribed goods.</p>
      </PolicySection>

      <PolicySection title="How to arrange a return">
        <ol className="list-decimal space-y-4 pl-5 marker:text-foreground">
          <li>Contact us on <a href={SHOP_INFO.whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4">WhatsApp at {SHOP_INFO.phone}</a>, by <a href={`mailto:${SHOP_INFO.email}`} className="text-foreground underline underline-offset-4">email</a>, or by <a href={SHOP_INFO.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4">Instagram DM</a>. Include your order number, the item you want to return, and whether you would prefer a refund or exchange.</li>
          <li>Our team will confirm the return arrangements with you, including where to bring or send the item. Keep the item unused and in its original condition for a standard return.</li>
          <li>Once the returned item has been checked, our team will confirm your refund or exchange and keep you informed of the next steps.</li>
        </ol>
      </PolicySection>

      <PolicySection title="Refunds and exchanges">
        <p>You can request a refund or an exchange for an eligible return. Exchanges depend on the availability of the replacement item; our team will confirm the options with you.</p>
        <p>We will confirm the refund amount, payment method and expected processing time with you. Payment-provider processing may affect when the funds appear in your account.</p>
        <p>Before sending anything back, ask our team to confirm the return delivery arrangements and any delivery charges that apply. Any arrangement remains subject to your rights under Kenyan consumer law.</p>
      </PolicySection>

      <PolicySection title="Faulty, damaged or incorrect items">
        <p>If an item arrives damaged, is faulty, does not match its description or is not what you ordered, contact us with your order number and details of the problem. Photos can help us understand the issue.</p>
        <p>The standard 24-hour window and unused-condition requirement do not override remedies you are entitled to under Kenyan consumer law. We will work with you on the appropriate resolution.</p>
      </PolicySection>
    </CustomerCareLayout>
  );
}
