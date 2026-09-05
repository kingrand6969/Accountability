# Run Share Rounded CTA — Approved Visual Direction

**Status:** Approved visual target; not implemented in production UI

## Scope

This decision changes only the primary Run Share action. The approved Run Share layout, hierarchy, controls, copy, spacing, map, privacy rows, and secondary actions remain unchanged.

## Light mode

- Near-black charcoal capsule (`#111411`)
- Neon-green label and arrow (`#B9FF3D`)
- Fully rounded ends
- Subtle soft shadow for separation from the warm off-white canvas
- Label remains `CONTINUE TO FEED` with a right arrow

Approved reference: `../../../.superpowers/brainstorm/run-share-redesign-20260824/content/run-editor-rounded-cta-light-approved.png`

## Dark mode

- Charcoal/black canvas (`#0B0D0B`)
- Near-black capsule with a quiet border or shadow so its edge remains visible
- Neon-green label and arrow (`#B9FF3D`)
- Warm-white primary text elsewhere (`#F4F5F1`)
- Neon remains restricted to route, selection, status, and primary-action signals

Approved reference: `../../../.superpowers/brainstorm/run-share-redesign-20260824/content/run-editor-rounded-cta-dark-approved.png`

## Interaction and accessibility

- Preserve the current full-width placement and page flow.
- Maintain a minimum 48-point touch target.
- Keep the CTA enabled, disabled, busy, pressed, and focus states truthful and visually distinct.
- The button label must remain readable at large text sizes without clipping.
- The capsule treatment must not introduce orange, blue, purple, gradients, glow, or additional controls.

## Implementation boundary

These files are visual references only. No production component, token, navigation, publishing, or privacy behavior is changed by this approval. Production implementation requires a separate reviewed implementation plan.
