import { createFileRoute, Link } from '@tanstack/react-router';
import { CustomerCareLayout, PolicySection } from '@/components/customer-care/CustomerCareLayout';
import { useSeo } from '@/hooks/useSeo';
import { SHOP_INFO } from '@/lib/shop-info';

export const Route = createFileRoute('/terms')({ component: TermsPage });

function TermsPage() {
  useSeo({
    title: 'Terms of Sale',
    description: 'Read the Bagstreet terms of sale, including ordering, Pesapal payments, delivery, returns and customer support in Kenya.',
    canonicalPath: '/terms',
  });

  return (
    <CustomerCareLayout title="Terms of sale" introduction="The details of shopping with Bagstreet, from placing your order to receiving it.">
      <PolicySection title="1. Who you are buying from">
        <p>These terms apply to purchases made through the Bagstreet storefront.</p>
        <p>Our shop is at {SHOP_INFO.address} Our support email is <a href={`mailto:${SHOP_INFO.email}`} className="underline underline-offset-4">{SHOP_INFO.email}</a>, and you can reach us on WhatsApp at {SHOP_INFO.phone}.</p>
      </PolicySection>

      <PolicySection title="2. Placing an order">
        <p>You can shop as a guest or sign in to your account. An account is not required to place an order.</p>
        <p>Before placing your order, review the products, selected variants, quantities, contact details, delivery address and total. You can edit your details or return to your bag to make changes before continuing to payment.</p>
        <p>Please provide an email address and phone number where our team can reach you. If a detail needs correcting after you have placed an order, contact us with your order number.</p>
      </PolicySection>

      <PolicySection title="3. Prices and payment">
        <p>Prices are displayed in Kenyan shillings (KES). Checkout shows your items, any applied discount, delivery charge and total before you pay.</p>
        <p>Online payment is processed through Pesapal. The payment options available to you are shown on the payment page.</p>
        <p>Placing an order creates a pending order. Your order is confirmed once payment has been verified, and we send confirmation by email. Please keep your order number and payment reference.</p>
        <p>If payment appears to have gone through but your order is still pending, contact us so we can check it before you attempt another payment.</p>
      </PolicySection>

      <PolicySection title="4. Products and availability">
        <p>Choose the colour, size or other variant you want before adding a product to your bag. Product details and availability are shown on the product page.</p>
        <p>If we cannot supply an item you have paid for, we will contact you to arrange a refund or an alternative you agree to. We will not substitute an item without your agreement.</p>
      </PolicySection>

      <PolicySection title="5. Delivery">
        <p>{SHOP_INFO.delivery}</p>
        <p>Read our <Link to="/delivery" className="text-foreground underline underline-offset-4">delivery policy</Link> for delivery charges, arrangements and help with a delayed or incorrect delivery.</p>
      </PolicySection>

      <PolicySection title="6. Returns, refunds and order changes">
        <p>{SHOP_INFO.returns}</p>
        <p>Read our <Link to="/returns" className="text-foreground underline underline-offset-4">returns and refunds policy</Link> for how to arrange a return and what to do if an item is faulty, damaged or not what you ordered.</p>
        <p>To request an order change or cancellation, contact us as soon as possible with your order number. We will check whether the order has been dispatched and confirm the next steps. Your statutory cancellation and refund rights are not limited by these terms.</p>
      </PolicySection>

      <PolicySection title="7. Your consumer rights">
        <p>These terms are subject to Kenyan law. Nothing in these terms or our delivery and returns policies excludes or limits rights or remedies available to you under applicable consumer law.</p>
        <p>This includes rights relating to faulty goods, goods that are not as described, and cancellation or refunds where the law provides for them.</p>
        <p>For a question or complaint, <Link to="/contact" className="text-foreground underline underline-offset-4">contact our team</Link> with your order number and a description of the issue. Contacting us does not prevent you from seeking help from a relevant authority or pursuing a remedy available under Kenyan law.</p>
      </PolicySection>
    </CustomerCareLayout>
  );
}
