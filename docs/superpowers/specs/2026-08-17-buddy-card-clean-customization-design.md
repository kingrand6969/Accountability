# Buddy Card Clean Redesign and Customization

Date: 2026-08-17
Status: Approved visual direction; awaiting written-spec approval

## Purpose

The Buddy Card is the account owner's public profile view. Non-buddies use it to understand who the member is before connecting. Confirmed buddies can access the member's fuller profile and posts, while the Buddy Card continues to respect every owner-controlled public visibility setting.

This redesign keeps the card information-rich but removes the heavy, decorative blocks that made it feel busy. Personalization comes from controlled accent palettes and a subtle card atmosphere, not from rearranging or distorting the information hierarchy.

## Approved Visual Direction

The card uses a clean, light surface with soft depth, restrained dividers, compact spacing, and one clear accent color. The layout contains no large rank banner, no visible circular rank frame, no animated aura, no decorative diagonal wedge, and no saturated Current Focus panel.

The full card remains a single readable profile composition rather than a collection of unrelated tiles.

### Information order

1. Profile photo, display name, area, activity status, and member-since date.
2. A small rank crest immediately to the left of the rank name.
3. `Challenges won` directly below the rank information.
4. Current Focus as plain profile text.
5. Rankings.
6. Medals and Challenges.
7. Social proof.
8. Fitness metrics.
9. Recent posts when the owner has enabled them and the viewer is authorized.
10. Owner-only Edit Buddy Card action.

## Current Focus

Current Focus is not a card, alert, banner, or callout. It renders directly on the main Buddy Card surface:

- A small muted `CURRENT FOCUS` label.
- Dark, readable body text.
- No colored background, shadow, icon, border box, or accent stripe.
- Up to three visible lines in the native application.
- `View full focus` appears only when the content is truncated.
- Tapping expands the complete text without navigating to another screen.
- A quiet divider separates Focus from Rankings.

If Current Focus is hidden or empty, the entire section and its divider are omitted without leaving dead space.

## Rank, Rankings, and Challenges

The rank is presented inline with identity information. The crest is compact and sits directly to the left of the rank name. `Rank 10 of 10` and other redundant tier-position copy are not shown.

`Challenges won` appears below rank information. Rankings remain a separate section and may display the owner's enabled country, city, buddy-circle, and points standings. Missing rankings use an em dash rather than a misleading zero.

The rank crest keeps its official rank artwork and tier colors. User customization cannot recolor the crest or alter its meaning.

## Medals and Challenges

The card displays at most four owner-selected featured medals. Each medal uses the application's real medal artwork inside a consistent circular presentation frame. Tier identity is expressed through the medal's official bronze, silver, gold, or platinum treatment and is not overridden by the card palette.

The section title is `Medals and Challenges`. Tapping the section or its `View all` action opens the complete gallery of medals earned and challenges completed by that member. Medal names appear in the detailed gallery or after an individual medal is selected; the compact card does not crowd the row with long labels.

The owner can select and order up to four eligible medals in Edit Buddy Card. Removing a medal from the featured list does not remove the achievement from the full gallery.

## Social and Fitness Information

The card preserves the approved information while using restrained separators and typography:

- Social proof: Cheers, Buddies, and Mutual when another member views the card. When the owner views their own card, Groups replaces Mutual in the third slot.
- Fitness metrics: Consistency, Points, Average kilometres per day, and Distance.

Metric labels and units must not duplicate one another. `Average km/day` and `Distance` remain distinct because one is a daily average and the other is cumulative distance.

## Controlled Customization

Customization changes atmosphere, not structure. Owners choose one preset palette:

1. `polar_blue` — focused and athletic.
2. `victory_ember` — warm and driven.
3. `momentum_teal` — fresh and balanced.
4. `power_violet` — bold but polished.

Each preset defines:

- Primary accent color.
- Secondary accent color.
- Very light surface tint.
- Subtle ambient glow.
- Light canvas tint.

The palette may color links, the owner edit action, small status values, avatar fallback accents, subtle medal frames, and low-contrast background atmosphere. It must not recolor official rank or medal artwork.

The following remain protected and cannot be customized:

- Layout, section order, and spacing.
- Typography scale.
- Text and control contrast.
- Touch-target sizes.
- Rank and medal tier identity.
- Privacy visibility controls.
- Light/dark application theme selection.

There is no arbitrary color picker, custom CSS, free-form gradient editor, section drag-and-drop, or per-element font selector. Presets prevent unreadable or visually broken public profiles.

### Theme behavior

Buddy Card palettes are independent of the application's Light/Dark preference. Every palette has reviewed light and dark token values. This design's approved preview is the light appearance; dark appearance must preserve the same hierarchy and WCAG-compliant contrast without inverting official badge artwork.

## Editing Experience

Edit Buddy Card includes a live preview that uses the same presentation component visitors see.

The editor groups controls into:

1. Profile content: Current Focus and About.
2. Public visibility: area, activity, rank, medals, metrics, selected posts, and other existing consent switches.
3. Featured medals: select and reorder up to four earned medals.
4. Appearance: choose one of the four palette presets.

Selecting a palette updates the preview immediately but does not persist until the owner saves. Save is a single operation. On failure, the editor retains unsaved choices, shows a clear error, and allows retry. Leaving with unsaved changes asks for confirmation.

## Data Model and Privacy

The existing `profiles.buddy_card` JSON remains the owner-controlled storage boundary. Add only these presentation fields:

- `palette_key`: one of the four approved palette identifiers; unknown values fall back to `polar_blue`.
- `featured_medal_ids`: an ordered array of zero to four earned medal identifiers.

The saved value is validated client-side and at the database boundary. The public-profile projection may expose only these approved presentation values and the existing fields whose `show_*` consent gate is enabled. No private profile value becomes public because a palette is selected.

The owner may always view their own Buddy Card without sending a buddy request to themselves. Existing relationship rules continue to determine whether a viewer receives the full buddy profile or the public Buddy Card and which posts may be read.

## Component Boundaries

- `BuddyCardPalette`: a typed preset registry containing light and dark tokens.
- `BuddyCardIdentity`: photo, identity metadata, inline rank, and challenges won.
- `BuddyCardFocus`: truncation, expansion, and empty-state removal.
- `BuddyCardRankings`: authorized ranking values with missing-data handling.
- `BuddyCardAchievements`: four selected medals and full-gallery navigation.
- `BuddyCardMetrics`: social and fitness information.
- `PublicBuddyCardFace`: composes these sections and applies only validated palette tokens.
- `BuddyCardEdit`: manages draft content, visibility, featured medals, palette selection, preview, and save.

These components receive already-authorized data. Presentation components do not fetch private data or decide relationship access.

## Accessibility

- Text and interactive controls meet WCAG AA contrast in every palette and both app themes.
- Interactive elements have a minimum 48-by-48 point target.
- The expanded/collapsed Focus control exposes its state and a descriptive label.
- Palette choices use radio semantics, expose the selected state, and are identified by name rather than color alone.
- Featured medal selection communicates the four-item maximum and selection order.
- Rank and medal images have meaningful labels; decorative glows are ignored by assistive technology.
- Reduced-motion settings disable nonessential palette or preview transitions.

## Loading, Empty, and Error States

- Identity and card data use the existing loading treatment and never flash another account's cached profile.
- Missing avatar uses the palette-aware fallback without hiding the display name.
- Missing optional sections collapse completely and leave no spacer.
- Failed optional metrics show no invented values; the base profile remains usable.
- A failed gallery navigation or save produces a visible, retryable error.
- Account changes invalidate pending loads and saves so one account cannot publish another account's appearance choices.

## Verification

Tests must cover:

- Focus hidden, empty, short, exactly three lines, truncated, expanded, and collapsed.
- All four palette keys in light and dark themes, including contrast assertions and unknown-key fallback.
- Palette changes do not recolor official rank or medal artwork.
- Owner medal selection, order, four-item maximum, ineligible medal rejection, and gallery navigation.
- Missing ranking and metric values without misleading zeros or dead space.
- Owner self-view without a connection request.
- Buddy versus non-buddy post visibility and existing `show_*` consent behavior.
- Draft palette changes, save success, save failure with retry, unsaved-change confirmation, account-switch suppression, and preview parity.
- Screen-reader labels, selection state, expansion state, reduced motion, and 48-point touch targets.

Device verification must include a small Android handset with enlarged text and an iPhone-sized viewport to confirm that Focus, rankings, four medals, and edit controls remain readable without overlap.

## Out of Scope

- Changing how rank, points, medals, challenges, or rankings are calculated.
- Adding new achievements or medal artwork.
- Arbitrary user-created colors, images, fonts, or layouts.
- Reordering card sections.
- Changing the Buddies/Public audience model.
- Changing application-wide Light/Dark settings.
