import { z } from 'zod';

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(value => Number(value.slice(0, 4)) >= 2020 && Number(value.slice(0, 4)) <= 2100);

export function monthWindow(month: string) {
    const valid = monthSchema.parse(month);
    const year = Number(valid.slice(0, 4));
    const index = Number(valid.slice(5)) - 1;
    // Nairobi has no DST: midnight local time is 21:00 UTC on the preceding day.
    return { start: new Date(Date.UTC(year, index, 1, -3)).toISOString(), end: new Date(Date.UTC(year, index + 1, 1, -3)).toISOString() };
}

export function csv(rows: Record<string, unknown>[], headers: string[]) {
    const cell = (value: unknown) => {
        const raw = value instanceof Date ? value.toISOString() : value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
        const safe = /^[\s]*[=+\-@]/.test(raw) && typeof value !== 'number' ? `'${raw}` : raw;
        return `"${safe.replaceAll('"', '""')}"`;
    };
    return [headers.map(cell).join(','), ...rows.map(row => headers.map(key => cell(row[key])).join(','))].join('\r\n') + '\r\n';
}
