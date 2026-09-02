# Feed Cheer — Solid Signal Design

## Status

Approved by the user on 2026-09-03 by selecting direction C, “Solid Signal.”

## Goal

Replace the current improvised two-hand Cheer icon with a clear, premium Thumbs Up treatment that reads correctly at feed scale and gives immediate visual feedback after a Cheer.

## Approved presentation

- Resting state: a clean outline Thumbs Up icon in Mantle’s muted foreground color.
- Cheered state: the same Thumbs Up silhouette becomes solid neon green.
- Icon size: 21 px in the feed action row.
- Count: remains immediately beside the icon and uses a compact tabular number style.
- No pill, badge, halo, circle, filled button background, or decorative glow container.
- The active state is communicated by the outline-to-solid transition and neon color only.

## Action-row composition

- Cheer and Comments form the primary social group on the left.
- Share and Save to Memories form the utility group on the right.
- The row remains visually quiet beneath the post media and caption.
- Each action retains a minimum 44 × 44 point touch target even though the visible icon is 21 px.
- A subtle inset hairline may separate the action row from the caption; it must not run through an icon or create a boxed toolbar.

## Interaction and accessibility

- Tapping Cheer keeps the existing like/cheer behavior and count updates.
- The icon changes from outline to solid whenever `liked_by_me` is true.
- The existing “Cheer” and “Remove Cheer” accessibility labels and selected state remain intact.
- Comment, Share, and Save to Memories behavior must not change.
- Press feedback remains restrained and must not introduce a capsule or permanent background.

## Implementation boundary

- Update the Feed post action component and its focused appearance/contract tests.
- Do not change database behavior, post APIs, counters, navigation, or unrelated feed styling.
- Reuse the project’s existing icon library when it provides matching outline and solid Thumbs Up glyphs; otherwise add one tightly scoped local icon component.

## Acceptance criteria

1. An uncheered post shows the outline Thumbs Up.
2. A cheered post shows a solid neon Thumbs Up.
3. The count stays aligned beside the icon in both states.
4. No active-state capsule, ring, halo, or button background appears.
5. All four actions remain usable with at least 44 × 44 point targets.
6. Existing Cheer, Comment, Share, Save, and accessibility behavior passes focused tests.
7. The phone preview matches direction C approved in the visual companion.
