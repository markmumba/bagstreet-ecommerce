export interface ShippingLocationResponse {
    id: string;
    name: string;
    price: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface ShippingLocationRequest {
    name: string;
    price: number;
    is_active?: boolean;
}
