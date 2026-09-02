# Feed Utility Action Clarity Design

## Decision

Replace the Feed post's ambiguous paper-plane and stacked-tray actions with the approved **Icon + Micro-label** treatment (visual option C).

The action row remains divided by purpose:

- Left: social feedback — Cheer and Comments.
- Right: post utilities — Share and Save.

## Approved appearance

### Share

- Use the familiar share-arrow rising from an open tray.
- Display the micro-label `Share` beneath the icon.
- Keep the action neutral until pressed; do not use Mantle neon as a persistent selected state.

### Save to Memories

- Use an outline bookmark when the post is not saved.
- Use a filled bookmark when the post is saved.
- Display the micro-label `Save` beneath the icon in both states.
- Preserve the existing save/unsave behavior and feedback.

### Shared styling

- Keep icons visually consistent with the approved Solid Signal Cheer row.
- Use the existing muted foreground color for inactive utility actions.
- Use 21–23 px icons with at least a 44 px touch target.
- Use a compact, legible micro-label around 9–10 px beneath each icon.
- Do not add pills, boxes, glow, or background fills around the utility actions.
- Retain the current spacing and left/right grouping.

## Scope

Apply the same visual language to every Feed post presentation that exposes Share or Save to Memories, including the standard proof card and immersive post variants.

This change does not alter navigation, persistence, share-sheet behavior, memory storage, Cheer, Comments, counts, or post layout.

## Interaction and accessibility

- The visible labels must match the accessible action names.
- Share opens the existing system share behavior.
- Save toggles the existing Memories state.
- Saved state must remain distinguishable through the filled bookmark, without relying only on color.
- Touch targets must remain at least 44 by 44 px.

## Verification

- Contract tests confirm the paper-plane and album/tray glyphs are absent from Feed utilities.
- Contract tests confirm the approved share and bookmark glyphs and visible labels are present in both post variants.
- Existing interaction tests continue to verify Share and Save behavior.
- Type checking and the complete test suite pass.
- Device review confirms the actions read clearly at actual phone size in both saved and unsaved states.
