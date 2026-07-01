import type { ShippingAddress } from 'shared/dist';

export function normalizeShippingAddress(
    value: unknown,
    fallback: { fullName?: string | null; phone?: string | null; email?: string | null } = {}
): ShippingAddress {
    let parsed: any = value;

    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            parsed = {};
        }
    }

    const address = parsed && typeof parsed === 'object' ? parsed : {};
    return {
        full_name: String(address.full_name ?? fallback.fullName ?? 'Guest customer'),
        email: address.email ?? fallback.email ?? undefined,
        address_line1: String(address.address_line1 ?? ''),
        address_line2: address.address_line2 ?? undefined,
        city: String(address.city ?? ''),
        state: String(address.state ?? address.county ?? ''),
        postal_code: String(address.postal_code ?? ''),
        country: String(address.country ?? 'Kenya'),
        phone: address.phone ?? fallback.phone ?? undefined,
    };
}
