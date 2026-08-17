# Unbroken A Brand Design

Date: 2026-08-13
Status: Approved visual direction

## Goal

Replace the current two-person mark—which can read as an “M”—with a single, unmistakable, proprietary capital **A** that expresses motivation and strength.

## Symbol

The approved mark is **The Unbroken A**:

- The outer A represents Accountability and personal strength.
- Its two grounded legs represent the individual and their accountability partner.
- The crossbar represents the commitment connecting them.
- The rising inner cut represents motivation becoming upward progress.
- The open, forward crown suggests that progress continues.

The official brand meaning is:

> Two people connected by commitment, turning motivation into strength and rising together.

The supporting brand line is:

> Show up. Rise stronger. Together.

## Geometry

- The symbol is one capital A, not an AC monogram.
- It must remain recognizably A-shaped at 16, 24, and 48 pixels.
- The A uses a bold asymmetric athletic stance, grounded legs, a clear counter, and subtly softened corners.
- A rising negative-space cut sits inside the counter without becoming a literal arrow, flame, mountain, or checkmark.
- A restrained cyan accent may occupy the rising inner cut in color variants.
- The monochrome variant preserves the same silhouette and negative space without relying on cyan.

## Color and wordmark

- Primary cobalt: `#155EEF`
- Deep ink navy: `#081A3A`
- Cyan motivation accent: `#20C7D9`
- Warm cream/light background: `#F7F4EC`
- The wordmark reads exactly **Accountability**.
- The wordmark uses a bold humanist athletic sans treatment: confident, friendly, readable, and not excessively italic or futuristic.

## Production surfaces

The same authoritative geometry must generate:

- iOS/general launcher icon
- Android adaptive foreground and monochrome icon
- Splash icon
- Standalone logo mark
- Header wordmark lockup
- Full logo lockup
- Favicon
- In-app vector `BrandMark`

Existing asset dimensions and Expo configuration remain unchanged. The Android background asset remains compatible with the current adaptive-icon contract.

## Accessibility and compatibility

- In-app identity remains exposed as “Accountability” to assistive technology.
- The mark must retain strong contrast in Light and Dark Modes.
- Small surfaces use the standalone A; wider header surfaces use the A plus wordmark.
- Existing routes, behavior, and navigation are unchanged.

## Rejected directions

Do not reintroduce:

- The previous two-head/two-ribbon mark or any M-like silhouette.
- AC or paired-CC monograms.
- Human figures, hands, animals, anatomy, shields, checks, flames, dumbbells, hearts, arrows, or generic fitness symbols.
- Gradients, glow, bevels, or three-dimensional effects in the production geometry.

## Acceptance criteria

- One immutable geometry contract is consumed by both React Native and the asset generator.
- Every generated asset uses The Unbroken A.
- The mark is identifiable at 16 pixels and preserves its counter in monochrome.
- The header lockup fits without clipping in existing navigation bounds.
- The generated PNG inventory and dimensions remain unchanged.
- Focused brand tests, TypeScript, lint, and the full Jest suite pass.
