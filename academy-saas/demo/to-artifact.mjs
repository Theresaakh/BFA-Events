// Turns the single-file Vite build into an artifact page body (the viewer adds <html>/<head>/<body>).
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const html = fs.readFileSync(path.join(dir, 'dist/index.html'), 'utf8');
const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/g, '');
const styles = [...withoutScripts.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const scripts = [...html.matchAll(/<script type="module"[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n');
if (!styles || !scripts) throw new Error('build output not recognised');
const out = `<title>AcademyOS</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
${styles}
<style>body{background-color:var(--color-surface);color:var(--color-ink);font-family:"Inter","IBM Plex Sans Arabic",ui-sans-serif,system-ui,sans-serif}</style>
<div id="root"></div>
${scripts}
`;
fs.writeFileSync(path.join(dir, 'dist/academyos.html'), out);
console.log('wrote dist/academyos.html', (out.length / 1024).toFixed(0) + ' KB');
