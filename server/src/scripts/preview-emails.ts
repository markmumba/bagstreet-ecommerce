import path from 'node:path';
import { escapeHtml, renderEmailTemplate } from '../lib/template';
import { emailPreviewContext, emailPreviews } from './email-preview-data';

const outputDir = path.resolve(process.argv[2] ?? path.join(import.meta.dir, '../../../output/email-previews'));

for (const preview of emailPreviews) {
    const html = await renderEmailTemplate(preview.template, { ...emailPreviewContext, ...preview.vars }, preview.trustedHtml);
    await Bun.write(path.join(outputDir, `${preview.filename}.html`), html);
}

const links = emailPreviews.map((preview) => `<li><a href="${preview.filename}.html">${escapeHtml(preview.label)}</a></li>`).join('\n');
await Bun.write(path.join(outputDir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>BagStreet email previews</title>
<style>body{margin:0;background:#f1f3f4;color:#232529;font-family:Arial,Helvetica,sans-serif;letter-spacing:0}main{max-width:600px;margin:40px auto;padding:24px}h1{font-family:Georgia,serif;font-size:32px;font-weight:400}ul{list-style:none;padding:0}li{border-bottom:1px solid #d9dde2}a{display:block;padding:18px 0;color:#842b3f;font-size:16px}p{line-height:1.6;color:#59616a}</style></head>
<body><main><h1>BagStreet email previews</h1><p>Fictional data only. No email is sent by this preview command.</p><ul>${links}</ul></main></body></html>`);

console.log(`Email previews written to ${path.join(outputDir, 'index.html')}`);
