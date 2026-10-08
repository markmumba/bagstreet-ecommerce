import { createFileRoute, Link } from '@tanstack/react-router';
import { CustomerCareLayout, PolicySection } from '@/components/customer-care/CustomerCareLayout';
import { useSeo } from '@/hooks/useSeo';
import { SHOP_INFO } from '@/lib/shop-info';

export const Route = createFileRoute('/delivery')({ component: DeliveryPage });

function DeliveryPage() {
  useSeo({
    title: 'Delivery Policy',
    description: 'Bagstreet offers same-day delivery within Nairobi and shipping countrywide in Kenya. Our team confirms delivery details after you place an order.',
    canonicalPath: '/delivery',
  });

  return (
    <CustomerCareLayout title="Delivery policy" introduction={SHOP_INFO.delivery}>
      <PolicySection title="Within Nairobi">
        <p>We offer same-day delivery within Nairobi. Our team will confirm the delivery details and timing for your address after you place your order.</p>
        <p>If you need an item by a specific time, contact us before ordering so we can confirm the arrangements.</p>
      </PolicySection>

      <PolicySection title="Countrywide shipping">
        <p>We ship to destinations across Kenya. Our team will confirm the delivery arrangements and expected timing for your location with you.</p>
        <p>Same-day delivery is our Nairobi service; it is not a delivery promise for destinations outside Nairobi.</p>
      </PolicySection>

      <PolicySection title="Delivery charges">
        <p>Select your delivery area at checkout to see the delivery charge and full order total before payment. Any applicable free-delivery promotion is reflected in your checkout total.</p>
        <p>If your area is not listed, or you are unsure which area to choose, contact us before paying. If your address or delivery arrangements need to change, we will confirm any change in cost with you before proceeding.</p>
      </PolicySection>

      <PolicySection title="Getting your order to you">
        <p>Enter your full name, phone number and complete delivery address at checkout. Include a building, apartment or landmark where it will help our team find you.</p>
        <p>Once you place your order, our team will contact you to confirm the delivery details. Please remain reachable on the phone number you supplied.</p>
        <p>If you need to update your address or delivery instructions, contact us as soon as possible with your order number so we can check the arrangements before dispatch.</p>
      </PolicySection>

      <PolicySection title="Delayed, missing or damaged deliveries">
        <p>If your order has not arrived at the agreed time, or there is an issue with the delivery, contact us with your order number. We will check with the delivery team and help resolve it.</p>
        <p>Check your items when they arrive. For an incorrect, damaged or faulty item, see our <Link to="/returns" className="text-foreground underline underline-offset-4">returns and refunds policy</Link>. This delivery policy does not limit any rights or remedies you have under Kenyan consumer law.</p>
      </PolicySection>
    </CustomerCareLayout>
  );
}
