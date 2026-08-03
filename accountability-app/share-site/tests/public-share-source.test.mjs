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
