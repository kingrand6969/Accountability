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

test("canonical public share surfaces use Mantle copy without changing link identities", async () => {
  const [layout, home, page] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/s/[id]/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /title:\s*"Mantle — Build consistency together"/);
  assert.match(home, /className="brand">Mantle</);
  assert.match(page, /"Mantle update"/);
  assert.match(page, /Open in Mantle/);
  assert.match(page, /alt="Branded Mantle progress card"/);
  assert.match(layout, /https:\/\/joinaccountability\.app/);
  assert.match(page, /accountabilityapp:\/\/share\//);
});
