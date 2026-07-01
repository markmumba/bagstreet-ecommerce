import { apiClient } from './api';

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
};
