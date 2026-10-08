/**
 * Prepares a value for a JSONB parameter (`${toJsonbParam(x)}::jsonb`).
 *
 * bun:sql JSON-encodes parameters bound to a jsonb cast itself, so passing `JSON.stringify(x)`
 * double-encodes and stores a JSON *string* (jsonb_typeof = 'string') instead of an object.
 * Pass the value as-is; a pre-serialised JSON string is parsed back so it is stored structurally.
 */
export function toJsonbParam(value: unknown): unknown {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    return value;
}

/**
 * Reads a JSONB column value. Rows written before migration 007 may hold a double-encoded JSON
 * string rather than an object, so accept both.
 */
export function readJsonColumn<T = Record<string, unknown>>(value: unknown): T | null {
    if (value == null) return null;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as T;
        } catch {
            return null;
        }
    }
    return value as T;
}

/** SQL expression that reads a JSONB column the same way (object or double-encoded string). */
export const JSONB_UNWRAP = (column: string) =>
    `(CASE WHEN jsonb_typeof(${column}) = 'string' THEN (${column} #>> '{}')::jsonb ELSE ${column} END)`;
