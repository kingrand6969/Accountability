# AccountAbility Route and Compatibility Contract

Date: 2026-07-29  
Status: Group 0 implementation constraint

## Approved destination mapping

| Approved destination | Public/internal path | Current owner file | Compatibility requirement |
|---|---|---|---|
| Feed / Discover | `/` | `src/app/(app)/index.tsx` | Discover may remain screen state initially; preserve Feed scroll, pagination, composer, stories, post actions, and public-only discovery |
| Sign in | `/sign-in` | `src/app/sign-in.tsx` | Preserve verification and onboarding transitions |
| Sign up | `/sign-up` | `src/app/sign-up.tsx` | Preserve age, consent, birthday, and verification |
| Verify | `/verify-email` | `src/app/verify-email.tsx` | Preserve email/birthday query parameters |
| Recovery | `/forgot-password` | `src/app/forgot-password.tsx` | Preserve reset sequencing |
| Promise onboarding | `/onboarding` | `src/app/onboarding.tsx` | Optional and per-user; no duplicate promise writes |
| Post detail | `/post/[id]` | `src/app/post/[id].tsx` | `?encouragement=1` remains canonical encouragement handoff |
| Create | `/compose` | `src/app/compose.tsx` | Preserve photo/edit query variants, audience, uploads, drafts, and editing |
| Add to My Day | `/add` | `src/app/add.tsx` | Preserve timeline/reminders and Pro behavior |
| Share Proof | `/win-card` | `src/app/win-card.tsx` | Preserve capture, privacy, post, share, phone, and Memories |
| Public share handoff | `/share/[id]` | `src/app/share/[id].tsx` | HTTPS canonical link remains `https://joinaccountability.app/s/[id]`; never expose private media |
| Journey / Momentum | `/activity` | `src/app/(app)/activity.tsx` | User-facing name is Journey; legacy path stays valid |
| Journey / Path | `/journey-path` | `src/app/journey-path.tsx` | Preserve achievements, filters, and replace-style section switching |
| Journey / Journal | `/today` | `src/app/(app)/today.tsx` | Hidden tab remains routable; preserve date and `filter=body` |
| Body | `/body` | `src/app/body.tsx` | Body Progress resolves to `/today?filter=body` |
| Exercise compatibility | `/gym`, `/exercise/[id]`, `/gym-plan` | corresponding route files | Existing links, plans, favourites, records, and back behavior remain valid beneath Body |
| Profile | `/profile` | `src/app/(app)/profile.tsx` | Hidden tab remains routable; editing/private fields stay separate |
| Finance | `/finance` | `src/app/(app)/finance.tsx` | Friendly, Accounting, Accounts, Savings, and Business use the same private data |
| Business legacy entry | `/business` | `src/app/business.tsx` | Must not fork business state from Finance |
| Finance forms | `/money-add`, `/bill-new`, `/account-new`, `/saving-new`, `/debt-new`, `/shared-goal-new`, `/shared-goal/[id]` | corresponding route files | Preserve create/edit identities, tenant ownership, confirmation, and atomic operations |
| Run | `/run` | `src/app/(app)/run.tsx` | Preserve background GPS, recovery, offline queue, idempotency, Saved-on-phone, privacy, and sharing |
| Messages | `/messages` | `src/app/(app)/messages.tsx` | Preserve realtime unread state, conversations, retention, and return path |
| Conversation | `/buddy-chat/[id]` | `src/app/buddy-chat/[id].tsx` | Preserve ordering, unread clearing, and privacy |
| Notifications | `/notifications` | `src/app/(app)/notifications.tsx` | Hidden tab remains routable; preserve post/buddy targets and missing-target fallback |

## Mandatory pre-implementation route tests

- Required session behavior:
  - `/body`, `/journey-path`, and `/business`: signed-out cold links must enter
    authentication and resume or safely return to the requested signed-in
    destination; signed-in links must open the requested route.
  - `/share/[id]`: signed-out and signed-in cold links must resolve only the
    explicitly public opaque share. Restricted, revoked, missing, or private
    content must remain blocked. Opening the private in-app post may require
    authentication.
- Add executable cold-deep-link tests for those four routes rather than relying
  on implicit Stack registration by inspection.
- Preserve `/activity`, `/today`, and all Exercise paths even if canonical
  Journey aliases are added.
- Define route/query contracts before making Discover, Finance panes, or the
  Messages Encouragement filter deep-linkable.
- Test cold deep links, expired sessions, onboarding-required accounts,
  authenticated accounts, back fallback, and state restoration.
- Do not replace service/API calls while extracting or restyling screens.

## Preserved legacy and supporting routes

The redesign inventory above covers approved primary destinations. The
following current routes remain in compatibility scope and must not be removed
or broken. Each source-changing group plan must include the relevant entries in
its route regression tests.

| Product area | Preserved routes | Owner group | Independent gate |
|---|---|---:|---|
| Achievements and competition | `/achievements`, `/compete`, `/challenge/[id]` | 4 | Journey/Profile route regression |
| Groups and discovery | `/groups`, `/group/[id]`, `/page/[id]`, `/story/[userId]` | 3 | Social route/privacy regression |
| Profile and buddies | `/edit-profile`, `/buddy`, `/buddy-card/[id]`, `/buddy-card-edit` | 4 | Journey/Profile route/privacy regression |
| Journey history | `/item/[id]`, `/memories`, `/insights`, `/today`, `/activity` | 4 | Journey/Profile route/data regression |
| Exercise and wellness | `/gym`, `/gym-plan`, `/exercise/[id]`, `/diet`, `/body` | 4 | Journey/Profile legacy-data regression |
| Finance friendly entry | `/money-add`, `/saving-new`, `/shared-goal-new`, `/shared-goal/[id]` | 5 | Friendly Finance route/reconciliation regression |
| Finance accounting/business | `/business`, `/bill-new`, `/account-new`, `/debt-new` | 6 | Accounting Finance route/atomicity regression |
| Social content | `/post/[id]`, `/compose`, `/win-card`, `/share/[id]` | 3 | Social route/privacy regression |
| Messaging | `/buddy-chat/[id]` | 7 | Cross-app realtime/return-path regression |
| Account | `/menu`, `/paywall`, `/help` | 7 | Cross-app account/support regression |
| Notifications | `/notifications` | 3 | Social notification-target regression |
| Search | `/search` | 3 | Social search/discovery route regression |
| Buddy location and medals | `/buddy-map`, `/buddy-medals/[id]` | 4 | Journey/Profile buddy privacy regression |
| Invitations | `/invite-card` | 4 | Journey/Profile invitation route regression |
| Group/page creation | `/group-new`, `/page-new` | 3 | Social ownership/privacy regression |
| Challenge creation | `/challenge-new` | 4 | Journey/Profile challenge route regression |
| Food search | `/food-search` | 4 | Journey/Body wellness route regression |
| Books | `/books` | 4 | Journey/Focus route regression |
| Public/legal | all legal routes currently declared outside signed-in protection | 7 | Signed-out legal-route regression |

This is a preserved-route contract, not permission to redesign every supporting
screen in its parent group. The full executable route manifest must be generated
from `src/app` during baseline capture and attached to the evidence record.
