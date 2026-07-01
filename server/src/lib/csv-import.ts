import { BadRequestError } from './errors';

export interface CsvRow {
    rowNumber: number;
    values: Record<string, string>;
}

export interface ImportRowError {
    row: number;
    message: string;
}

export interface ImportReport {
    total_rows: number;
    created: number;
    skipped: number;
    failed: number;
    errors: ImportRowError[];
}

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 1000;

function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (char === '"' && inQuotes && next === '"') {
            current += '"';
            index += 1;
            continue;
        }

        if (char === '"') {
            inQuotes = !inQuotes;
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    if (inQuotes) throw new BadRequestError('CSV contains an unterminated quoted value');
    values.push(current.trim());
    return values;
}

function normaliseHeader(header: string): string {
    return header.trim().toLowerCase().replace(/\s+/g, '_');
}

export async function csvTextFromRequest(request: Request): Promise<string> {
    const contentType = request.headers.get('Content-Type') ?? '';

    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!(file instanceof File) || file.size === 0) {
            throw new BadRequestError('Upload a CSV file using the "file" field');
        }
        if (file.size > MAX_CSV_BYTES) {
            throw new BadRequestError('CSV file must be 2MB or smaller');
        }
        return file.text();
    }

    const text = await request.text();
    if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) {
        throw new BadRequestError('CSV file must be 2MB or smaller');
    }
    return text;
}

export function parseCsv(text: string, requiredHeaders: string[]): CsvRow[] {
    const lines = text
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '');

    if (lines.length < 2) throw new BadRequestError('CSV must include a header row and at least one data row');

    const headerLine = lines[0];
    if (!headerLine) throw new BadRequestError('CSV must include a header row');
    const headers = parseCsvLine(headerLine).map(normaliseHeader);
    const missing = requiredHeaders.filter((header) => !headers.includes(normaliseHeader(header)));
    if (missing.length > 0) {
        throw new BadRequestError(`CSV is missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
    }

    const rows = lines.slice(1).map((line, index) => {
        const cells = parseCsvLine(line);
        const values = headers.reduce<Record<string, string>>((acc, header, cellIndex) => {
            acc[header] = cells[cellIndex]?.trim() ?? '';
            return acc;
        }, {});
        return { rowNumber: index + 2, values };
    });

    if (rows.length > MAX_ROWS) throw new BadRequestError(`CSV imports are limited to ${MAX_ROWS} rows`);
    return rows;
}

export function parseBoolean(value: string | undefined, fallback = true): boolean {
    const normalised = (value ?? '').trim().toLowerCase();
    if (!normalised) return fallback;
    if (['true', 'yes', 'y', '1', 'active'].includes(normalised)) return true;
    if (['false', 'no', 'n', '0', 'inactive'].includes(normalised)) return false;
    throw new Error(`Invalid boolean value "${value}"`);
}

export function parseOptionalNumber(value: string | undefined): number | undefined {
    const normalised = (value ?? '').trim();
    if (!normalised) return undefined;
    const parsed = Number(normalised);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid number "${value}"`);
    return parsed;
}

export function parseRequiredNumber(value: string | undefined, field: string): number {
    const parsed = parseOptionalNumber(value);
    if (parsed === undefined) throw new Error(`${field} is required`);
    return parsed;
}
