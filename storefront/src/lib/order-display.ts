import { ORDER_STATUS, PAYMENT_STATUS } from 'shared';
import type { OrderResponse, OrderStatus, PaymentStatus, ShippingAddress } from 'shared';

export function formatOrderPrice(price: number) {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(price);
}

export function formatOrderDate(date: string) {
  return new Date(date).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatOrderDateTime(date: string) {
  return new Date(date).toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatOrderNumber(id: string, orderNumber?: string) {
  return orderNumber ?? `#${id.padStart(6, '0')}`;
}

export function getOrderRouteRef(order: { id: string; public_id?: string }) {
  return order.public_id ?? order.id;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [ORDER_STATUS.PENDING]: 'Pending',
  [ORDER_STATUS.CONFIRMED]: 'Confirmed',
  [ORDER_STATUS.PROCESSING]: 'Processing',
  [ORDER_STATUS.SHIPPED]: 'Shipped',
  [ORDER_STATUS.DELIVERED]: 'Received',
  [ORDER_STATUS.CANCELLED]: 'Cancelled',
  [ORDER_STATUS.REFUNDED]: 'Refunded',
};

export const ORDER_STATUS_CLASSES: Record<OrderStatus, string> = {
  [ORDER_STATUS.PENDING]: 'bg-yellow-100 text-yellow-800',
  [ORDER_STATUS.CONFIRMED]: 'bg-blue-100 text-blue-800',
  [ORDER_STATUS.PROCESSING]: 'bg-indigo-100 text-indigo-800',
  [ORDER_STATUS.SHIPPED]: 'bg-purple-100 text-purple-800',
  [ORDER_STATUS.DELIVERED]: 'bg-green-100 text-green-800',
  [ORDER_STATUS.CANCELLED]: 'bg-red-100 text-red-800',
  [ORDER_STATUS.REFUNDED]: 'bg-gray-100 text-gray-700',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  [PAYMENT_STATUS.UNPAID]: 'Unpaid',
  [PAYMENT_STATUS.PAID]: 'Paid',
  [PAYMENT_STATUS.FAILED]: 'Failed',
};

export const PAYMENT_STATUS_CLASSES: Record<PaymentStatus, string> = {
  [PAYMENT_STATUS.UNPAID]: 'bg-yellow-100 text-yellow-800',
  [PAYMENT_STATUS.PAID]: 'bg-green-100 text-green-800',
  [PAYMENT_STATUS.FAILED]: 'bg-red-100 text-red-800',
};

export function getOrderSubtotal(order: OrderResponse) {
  return order.items.reduce((sum, item) => sum + item.subtotal, 0);
}

export function getAddressLines(address: ShippingAddress) {
  return [
    address.address_line1,
    address.address_line2,
    [address.city, address.state].filter(Boolean).join(', '),
    [address.postal_code, address.country].filter(Boolean).join(' '),
  ].filter(Boolean);
}
