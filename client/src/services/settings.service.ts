import { apiClient } from './api';
import type { StorefrontHero } from 'shared';

export interface OrderHandoverSettings {
  enabled: boolean;
  manager_id: string | null;
  manager: {
    id: string;
    email: string;
    full_name: string;
    role: string;
  } | null;
}

export interface OrderHandoverUpdate {
  enabled: boolean;
  manager_id: string | null;
}

export const settingsService = {
  getOrderHandover: () =>
    apiClient.get<OrderHandoverSettings>('/api/settings/order-handover'),

  updateOrderHandover: (data: OrderHandoverUpdate) =>
    apiClient.put<OrderHandoverSettings>('/api/settings/order-handover', data),

  getStorefrontHero: () =>
    apiClient.get<StorefrontHero>('/api/settings/storefront-hero'),

  updateStorefrontHero: (data: StorefrontHeroUpdate) => {
    const form = new FormData();
    form.append('eyebrow', data.eyebrow);
    form.append('title', data.title);
    form.append('subtitle', data.subtitle);
    if (data.image) form.append('image', data.image);
    if (data.removeImage) form.append('remove_image', 'true');
    return apiClient.putForm<StorefrontHero>('/api/settings/storefront-hero', form);
  },
};

export interface StorefrontHeroUpdate {
  eyebrow: string;
  title: string;
  subtitle: string;
  image?: File | null;
  removeImage?: boolean;
}
