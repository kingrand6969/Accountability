# AccountAbility Dark-Only Visual System

**Status:** Approved design awaiting written-spec review  
**Date:** 2026-08-28  
**Reference:** Approved charcoal/black and neon-green mobile mock-up

## Objective

Make the entire AccountAbility mobile app use one permanent dark visual system. The app must no longer follow the phone's light appearance, offer a light-mode control, hydrate a saved light preference, or display light-theme fallback surfaces.

The result should feel like one product across authentication, onboarding, Feed, Journey, Run, Messages, discovery, creation flows, settings, modals, forms, empty states, and error states. Photos, videos, maps, route art, and user-selected backgrounds retain their natural colors.

## Approved visual language

| Role | Value | Use |
| --- | --- | --- |
| Canvas | `#0B0D0B` | Root screens and navigation backgrounds |
| Card | `#121512` | Primary content surfaces |
| Raised | `#181C18` | Sheets, fields, menus, active panels |
| Muted | `#202520` | Secondary controls and disabled surfaces |
| Subtle border | `#272D27` | Dividers and surface boundaries |
| Strong border | `#465046` | Focused or elevated boundaries |
| Primary text | `#F7F8F4` | Titles and important content |
| Secondary text | `#CED4CB` | Body copy |
| Muted text | `#9DA59D` | Metadata and helper text |
| Neon action | `#B9FF3D` | Primary actions, selected states, progress |
| Neon-on-action ink | `#0B0D0B` | Text and icons on neon controls |

Primary CTAs follow the approved mock-up: pill-shaped, visually quiet charcoal/black foundations with neon label or neon fill when stronger emphasis is required. Decorative gradients, blue accents, orange accents, and generic glass-card styling are not part of the foundation.

## Theme architecture

`AppThemeProvider` becomes a dark-only provider:

- It renders `dark` immediately.
- It synchronizes the native color scheme to dark.
- It does not read or write an appearance preference.
- Its public `setMode` compatibility can remain temporarily as a no-op returning dark where removing it immediately would create unnecessary migration risk.
- The appearance selector is removed from user-facing settings.
- Existing stored light preferences are ignored; no user data other than the obsolete appearance choice is changed.

`themeColors('dark')` remains the semantic source of truth. New code consumes semantic roles such as `surface.canvas`, `surface.card`, `ink.primary`, `ink.action`, and `border.subtle`. Screens must not reproduce the approved palette through local raw hex values.

## Surface conversion

The conversion covers all app-owned chrome and content surfaces:

1. **App shell:** status/navigation bars, splash transition, route headers, tab bar, drawers, menus, safe-area backgrounds.
2. **Entry:** sign-in, sign-up, password recovery, verification, onboarding, permissions, and paywall.
3. **Primary tabs:** Feed, Journey, Run, and Messages.
4. **Social:** post details, composer, comments, sharing, My Day, Buddy Cards, buddy discovery, groups, pages, notifications, and search.
5. **Fitness and tracking:** pre-run, active run, pause/resume/end states, run history, share editor, gym, diet, body, progress, and insights.
6. **Secondary flows:** achievements, challenges, memories, invitations, profile editing, help, and legal content.
7. **Overlays:** alerts, action sheets, modals, dropdowns, keyboard-adjacent controls, loading skeletons, empty states, offline states, and errors.

Maps, photography, video, avatars, medals, and route artwork keep their source colors. Dark scrims may be added only when necessary for text contrast.

## Component behavior

- Navigation and icon families stay consistent with the approved mock-up.
- Interactive targets remain at least 48 dp on Android and 44 pt on iOS.
- Pressed, selected, focused, disabled, loading, success, warning, and error states must remain distinguishable without relying on color alone.
- Inputs use raised dark surfaces, visible labels, strong focus borders, and readable placeholder text.
- Sheets use a 64% black scrim and clear surface separation without heavy shadows.
- Empty and error states stay compact and actionable; the conversion must not introduce blank screens.
- Motion remains subtle and respects reduced-motion settings.

## Migration strategy

The work is implemented in controlled layers:

1. Lock the provider and system chrome to dark.
2. Remove appearance controls and obsolete preference hydration.
3. Convert shared primitives and semantic tokens.
4. Audit every registered route for hardcoded light surfaces and light-only branches.
5. Convert feature-specific palettes without changing feature behavior.
6. Verify overlays and transient states.
7. Run visual and functional regression checks before installing a new staging APK.

This is a visual-system migration. It must not alter authentication, privacy, activity tracking, post visibility, moderation, health data, or navigation semantics.

## Failure handling

- Missing storage or appearance APIs cannot block startup because the theme no longer depends on them.
- A screen that has not yet been converted must still inherit the dark root canvas, preventing a white flash.
- Loading, offline, empty, and error surfaces use the same dark semantic roles as loaded content.
- Native alerts that cannot be fully themed remain platform-native; app-owned dialogs must use the dark system.

## Verification

Automated checks will cover:

- Provider always returns dark and ignores saved/system light preferences.
- No appearance selector remains reachable.
- Registered app routes render against dark semantic tokens.
- Theme-dependent component tests are updated to the dark-only contract.
- TypeScript, lint, focused tests, and the complete test suite pass.

Visual verification will cover small and large phone widths, largest practical text size, and these representative screens:

- Sign-in and onboarding
- Feed and post detail
- Journey and progress
- Run ready, active, paused, and completed/share states
- Messages and chat
- Discover and Buddy Card
- Composer, modal, error, empty, and offline states

The final staging APK must be installed in place on the connected phone, preserve existing app data, launch without a white flash, and show the dark system across primary navigation.

## Acceptance criteria

- AccountAbility never changes to light mode, even when the phone uses light appearance.
- No user-facing appearance selector offers light mode.
- No app-owned primary screen shows a white or cream canvas.
- Neon green is the only primary brand action color; orange and blue are absent from shared app chrome.
- Photos and maps retain natural color.
- Primary flows remain functionally unchanged and error-free.
- The approved charcoal/neon visual hierarchy is recognizably consistent across the whole app.
