// Recover true alpha from medal PNGs that have a fake transparency checkerboard
// baked in. The artwork pixels are untouched — we only compute what was always
// meant to be transparent.
//
//   1. find the two checker greys (neutral, bright, regular)
//   2. flood-fill from the image border across checker-coloured pixels -> the
//      EXTERIOR background (interior bright highlights are never touched)
//   3. build a smooth per-block background map B
//   4. for every non-bg pixel, unmix C = a*F + (1-a)*B  (luma key both ways)
//   5. any translucent region fully ENCLOSED by solid art is forced opaque
//      (protects silver/diamond interior highlights)
//   6. write RGBA at 512px, plus a preview composite
//
// usage: node mkalpha.js <in.png> <out.png> [previewDir]
const sharp = require('sharp');

async function run(inPath, outPath) {
  const { data, info } = await sharp(inPath).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, CH = info.channels;
  const N = W * H;
  const px = (i, c) => data[i * CH + c];

  // ── 1. checker greys ───────────────────────────────────────────────────────
  const lums = [];
  for (let i = 0; i < N; i += 7) {
    const r = px(i, 0), g = px(i, 1), b = px(i, 2);
    if (Math.abs(r - g) <= 6 && Math.abs(g - b) <= 6 && Math.abs(r - b) <= 6) {
      const l = (r + g + b) / 3;
      if (l > 180) lums.push(l);
    }
  }
  lums.sort((a, b) => a - b);
  const lo = lums[Math.floor(lums.length * 0.15)] ?? 235; // darker cell
  const hi = lums[Math.floor(lums.length * 0.85)] ?? 255; // lighter cell
  const TOL = Math.max(8, (hi - lo) * 0.45);

  const isBgColour = (i) => {
    const r = px(i, 0), g = px(i, 1), b = px(i, 2);
    if (Math.abs(r - g) > 7 || Math.abs(g - b) > 7 || Math.abs(r - b) > 7) return false;
    const l = (r + g + b) / 3;
    return Math.abs(l - lo) <= TOL || Math.abs(l - hi) <= TOL;
  };

  // ── 2. flood fill exterior bg from the border ─────────────────────────────
  const bg = new Uint8Array(N); // 1 = exterior background
  const queue = new Int32Array(N);
  let qh = 0, qt = 0;
  const push = (i) => { if (!bg[i] && isBgColour(i)) { bg[i] = 1; queue[qt++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % W, y = (i / W) | 0;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (y > 0) push(i - W);
    if (y < H - 1) push(i + W);
  }

  // ── 3. smooth background map (16px blocks, dilated inward) ────────────────
  const BS = 16, BW = Math.ceil(W / BS), BH = Math.ceil(H / BS);
  const bSum = new Float64Array(BW * BH), bCnt = new Float64Array(BW * BH);
  for (let i = 0; i < N; i++) {
    if (!bg[i]) continue;
    const bx = ((i % W) / BS) | 0, by = (((i / W) | 0) / BS) | 0;
    bSum[by * BW + bx] += (px(i, 0) + px(i, 1) + px(i, 2)) / 3;
    bCnt[by * BW + bx]++;
  }
  const bMap = new Float64Array(BW * BH).fill(-1);
  for (let i = 0; i < BW * BH; i++) if (bCnt[i] > 8) bMap[i] = bSum[i] / bCnt[i];
  // dilate until filled
  for (let pass = 0; pass < BW + BH; pass++) {
    let changed = false;
    for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) {
      const i = by * BW + bx;
      if (bMap[i] >= 0) continue;
      let s = 0, c = 0;
      if (bx > 0 && bMap[i - 1] >= 0) { s += bMap[i - 1]; c++; }
      if (bx < BW - 1 && bMap[i + 1] >= 0) { s += bMap[i + 1]; c++; }
      if (by > 0 && bMap[i - BW] >= 0) { s += bMap[i - BW]; c++; }
      if (by < BH - 1 && bMap[i + BW] >= 0) { s += bMap[i + BW]; c++; }
      if (c) { bMap[i] = s / c; changed = true; }
    }
    if (!changed) break;
  }

  // ── 4. unmix ──────────────────────────────────────────────────────────────
  const out = Buffer.alloc(N * 4);
  const alpha = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = px(i, 0), g = px(i, 1), b = px(i, 2);
    if (bg[i]) { alpha[i] = 0; continue; }
    const bx = ((i % W) / BS) | 0, by = (((i / W) | 0) / BS) | 0;
    const B = bMap[by * BW + bx] >= 0 ? bMap[by * BW + bx] : (lo + hi) / 2;
    let a = 0;
    for (const c of [r, g, b]) {
      if (c < B) a = Math.max(a, (B - c) / B);            // darker than bg
      else if (B < 254) a = Math.max(a, (c - B) / (255 - B)); // brighter than bg
    }
    // strong colour = definitely art
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat > 26) a = Math.max(a, Math.min(1, sat / 60));
    alpha[i] = Math.min(1, a * 1.06);
  }

  // ── 5. enclosed translucency -> opaque (interior highlights) ──────────────
  const outside = new Uint8Array(N);
  qh = 0; qt = 0;
  const push2 = (i) => { if (!outside[i] && alpha[i] < 0.985) { outside[i] = 1; queue[qt++] = i; } };
  for (let x = 0; x < W; x++) { push2(x); push2((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push2(y * W); push2(y * W + W - 1); }
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % W, y = (i / W) | 0;
    if (x > 0) push2(i - 1);
    if (x < W - 1) push2(i + 1);
    if (y > 0) push2(i - W);
    if (y < H - 1) push2(i + W);
  }
  for (let i = 0; i < N; i++) if (!outside[i] && alpha[i] < 1 && alpha[i] > 0) alpha[i] = 1;

  // ── 6. recover F and write ────────────────────────────────────────────────
  for (let i = 0; i < N; i++) {
    const a = alpha[i];
    const o = i * 4;
    if (a <= 0.004) { out[o + 3] = 0; continue; }
    const bx = ((i % W) / BS) | 0, by = (((i / W) | 0) / BS) | 0;
    const B = bMap[by * BW + bx] >= 0 ? bMap[by * BW + bx] : (lo + hi) / 2;
    for (let c = 0; c < 3; c++) {
      const C = px(i, c);
      const F = a >= 0.999 ? C : (C - (1 - a) * B) / a;
      out[o + c] = Math.max(0, Math.min(255, Math.round(F)));
    }
    out[o + 3] = Math.round(a * 255);
  }

  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .resize(512, 512, { fit: 'inside' })
    .png({ compressionLevel: 9, palette: false })
    .toFile(outPath);
  return { lo: Math.round(lo), hi: Math.round(hi) };
}

(async () => {
  const [inPath, outPath] = process.argv.slice(2);
  const r = await run(inPath, outPath);
  console.log('done', inPath.split(/[\\/]/).pop(), '-> checker greys', r.lo, r.hi);
})().catch((e) => { console.error(e); process.exit(1); });
