// Verifies that every translation key used in the code exists, and that ar/fr have exactly the same keys as en.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const load = (l) => JSON.parse(fs.readFileSync(path.join(root, 'messages', `${l}.json`), 'utf8'));
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
const en = new Set(flat(load('en')));
const has = (k) => en.has(k) || [...en].some((x) => x.startsWith(k + '.'));
let problems = 0;

const files = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (/\.(tsx?)$/.test(e.name) && !e.name.endsWith('.test.ts')) files.push(p);
});
walk(path.join(root, 'src'));

const namespaces = [...new Set([...en].map((k) => k.split('.')[0]))];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const vars = {};
  for (const m of src.matchAll(/const (\w+) = (?:useTranslations|await getTranslations)\((?:'([\w.]+)'|\{[^}]*namespace: '([\w.]+)'[^}]*\})?\)/g)) vars[m[1]] = m[2] ?? m[3] ?? '';
  for (const [v, ns] of Object.entries(vars)) {
    for (const m of src.matchAll(new RegExp(`\\b${v}\\('([\\w.]+)'`, 'g'))) {
      const key = ns ? `${ns}.${m[1]}` : m[1];
      if (!en.has(key)) { console.log(`MISSING ${key}  (${path.relative(root, f)})`); problems++; }
    }
    for (const m of src.matchAll(new RegExp(`\\b${v}\\(\`([\\w.]+)\\.\\$\\{`, 'g'))) {
      const prefix = ns ? `${ns}.${m[1]}` : m[1];
      if (!has(prefix)) { console.log(`MISSING prefix ${prefix}.*  (${path.relative(root, f)})`); problems++; }
    }
  }
  // string literals that look like full keys (passed around as success/error keys)
  for (const m of src.matchAll(/'((?:errors|validation)\.[\w.]+|(?:players|teams|attendance|schedule|invoices|payments|settings)\.(?:created|updated|archived|restored|saved|rosterSaved|cancelled|issued|draftSaved|voided|recorded))'/g)) {
    if (!en.has(m[1])) { console.log(`MISSING ${m[1]}  (${path.relative(root, f)})`); problems++; }
  }
}
for (const l of ['ar', 'fr']) {
  const other = new Set(flat(load(l)));
  for (const k of en) if (!other.has(k)) { console.log(`[${l}] missing ${k}`); problems++; }
  for (const k of other) if (!en.has(k)) { console.log(`[${l}] extra ${k}`); problems++; }
}
console.log(problems ? `\n${problems} problem(s)` : 'i18n OK: all keys present in en, ar, fr');
process.exit(problems ? 1 : 0);
