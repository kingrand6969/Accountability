# Unbroken A Brand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every generated and in-app brand surface with the approved Unbroken A while preserving existing dimensions, Expo configuration, and accessibility.

**Architecture:** Replace the two-head/two-ribbon schema in the authoritative `brandGeometry.ts` contract with a single A silhouette plus its rising inner accent. Update `BrandMark` and the Node asset generator to consume only that contract, then regenerate the established PNG inventory so launcher, splash, header, favicon, and in-app marks cannot drift.

**Tech Stack:** TypeScript, React Native SVG, Node, Sharp, Jest, Expo SDK 56.

---

## File map

- Modify `src/ui/brandGeometry.ts` — authoritative Unbroken A paths, colors, and wordmark.
- Modify `src/ui/brandGeometry.test.ts` — schema, immutable geometry, generator, inventory, and raster-content contracts.
- Modify `src/ui/BrandMark.tsx` — in-app A and optional wordmark renderer.
- Modify `scripts/generate-brand-assets.mjs` — deterministic rasterization of the A geometry.
- Regenerate the eight existing files under `assets/images/` without changing names or dimensions.

## Task 1: Define the Unbroken A contract

- [ ] Replace the current geometry assertions with failing tests requiring `mark.primaryPath`, `mark.accentPath`, no `heads`, no `ribbons`, the approved palette, and `BRAND_WORDMARK === 'Accountability'`.
- [ ] Run `npm.cmd test -- --runInBand src/ui/brandGeometry.test.ts` and confirm RED because the current contract still exposes heads/ribbons and `AccountAbility`.
- [ ] Replace `BrandGeometry` and `parseBrandGeometry` with a validated, deeply immutable single-mark schema.
- [ ] Store the approved A primary path and inner rising accent path in the JSON payload; reject empty/malformed paths and unknown legacy geometry.
- [ ] Run the focused test and confirm the geometry-contract assertions are GREEN.
- [ ] Commit with `feat: define the Unbroken A brand geometry`.

## Task 2: Render one authoritative mark everywhere

- [ ] Add failing source/behavior assertions that `BrandMark` and the generator render `primaryPath` and `accentPath`, never render circles/heads/ribbons, and use the monochrome primary silhouette without depending on cyan.
- [ ] Run the focused test and confirm RED against the legacy renderers.
- [ ] Update `BrandMark.tsx` to draw the primary and optional accent paths from `BRAND_GEOMETRY` while retaining current sizing and accessibility behavior.
- [ ] Update `generate-brand-assets.mjs` so all logo variants consume the same paths and color contract; keep the existing output filenames, dimensions, safe areas, and adaptive-icon backgrounds.
- [ ] Run the focused test and confirm GREEN.
- [ ] Commit with `feat: render the Unbroken A across brand surfaces`.

## Task 3: Regenerate and verify production assets

- [ ] Add a failing raster-content assertion that generated color assets contain cobalt/cyan pixels and generated monochrome output contains the approved one-color mark, rather than merely checking PNG dimensions.
- [ ] Run the focused test and confirm RED before regenerating committed assets.
- [ ] Run `node scripts/generate-brand-assets.mjs` to replace only the eight established brand PNGs.
- [ ] Inspect `icon.png`, `android-icon-foreground.png`, `android-icon-monochrome.png`, `splash-icon.png`, `logo-mark.png`, `logo.png`, `wordmark.png`, and `favicon.png` at original resolution.
- [ ] Run `npm.cmd test -- --runInBand src/ui/brandGeometry.test.ts`, `npx.cmd tsc --noEmit`, `npm.cmd run lint`, and `npm.cmd test -- --runInBand`.
- [ ] Run `npx.cmd expo export --platform android --output-dir dist-unbroken-a` and remove only that generated verification directory afterward.
- [ ] Commit with `feat: apply the Unbroken A identity`.

## Task 4: Preview acceptance

- [ ] Verify the Feed header uses the A plus “Accountability” without clipping.
- [ ] Verify Light and Dark app icons preserve the A counter and rising cut at launcher size.
- [ ] Verify splash and favicon remain centered and legible.
- [ ] Verify TalkBack announces “Accountability” rather than describing decorative geometry.
- [ ] Do not publish an Expo update or build until the user separately approves deployment.

