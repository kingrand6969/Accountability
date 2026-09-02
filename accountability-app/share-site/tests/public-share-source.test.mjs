import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public shares use controlled previews and honest store fallbacks", async () => {
  const [page, image] = await Promise.all([
    readFile(new URL("../app/s/[id]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/s/[id]/image/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /summary_large_image/);
  assert.match(page, /\/s\/\$\{encodeURIComponent\(id\)\}\/image/);
  assert.match(image, /public-share-preview/);
  assert.match(image, /Cache-Control/);
  assert.doesNotMatch(page, /apps\.apple\.com\/app\/accountability/);
  assert.doesNotMatch(page, /com\.kingrand\.accountability/);
  assert.doesNotMatch(page, /r2:\/\/|cloudflarestorage|preview_image_url \?/);
});

test("canonical public share surfaces use Mantle identity without changing link identities", async () => {
  const [layout, home, page, lockup, css, favicon] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/s/[id]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/BrandLockup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /title:\s*"Mantle — Build consistency together"/);
  assert.match(page, /"Mantle update"/);
  assert.match(page, /Open in Mantle/);
  assert.match(page, /alt="Branded Mantle progress card"/);
  assert.match(layout, /https:\/\/joinaccountability\.app/);
  assert.match(page, /accountabilityapp:\/\/share\//);

  assert.match(home, /<BrandLockup \/>/);
  assert.equal((page.match(/<BrandLockup \/>/g) ?? []).length, 2);
  assert.match(lockup, /className="brandLockup" role="img" aria-label="Mantle"/);
  assert.equal((lockup.match(/aria-label="Mantle"/g) ?? []).length, 1);
  assert.match(lockup, /className="brandMark"[^>]*aria-hidden="true"/);
  assert.match(lockup, /M20 67C33 41 47 37 58 50C69 63 76 58 87 37/);
  assert.equal((lockup.match(/<circle /g) ?? []).length, 2);
  assert.match(lockup, /className="brandWord" aria-hidden="true">Mantle</);
  assert.match(css, /--mantle-lime:\s*#B9FF3D/i);
  assert.match(css, /--mantle-ivory:\s*#F4F5F1/i);
  assert.match(css, /--mantle-charcoal:\s*#111411/i);
  assert.match(css, /\.brandWord\s*\{[^}]*font-family:\s*"Sora"/s);
  assert.match(css, /\.brandMark\s+path\s*\{[^}]*stroke:\s*var\(--mantle-lime\)/s);
  assert.match(css, /\.brandMark\s+circle\s*\{[^}]*fill:\s*var\(--mantle-lime\)/s);
  assert.doesNotMatch(css, /#60a5fa|#2563eb|#0f3a8a|#bfdbfe|#07111f|#101a2e/i);
  assert.doesNotMatch(css, /font-family:\s*ui-sans-serif/);
  assert.match(favicon, /fill="#111411"/i);
  assert.match(favicon, /stroke="#B9FF3D"/i);
  assert.doesNotMatch(favicon, /#68C4FF|#0C79D8|#2E9EFF/i);
});
