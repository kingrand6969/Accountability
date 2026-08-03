# AccountAbility Locked Reference Contract

Date: 2026-07-29  
Status: Approved by the product owner on 2026-07-29  
Source: Eight reference-image groups supplied in the Codex task and
`docs/superpowers/specs/2026-07-27-accountability-final-experience-design.md`

## Pass rule

A screen passes only when:

- all defining visual anchors from its approved reference are present;
- every visible control works or is intentionally disabled with an explanation;
- the per-reference state-applicability matrix is covered;
- staging data, privacy, RLS, idempotency, and navigation checks pass;
- installed-device evidence includes the reference, actual screenshot, side-by-side
  comparison, 50% overlay, and difference image;
- an auditor who did not implement the screen returns `PASS`; and
- the product owner approves the installed staging evidence.

Functional but visually different fails. Visually accurate but non-functional also fails.

## Global visual contract

- Use the approved two-person ribbon “A” and `AccountAbility` wordmark.
- Core colors are cobalt `#155EEF`, deep navy `#081A3A`, warm cream
  `#F7F4EC`, white, and restrained semantic colors.
- Emotional and journey headings use an editorial serif role.
- Controls and body copy use a clean sans-serif role.
- Handwritten blue text is reserved for motivational or verified annotations.
- Timers, performance metrics, and money use tabular figures.
- Preserve the reference hierarchy, image treatment, proportions, spacing, and
  navigation model.
- Touch targets are at least 44×44 logical points.
- Safe areas, Android system bars, dynamic text, reduced motion, and accessible
  contrast are mandatory.
- Pixel comparison follows the reproducible procedure below.

## Reference inventory

| ID | Approved screen | Primary visual anchors |
|---|---|---|
| SOC-FEED-01 | Buddies Feed | Compact brand header; Buddies/Discover control; compact composer and My Day; immersive photo-led proof cards; serif overlay; route, metrics, verification, encouragement |
| SOC-DISC-01 | Discover | Shared header; search/filter; For You/Nearby/Challenges/Groups; image-led person card; group and challenge modules |
| SOC-POST-01 | Immersive Run/Post Detail | Full-bleed dark photo; serif headline; handwritten Verified; route and metrics; floating encouragement card; dark action bar |
| SOC-ENCOURAGE-01 | Encouragement Sheet | Dimmed post; rounded cream sheet; serif title; supporter avatars; text and voice rows; Reply and primary action |
| ENTRY-WELCOME-01 | Welcome / Sign In | Mountain background; large approved mark; white/cream login sheet; cobalt login; outlined create-account; privacy reassurance |
| PROMISE-START-01 | Start Your Day | Serif question; up-to-three guidance; Body/Money/Focus/People; selected promise rows; clear Start and Skip |
| CREATE-HUB-01 | Unified Create | Post, Photo/video, Flex, Share a run, Add to My Day; preview; audience; one Continue action |
| SHARE-PROOF-01 | Share Proof | Polished image-led card; metrics and branding; Portrait/Square/Landscape; privacy toggles; four destinations |
| JOURNEY-OVERVIEW-01 | Journey Daily Overview | Cream editorial page; date; serif message; handwritten accent; sunrise image; Promise/Proof split; encouragement |
| JOURNEY-MOMENTUM-01 | Momentum | Deep navy; orbital score; four pillar scores; next action; promise sequence; encouragement |
| JOURNEY-PATH-01 | Path | Cream topographic background; winding path; Day/100 Days/1 Year/500 Days/Legacy markers; category filters |
| JOURNEY-PATH-02 | Path Tab Framing | Same Path with approved Journey tabs and persistent bottom navigation |
| JOURNEY-JOURNAL-01 | Journal | Cream editorial layout; date; serif headline; handwritten accent; hero image; promise/proof card; encouragement |
| JOURNEY-BODY-01 | Body + Exercise | Journey breadcrumb; Body score; workout hero; plan/library/progress; recent activity; share proof |
| PROFILE-MAIN-01 | Profile | Mountain cover; overlapping portrait; serif identity; three stats; Edit Profile; four tiles; protected settings |
| FIN-FRIENDLY-TODAY-01 | Finance Today | Today/Goals/More; supportive greeting; illustrated left-this-month card; Add activity; compact attention cards |
| FIN-FRIENDLY-ADD-01 | Add Money Activity | Rounded sheet; four illustrated primary choices; expandable receipt/card/debt/business options |
| FIN-FRIENDLY-GOALS-01 | Friendly Goals | Illustrated path; personal and shared goal cards; contributions; Start a goal |
| FIN-FRIENDLY-MORE-01 | Finance More | Two-column Activity/Accounts/Bills/Debts/Insights/Business grid; privacy reassurance |
| FIN-ACCOUNTING-ACTIVITY-01 | Transaction Activity | Search/filter; income/expense tabs; month navigation; grouped rows; swipe actions |
| FIN-ACCOUNTING-ACCOUNTS-01 | Accounts, Cards, Debts | Total; account rows; card utilisation/payment; I owe/Owed to me; atomic settlement |
| FIN-ACCOUNTING-PLAN-01 | Bills and Goals | Paid/upcoming/overdue; card minimum; savings; shared goal |
| FIN-BUSINESS-FOOD-01 | Product Business | Business selector; break-even; product sales; money out/bills; sales/costs/kept |
| FIN-BUSINESS-ITEM-01 | Recipe and Costing | Price/cost/portions; ingredients; supplies; recalculation; archive |
| FIN-BUSINESS-PROPERTY-01 | Property Business | Received/due; renter states; business bills; fixed costs |
| FIN-BUSINESS-PORTFOLIO-01 | Business Portfolio | Selectable businesses; kept totals; setup form; type/currency/days; safe archive |

## Required approval journeys

1. Welcome → Promise or Skip → Feed.
2. Feed ↔ Discover.
3. Feed → Post Detail → Encouragement → Post Detail.
4. Feed → Create → Share Proof → Feed.
5. Momentum ↔ Path ↔ Journal.
6. Momentum → Body → Workout → Share Proof.
7. Profile → Journey.
8. Finance Today → Add Activity → Finance Today.
9. Finance Today ↔ Goals ↔ More.
10. More → Activity, Accounts, Bills, Debts, Insights, and Business.
11. Business Portfolio → Product Business → Recipe/Costing.
12. Business Portfolio → Property Business.

## State-applicability matrix

`R` means required. `N/A` means the state has no meaningful interaction on that
screen and must not be invented solely for the audit.

| Reference family | Empty | Loading/error/retry | Offline | Permission denial | Privacy/redaction | Own/other user |
|---|---:|---:|---:|---:|---:|---:|
| ENTRY-WELCOME-01 | R | R | R | N/A | N/A | N/A |
| PROMISE-START-01 | R | R | R | N/A | N/A | N/A |
| CREATE-HUB-01 | R | R | R | R for camera/photos | R for audience | N/A |
| SHARE-PROOF-01 | R | R | R | R for gallery/share | R | N/A |
| SOC-FEED-01 / SOC-DISC-01 | R | R | R | R for Nearby only | R | R |
| SOC-POST-01 / SOC-ENCOURAGE-01 | R | R | R | R for microphone only | R | R |
| Journey family | R | R | R | R only where workout/location/media requires it | R for proof fields | N/A |
| PROFILE-MAIN-01 | R for fallback identity | R | R | R for photo library/camera | R | R |
| Finance family | R | R | R | R for receipt camera only | R for sensitive amounts | N/A |
| Business family | R | R | R | N/A | R | N/A |

## Reproducible visual-comparison procedure

1. Android group-review profile: use one agreed physical-device model and record
   model, Android version, logical viewport, physical pixel size, density, font
   scale, display scale, navigation mode, and app build ID.
2. Secondary profiles: one small phone and one large phone. The primary overlay
   threshold applies only to the agreed reference profile; secondary profiles
   validate responsiveness, clipping, and touch usability.
3. Capture the approved panel without its decorative outer phone frame. Crop
   only to the app viewport. Record the crop rectangle.
4. Capture the installed candidate at the same logical viewport. Normalise only
   status-bar clock/icons and explicitly documented dynamic content. Do not
   stretch one axis independently.
5. Scale both images to the recorded logical viewport using the same resampling
   method. Produce side-by-side, 50% overlay, and absolute-difference images.
6. Name anchors for each screen before implementation. At minimum measure:
   header bottom, primary title baseline, primary content/card top and bottom,
   primary CTA bounds, and bottom-navigation top. Image-led screens also measure
   hero-image bounds; sheets measure sheet top; segmented screens measure
   selector bounds.
7. Each named anchor must be within 4 logical pixels. Each named major width or
   height must be within 5% of the reference. Font baselines may use 6 logical
   pixels when the exact approved font renders differently across Android
   versions, but font family role, weight, wrapping, and hierarchy must still
   match.
8. A single failed mandatory anchor or dimension makes the automated geometry
   result `FAIL`. The independent human auditor additionally checks typography,
   imagery, color, hierarchy, and interaction. Human review cannot silently
   waive a geometry failure; any exception requires product-owner approval.

## Evidence states

Every applicable screen must demonstrate:

- small and large Android phone;
- normal, 130%, and 200% font scale;
- populated and empty;
- loading, offline, retryable error, and permission denial;
- own content and other-user content where relevant;
- private/redacted and shareable variants;
- state preservation after back, background, process restart, and reconnection.

Android is the required installed-device platform for each staging group.
Separate iOS validation remains mandatory before production and cannot be waived
by Android approval.
