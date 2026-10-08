export const POLICY_VERSION = '2026-10-08.1';

export const PRIVACY_REQUEST_KIND = ['ACCESS', 'CORRECTION', 'ERASURE', 'OBJECTION'] as const;
export const PRIVACY_REQUEST_STATUS = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'REJECTED'] as const;
export type PrivacyRequestKind = typeof PRIVACY_REQUEST_KIND[number];
export type PrivacyRequestStatus = typeof PRIVACY_REQUEST_STATUS[number];
export interface PrivacyRequest {
  id: string; user_id: number | null; email: string; kind: PrivacyRequestKind;
  status: PrivacyRequestStatus; details: string; identity_verified_at: string | null;
  resolution: string | null; created_at: string; resolved_at: string | null;
}
export interface ComplianceIncident {
  id: string; title: string; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'CONTAINED' | 'CLOSED'; aware_at: string; review_due_at: string;
  summary: string; notification_decision: 'PENDING' | 'REQUIRED' | 'NOT_REQUIRED';
  decision_reason: string | null; regulator_notified_at: string | null; customers_notified_at: string | null;
}
export interface ProductEvidence {
  product_id: number; supplier: string; invoice_reference: string; authenticity_evidence: string;
  image_rights: string; notes: string; updated_at: string;
}
export const ACCOUNTING_DATASET = ['orders', 'items', 'ledger', 'refunds', 'discounts', 'inventory', 'acceptances'] as const;
export type AccountingDataset = typeof ACCOUNTING_DATASET[number];
export interface AccountingExport {
  month: string; timezone: string; generated_at: string; sha256: string;
  dataset: AccountingDataset; row_count: number; csv: string;
}

export const LEGAL_POLICIES = {
  terms: {
    title: 'Terms of sale',
    sections: [
      ['Who you are buying from', 'Bagstreet operates from Imenti House, Bemack Exhibition 1st Floor, Shop M2, Nairobi. Contact bagstreetke@gmail.com or WhatsApp 074 809 6887 for assistance or a complaint. These terms apply to purchases through this storefront.'],
      ['Your order', 'You may buy without an account. Review and correct the items, variants, quantities, address and total before submitting. An unpaid order is pending; payment verification confirms the order. Unpaid stock reservations normally last 45 minutes. Contact us before paying again if a payment appears successful but your order is pending.'],
      ['Prices and payment', 'Prices are in Kenyan shillings. Checkout displays discounts, delivery fees and the total before payment. Pesapal processes online payments on its hosted payment page. BagStreet does not collect card numbers or CVV. Promotional codes are subject to their stated expiry, minimum spend and usage limits.'],
      ['Availability and product information', 'Product photos, descriptions and variant labels describe the item offered. If we cannot supply an item you have paid for, we will arrange a refund or an alternative you explicitly agree to. No substitution will be made without your agreement. Contact us about a pricing or description error before paying; statutory remedies remain available.'],
      ['Delivery and returns', 'Our delivery and returns policies form part of these terms. Contact us promptly to request a change or cancellation. Our team will check dispatch and payment records and confirm the available resolution.'],
      ['Consumer rights', 'Kenyan law applies. These terms do not exclude or limit statutory rights concerning faulty, damaged, incorrect or misdescribed goods, or cancellation and refunds where the law provides for them. You may seek help from the relevant authority or pursue a legal remedy without first exhausting our support process.'],
    ],
  },
  returns: {
    title: 'Returns and refunds',
    sections: [
      ['Standard returns', 'You can request a return within 24 hours of dispatch for a refund or exchange. The product must be unused and in original condition. This standard change-of-mind window starts at dispatch, not delivery. Contact us within the window to arrange the return; ask for help if your item has not arrived or dispatch timing is unclear.'],
      ['Your statutory rights', 'The 24-hour window and unused-condition requirement do not limit remedies under Kenyan consumer law for faulty, damaged, incorrect or misdescribed goods, or other statutory cancellation rights. Contact us with the order number and the issue; photos may help but are not a condition that overrides your rights.'],
      ['Arranging a return', 'Contact WhatsApp 074 809 6887, bagstreetke@gmail.com or Instagram @bagstreet_254 with your order number, item and preferred resolution. Before sending an item, our team will confirm the return destination, delivery responsibility and any applicable costs. These arrangements remain subject to statutory rights.'],
      ['Refunds and exchanges', 'Exchanges depend on replacement stock. Our team will confirm the refund amount, method and expected processing time in writing after checking the return. Provider processing may affect when funds arrive. Keep your order and refund references and contact us if the agreed time passes.'],
    ],
  },
  delivery: {
    title: 'Delivery policy',
    sections: [
      ['Where we deliver', 'We offer same-day delivery within Nairobi and ship countrywide. Once you place an order, our team will confirm delivery details with you. Same-day delivery depends on payment confirmation, your location, stock and courier availability; do not treat it as a guaranteed arrival time until our team confirms it.'],
      ['Charges and arrangements', 'Select your delivery area at checkout to see the charge and total before paying. Provide an accurate address and a reachable phone number. Contact us promptly to correct details. Our shop is at Imenti House, Bemack Exhibition 1st Floor, Shop M2, Nairobi.'],
      ['Delays or failed delivery', 'If you cannot receive a delivery, or it is delayed, missing or incorrect, contact WhatsApp 074 809 6887 or bagstreetke@gmail.com with your order number. Our team will investigate and agree next steps. Any redelivery charge must be disclosed and agreed, and arrangements do not limit statutory rights.'],
    ],
  },
  privacy: {
    title: 'Privacy notice',
    sections: [
      ['Who handles your information', 'Bagstreet is responsible for the personal information collected to operate this shop. Our privacy and compliance contact is bagstreetke@gmail.com; our shop is at Imenti House, Bemack Exhibition 1st Floor, Shop M2, Nairobi. Contact us with a privacy question, objection or complaint.'],
      ['What we collect and why', 'We collect account name and email, hashed passwords, order items, delivery name, phone, email and address, customer messages, payment references and statuses, and security and access records. We use these to fulfil purchases and support requests, operate accounts, reconcile payments, prevent fraud and meet record-keeping obligations. We do not collect payment card numbers or CVV.'],
      ['Legal grounds and optional emails', 'Order and account processing supports the purchase or service you request. Statutory record keeping supports legal obligations; proportionate security measures protect the shop and customers. Saved-bag reminders require a separate, optional opt-in that is unchecked by default. You can withdraw it in account settings or through the unsubscribe link. Order and receipt emails are not marketing opt-ins. We do not sell personal information.'],
      ['Recipients and international processing', 'Pesapal processes hosted payments. Our configured email provider (Resend or Gmail SMTP), hosting and storage providers support delivery and operation of the service. Delivery partners receive the contact and address details needed to fulfil your order. These providers may process information outside Kenya. Before launch or a provider change, BagStreet must review provider contracts, processing locations and lawful transfer safeguards. Contact us for the current provider and safeguard details.'],
      ['Retention', 'Saved-bag snapshots expire after seven days of inactivity. Sent and skipped email jobs are retained for 30 days; failed jobs for 90 days. Order, receipt, ledger and related evidence are retained for tax, accounting, disputes and other legal obligations, with extensions for an active investigation or legal hold. We do not automatically erase sales records when an account is closed. Account, support and security information is reviewed for necessity; contact us for an individual retention assessment.'],
      ['Your rights', 'You can request access, correction, erasure where applicable, restriction or objection to processing, or withdrawal of optional email consent. Signed-in customers can download their account data and submit requests from My Account. Guests can contact our privacy email. We verify identity proportionately before releasing or changing information; do not email passwords, card details or unnecessary identity documents. Some information may need to be retained by law, and we will explain that decision. You may complain to Kenya\'s Office of the Data Protection Commissioner at odpc.go.ke.'],
      ['Security and changes', 'Staff access is role restricted. We use expiring authentication, restricted administrative actions and audit records. No online service is risk free; report suspected misuse promptly. This notice and its version are linked at checkout. Material changes are published here with a new version.'],
    ],
  },
  cookies: {
    title: 'Cookies and browser storage',
    sections: [
      ['Essential storage', 'Authentication uses HttpOnly refresh cookies and an access token. The shopping bag and unfinished-payment reference are held in browser storage so navigation and reloads work. Recovery cookies identify a saved bag and earlier checkout; they do not grant account access. Recovery links and snapshots expire after seven days.'],
      ['Optional tracking', 'We do not currently use advertising cookies or analytics trackers. Optional bag reminders are controlled separately by email preference. If non-essential tracking is introduced, we will update this notice and implement an appropriate consent choice before activating it.'],
      ['Your controls', 'You can sign out, clear your bag or remove browser storage using browser settings. Blocking essential cookies or storage may prevent sign-in or payment recovery. Clearing browser storage does not erase records already held by the shop; use the privacy-request process for those records.'],
    ],
  },
} as const;
