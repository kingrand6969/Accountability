# Journey Progress and Share Studio

## Purpose

Journey should help a member answer two simple questions: “Am I improving?” and “Am I staying consistent?” It should combine straightforward training progress, private appearance tracking, and a consistent way to share any post or Flex without exposing private data accidentally.

## Journey Progress

The Progress view is one smooth vertical scroll with three sections:

1. Training consistency: workouts this week, training time, completed sets, and weekly/monthly trends.
2. Basic body progress: current weight, BMI, latest check-in, and a weekly/monthly weight trend.
3. Appearance progress: private dated progress photos and a Before/After comparison.

Body tracking remains deliberately simple. A check-in stores weight, height when needed for BMI, and the date. BMI is calculated rather than stored and is presented as a neutral reference without category labels or medical claims.

## Private Progress Photos

Progress photos are private by default and stored separately from Feed media. A member can:

- Take a new selfie with the front camera.
- Take a regular photo with the rear camera.
- Choose an existing photo from the gallery.
- Assign a photo as Before or Latest.
- Use the original photo date when available, fall back to today, and correct the date.
- Optionally associate the weight recorded on that date.

Original private photos never become public objects. Sharing creates a separate rendered copy containing only the details visible in the final preview.

## Universal Share Studio

Every post-producing flow finishes in one reusable Share Studio. This includes regular text and photo posts, Run, Journey progress, Flex, milestones, workouts, and events.

The studio provides:

- A final visual preview.
- Take Selfie and Choose Photos where the post type supports imagery.
- An optional caption.
- Explicit per-detail controls for sensitive information such as weight.
- One universal visibility switch.
- A final Post action whose wording matches the selected audience.

Run and Journey use the same camera, gallery, preview, and publishing behavior. Post-specific content changes, but privacy and audience behavior do not.

## Visibility Switch

The switch is present every time a member posts or shares a Flex:

- Off — **Buddies only**: visible only to accepted buddies and never shown on the Buddy Card.
- On — **Public + Buddy Card**: visible to everyone and automatically shown on the member’s Buddy Card.

The switch defaults to Off for each new post. There is no separate audience picker and no separate “Feature on Buddy Card” control. The label and helper text update immediately, and the final preview clearly states who will see the post.

## Data and Privacy Boundaries

Use a dedicated owner-only body-measurement history and owner-only progress-photo records protected by row-level security. The current measurement is the newest record. BMI is derived from weight and height.

Feed posts continue through the existing idempotent publishing pipeline. Private values are not placed in share metadata when excluded. A public or buddies-only post contains only the rendered share copy and explicitly selected fields. Account changes, cancellation, upload failure, and retry must not publish another member’s data or duplicate a post.

## Image Selection

Workout category imagery follows the separately approved 64-image rotation specification in `2026-08-21-journey-workout-photo-rotation-design.md`. Exercise-specific views prefer the existing exercise-library imagery.

## Failure Handling

- Denied camera or gallery permission shows a clear explanation and leaves the draft intact.
- Cancelling camera/gallery returns to the unchanged preview.
- Missing photo metadata falls back to today without blocking progress.
- Failed private-photo storage does not create a database record.
- Failed share rendering or upload does not alter the private originals.
- A failed post remains retryable with the same operation identity.
- Visibility changes after rendering require a fresh final preview before posting.

## Accessibility and UX

All direct controls have at least a 48-point effective target. The visibility control is a native-style switch usable by tap or swipe, exposes its checked state to assistive technology, and is paired with text rather than color alone. Photos include meaningful labels, dates remain readable, and text overlays maintain accessible contrast.

## Acceptance Criteria

- Journey Progress shows consistency, current weight, calculated BMI, latest check-in, and weekly/monthly weight trends without becoming a full body-measurement dashboard.
- A member can create a private dated Before/After comparison using camera, selfie, or gallery photos.
- Private originals remain private after sharing.
- Weight appears in a shared card only when explicitly enabled for that post.
- Run and Journey both support selfie and gallery imagery before sharing.
- Every post and Flex shows the same visibility switch.
- Off always publishes Buddies only and excludes the Buddy Card.
- On always publishes Public and includes the Buddy Card.
- No separate audience or Buddy Card feature controls remain in posting flows.
- The final preview truthfully reflects the selected imagery, fields, caption, and audience.
