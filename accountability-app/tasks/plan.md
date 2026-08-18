# Implementation Plan: App-wide Athlete UX and Flow Audit

## Overview

Audit and improve AccountAbility as one connected runner/athlete experience. The work starts with evidence from the route graph, source contracts, and the live Android preview, then ships small vertical fixes that make Post/Flex creation direct, navigation and Back predictable, loading feel immediate, and every screen share one clean light/dark visual language.

## Architecture Decisions

- Preserve the approved blue/cyan AccountAbility identity and existing light/dark preference. The external design-system search returned off-brand orange/rose palettes, so only its verified structural guidance is adopted.
- Use the existing `src/ui/theme.ts` and `src/ui/typography.ts` as the source of truth; extend semantic tokens and reusable primitives before repeating screen-local values.
- Repair journeys vertically: entry point, destination, success/error state, and Back path are verified together rather than redesigning isolated screens.
- Keep four primary tabs (Feed, Journey, Run, Messages). Secondary destinations remain in Menu or contextual actions.
- Treat 48dp Android touch targets, safe-area clearance, Dynamic Type, reduced motion, and light/dark contrast as release requirements.
- Preserve already-loaded content during refresh when safe; use reserved skeletons for cold loads instead of a mostly blank screen.

## Task List

### Phase 1: Evidence and release blockers

- [x] Task 1: Complete route, link, Back, and live-device audit.
- [x] Task 2: Add authoritative navigation contracts and repair broken/dead-end routes.
- [x] Task 3: Make the primary Post entry open the real composer directly.
- [x] Task 4: Simplify composer draft, keyboard, submit, and exit behavior.
- [x] Task 5: Make Flex creation a coherent contextual flow with one clear completion path.

### Checkpoint: Core journeys

- [ ] Feed → Post → publish/cancel → Feed works without chooser pages or black screens.
- [ ] Feed → Flex → share/finish → Feed or destination works without redundant pages.
- [ ] Hardware Back and visible Back agree on every audited route.

### Phase 2: Perceived speed and visual foundation

- [x] Task 6: Replace blank Feed reloads with preserved content or a stable skeleton.
- [x] Task 7: Consolidate semantic spacing, divider, card, icon, and interaction-state tokens.
- [x] Task 8: Apply the visual foundation to Feed and post detail.
- [x] Task 9: Apply the visual foundation to Journey and Run.
- [x] Task 10: Apply the visual foundation to Messages, Menu, and discovery.

### Checkpoint: Primary app

- [ ] Primary tabs look and behave like one product in light and dark mode.
- [ ] No primary screen hides content under the keyboard, header, tab bar, or system bars.
- [ ] Initial and refresh states remain visually stable and responsive.

### Phase 3: Secondary journeys and acceptance

- [ ] Task 11: Audit and polish groups, pages, challenges, achievements, profile/Buddy Card, and supporting forms.
- [ ] Task 12: Run accessibility, responsive-text, reduced-motion, and theme acceptance.
- [ ] Task 13: Run full tests/export and live Android end-to-end acceptance.

### Checkpoint: Release-ready

- [ ] Every user-facing route has a reachable entry, truthful state, and predictable exit.
- [ ] Every Post/Flex journey has one obvious next action and no redundant page hop.
- [ ] All automated checks and Android acceptance scenarios pass.
- [ ] Remote push and Expo preview upload occur only after explicit user approval.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Broad visual edits introduce regressions | High | Roll out by vertical screen slice with focused contracts and device captures. |
| Navigation repairs alter deep-link behavior | High | Preserve typed params and test cold-link, root Back, nested Back, and account-switch cases. |
| Faster loading exposes stale account data | High | Preserve content only within the same authenticated owner/generation; clear on account changes. |
| Composer simplification loses drafts or audience settings | High | Keep draft/audience state in the existing composer and add direct-entry regression tests before routing changes. |
| App-wide token changes unintentionally restyle approved Buddy Card | Medium | Use additive semantic tokens and exclude approved components unless a verified defect exists. |
| Static checks miss device-specific Android issues | High | Verify core flows on the connected Android 16 device after each checkpoint. |

## Open Questions

- None blocking. Existing decisions remain authoritative: blue/cyan identity, light and dark themes, four main tabs, Buddy Card as the public profile view, and direct creation flows.

## Baseline findings (2026-08-18)

- Android comments were being moved twice: native `resize` plus a full manual keyboard translation. The first tap opened Gboard but lost focus.
- Feed posts were hidden behind a full-screen spinner while optional Cheer/supporter previews continued loading.
- Standard Post entry intentionally routed through Create Hub and Continue instead of the editor.
- App/auth/onboarding bootstrap could render a blank surface or remain loading forever after a rejected session read.
- My Day currently names both a 24-hour story and a reminder scheduler; the story meaning is authoritative and the scheduler needs a distinct name.
- Flex publishing is fragmented across rank, leaderboard, medal, run, challenge, and Win Card paths and needs one typed preview/editor contract.
- Post/Event publishing contains retry-safety and atomicity risks that must be fixed before release.
- Route files exist for every audited internal destination, but preview deep-link scheme handling, several raw Back exits, and some destination choices are incorrect.
- The app has useful theme tokens, but no global manual Light/Dark provider; visual sizing, contrast, card elevation, and loading states remain inconsistent outside the approved Buddy Card.

## Implemented locally (not yet pushed or deployed)

- Feed Post entry now opens the actual editor directly; the optional Create Hub remains reachable for explicit Photo, Flex, Run, and Schedule choices.
- Android comment input now relies on one keyboard-resize mechanism and supports one-tap Comment focus.
- Compose and audited secondary screens use history-safe exits instead of blind Back calls.
- Post drafts preserve Buddy Card feature intent and standard post retries reuse a stable operation ID.
- Feed rows settle before optional Cheer previews; same-account refreshes preserve content and true cold loads reserve the layout with fixed skeleton cards.
- Text and event post details use a compact readable surface; photo, video, and run posts retain immersive media treatment.
- “My Day” is reserved for 24-hour stories; reminder/task creation is now labelled “Schedule.”
- Preview deep links, cold launch intents, visible Back, and Android Back now share safe one-shot/history-aware routing.
- Post, Event, and Flex publishing are owner-bound and retry-safe; media keys are immutable and post-success side effects cannot duplicate after restore.
- Manual Light/Dark appearance now covers the app shell, Feed, composer, post detail, Journey, Messages, Notifications, Profile, Buddy Chat, planner, challenges, Trophy Case, Discover, Buddy connections, Body/workouts, and Groups/Pages.
- Planner, challenge, Discover, workout, and community theme slices preserve their approved Light appearance and add only Dark equivalents.
- Live Android acceptance, backend migration execution, remote push, and Expo preview upload remain intentionally pending.
