export const SHOP_INFO = {
  name: 'Bagstreet',
  phone: '074 809 6887',
  whatsappUrl: 'https://wa.me/254748096887',
  email: 'bagstreetke@gmail.com',
  instagramHandle: '@bagstreet_254',
  instagramUrl: 'https://www.instagram.com/bagstreet_254/',
  address: 'Imenti House, Bemack Exhibition 1st Floor, Shop M2, Nairobi.',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Imenti+House+Bemack+Exhibition+Nairobi',
  returns: 'You can return any item within 24 hours of dispatch for a refund or exchange. The product must be unused and in original condition.',
  delivery: 'We offer same-day delivery within Nairobi and ship countrywide. Once you place your order, our team will confirm the delivery details with you right away.',
} as const;

export const CUSTOMER_CARE_LINKS = [
  { to: '/contact', label: 'Contact us' },
  { to: '/delivery', label: 'Delivery policy' },
  { to: '/returns', label: 'Returns and refunds' },
  { to: '/terms', label: 'Terms of sale' },
] as const;
