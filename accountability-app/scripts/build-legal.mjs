// Generates the public, hostable web versions of the Terms of Service and
// Privacy Policy STRAIGHT FROM src/legal/content.ts, so the hosted pages and the
// in-app text can never drift. Re-run after any legal edit:
//
//   node scripts/build-legal.mjs
//
// Output → legal-web/{index,terms,privacy}.html  (self-contained, host anywhere:
// Cloudflare Pages, GitHub Pages, Netlify, etc.). Apple/Google require a public
// Privacy Policy URL (and usually a Terms URL) at store submission.

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = join(root, 'src', 'legal', 'content.ts');
const outDir = join(root, 'legal-web');

// 1) transpile content.ts (no imports, self-contained) → ESM, load the data.
const source = readFileSync(srcPath, 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const tmp = join(tmpdir(), `legal-content-${Date.now()}.mjs`);
writeFileSync(tmp, js, 'utf8');
const M = await import(pathToFileURL(tmp).href);
const { TERMS, PRIVACY, LEGAL_VERSION, EFFECTIVE_DATE, OPERATOR, CONTACT_EMAIL } = M;

// 2) helpers
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const CSS = `
:root{--bg:#f7f8fa;--card:#fff;--ink:#12161d;--sub:#5a6472;--line:#e6e9ee;--accent:#2563eb;--accentSoft:#eff4ff}
@media(prefers-color-scheme:dark){:root{--bg:#0e1116;--card:#151a21;--ink:#e9edf3;--sub:#9aa4b2;--line:#242a33;--accentSoft:#16233b}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.62}
.wrap{max-width:760px;margin:0 auto;padding:28px 20px 80px}
header.top{display:flex;align-items:center;gap:10px;padding:6px 0 18px;border-bottom:1px solid var(--line);margin-bottom:26px}
.logo{font-weight:800;font-size:18px;letter-spacing:-.02em}.logo span{color:var(--accent)}
nav{margin-left:auto;display:flex;gap:6px}
nav a{font-size:13.5px;text-decoration:none;color:var(--sub);padding:6px 12px;border-radius:999px}
nav a.on{background:var(--accentSoft);color:var(--accent);font-weight:600}
h1{font-size:27px;letter-spacing:-.02em;margin:8px 0 4px}
.meta{color:var(--sub);font-size:13.5px;margin:0 0 8px}
.intro{color:var(--sub);font-size:15.5px;margin:14px 0 30px}
section{margin:0 0 22px}
h2{font-size:18px;letter-spacing:-.01em;margin:26px 0 8px;scroll-margin-top:16px}
p{margin:0 0 11px;font-size:15.5px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:8px 22px 20px}
footer{margin-top:36px;padding-top:18px;border-top:1px solid var(--line);color:var(--sub);font-size:13px}
footer a{color:var(--accent);text-decoration:none}
a{color:var(--accent)}
.note{background:var(--accentSoft);border-radius:12px;padding:12px 16px;font-size:13.5px;color:var(--sub);margin:0 0 24px}
`;

const shell = (title, bodyHtml) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<meta name="robots" content="all"><title>${esc(title)} · ${esc(OPERATOR)}</title>` +
  `<style>${CSS}</style></head><body><div class="wrap">${bodyHtml}</div></body></html>`;

const navHtml = (active) =>
  `<nav>` +
  `<a href="./terms.html" class="${active === 'terms' ? 'on' : ''}">Terms</a>` +
  `<a href="./privacy.html" class="${active === 'privacy' ? 'on' : ''}">Privacy</a>` +
  `</nav>`;

const docBody = (doc, active) => {
  const sections = doc.sections
    .map(
      (s) =>
        `<section><h2>${esc(s.h)}</h2>${s.p.map((x) => `<p>${esc(x)}</p>`).join('')}</section>`,
    )
    .join('');
  return (
    `<header class="top"><div class="logo">Account<span>Ability</span></div>${navHtml(active)}</header>` +
    `<h1>${esc(doc.title)}</h1>` +
    `<p class="meta">Effective ${esc(EFFECTIVE_DATE)} · Version ${esc(LEGAL_VERSION)}</p>` +
    `<p class="intro">${esc(doc.intro)}</p>` +
    `<div class="card">${sections}</div>` +
    `<footer>Questions? <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a> · ` +
    `<a href="./${active === 'terms' ? 'privacy' : 'terms'}.html">${active === 'terms' ? 'Privacy Policy' : 'Terms of Service'}</a></footer>`
  );
};

const indexBody =
  `<header class="top"><div class="logo">Account<span>Ability</span></div>${navHtml('')}</header>` +
  `<h1>Legal</h1>` +
  `<p class="meta">Effective ${esc(EFFECTIVE_DATE)} · Version ${esc(LEGAL_VERSION)}</p>` +
  `<p class="intro">The agreements that govern your use of ${esc(OPERATOR)}.</p>` +
  `<div class="card" style="padding:20px 22px">` +
  `<p><a href="./terms.html"><strong>Terms of Service</strong></a> — the rules for using the app.</p>` +
  `<p><a href="./privacy.html"><strong>Privacy Policy</strong></a> — what we collect, why, and your choices.</p>` +
  `</div>` +
  `<footer>Questions? <a href="mailto:${esc(CONTACT_EMAIL)}">${esc(CONTACT_EMAIL)}</a></footer>`;

// 3) write
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'terms.html'), shell('Terms of Service', docBody(TERMS, 'terms')));
writeFileSync(join(outDir, 'privacy.html'), shell('Privacy Policy', docBody(PRIVACY, 'privacy')));
writeFileSync(join(outDir, 'index.html'), shell('Legal', indexBody));

console.log(
  `legal-web/ built from content.ts v${LEGAL_VERSION}: index.html, terms.html (${TERMS.sections.length} sections), privacy.html (${PRIVACY.sections.length} sections)`,
);
