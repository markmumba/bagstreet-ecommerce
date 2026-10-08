export function redactAuditSecrets(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redactAuditSecrets);
    if (value && typeof value === 'object') {
        if (value instanceof Date) return value.toISOString();
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
            /password|secret|token|authorization|cookie|cvv|card_number/i.test(key) ? '[redacted]' : redactAuditSecrets(item),
        ]));
    }
    return value;
}
