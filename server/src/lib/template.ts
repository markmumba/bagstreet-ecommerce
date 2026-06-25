import path from 'path';

/**
 * Reads an HTML template from src/lib/templates/<name>.html
 * and replaces every {{key}} placeholder with the matching value.
 */
export async function renderTemplate(
    name: string,
    vars: Record<string, string>
): Promise<string> {
    const file = path.join(import.meta.dir, 'templates', `${name}.html`);
    let html = await Bun.file(file).text();

    for (const [key, value] of Object.entries(vars)) {
        // Use a global regex so every occurrence is replaced
        html = html.replaceAll(`{{${key}}}`, value);
    }

    return html;
}
