# Feed Action Icons Design

## Goal

Make the Feed action row cleaner and more balanced by replacing text-heavy actions with a consistent icon-only presentation. This is a visual change only; existing Cheer, Comment, Share, and Save behavior remains unchanged.

## Final icon set

- Cheer: an applause/clap outline icon. The icon turns blue when the current user has cheered the post.
- Comment: a rounded speech-bubble outline icon.
- Share: a paper-plane outline icon.
- Save: a photo-album outline icon. The icon turns blue after the photo is saved to Memories.

Use the closest coherent Ionicons glyphs already available in the application. Do not introduce another icon library or custom image assets.

## Layout and spacing

- Render the four actions in one horizontal row.
- Give each action an equal-width slot using `flex: 1`.
- Keep every touch target at least 48 points high and wide.
- Center each icon-and-count group within its slot.
- Use consistent icon sizing and optical alignment across all four slots.
- Retain the existing dividers, card width, and surrounding Feed layout.
- Do not add decorative per-action colors. Default icons use the existing muted action color.

## Counts and states

- Keep the Cheer count beside the clap icon when the count is greater than zero.
- Keep the Comment count beside the comment icon when the count is greater than zero.
- Do not display zero counts.
- Share has no persistent active state.
- Save preserves its busy spinner and saved state.
- Active Cheer and completed Save use the existing primary blue. Pressed feedback remains subtle and consistent.

## Accessibility

Removing visible labels must not remove meaning for assistive technology.

- Cheer announces `Cheer` or `Remove Cheer`, including its count when present, and exposes the selected state.
- Comment announces `View comments`, including its count when present.
- Share announces `Share this post`.
- Save announces `Save to Memories` or `Saved to Memories` and retains busy/disabled state.
- All four controls remain accessibility buttons with at least 48-point touch targets.

## Scope

Update the reusable Feed action row and inline Save control so they present one coherent icon-only set. Preserve post-detail actions, menus, data models, ranking, navigation, APIs, and database behavior unless they directly reuse the same component and naturally inherit the presentation.

## Verification

- Add failing presentation-contract tests before production edits.
- Assert the exact icon choices, absence of visible action labels, conditional counts, equal-width layout, minimum touch height, and accessibility labels/states.
- Run focused Feed and Memories tests, TypeScript, lint, and the relevant broader Feed contract suite.
- Manually verify on the connected Android phone at normal and large font settings, checking alignment, tap targets, active Cheer, saved state, counts, and screen-reader metadata.
