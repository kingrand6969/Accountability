# Journey Workout Photo Rotation

## Goal

Make Journey feel visually fresh on every opening while ensuring every photograph matches the workout or context it represents.

## Image library

Use 64 curated fitness photographs split into four explicit pools:

- 16 Push: bench press, chest press, shoulder press, dips, and triceps work.
- 16 Pull: pull-ups, rows, deadlifts, pulldowns, back work, and curls.
- 16 Legs: squats, lunges, leg press, hamstring work, calves, and lower-body training.
- 16 General: training atmosphere, progress, consistency, recovery, and workout-history imagery.

Images must be licensed stock photography. A photo must never appear outside its assigned pool.

## Selection behavior

On each full page opening, select matching images from the four pools. Save a short local history and exclude the four most recently displayed images in each pool whenever alternatives exist. Do not show the same image twice on the same page. Once selected, images remain stable until the next page opening; they do not rotate while the user is reading or logging a workout.

If local history is unavailable or malformed, safely start with a fresh shuffled selection. If an image fails to load, replace it with another image from the same category only.

## Exercise imagery

Specific exercise rows continue to prefer the existing exercise-library images from the repository. Curated stock photography is the fallback for workout categories and editorial surfaces, not a replacement for exercise-specific database imagery.

## UX and accessibility

Dark overlays must preserve readable text contrast. Photography must not alter touch targets, navigation, workout logging, or page layout. Motion is limited to the existing page transition; images never auto-cycle.

## Acceptance criteria

- Exactly 64 curated images are available across the four 16-image pools.
- Push, Pull, and Legs always show semantically correct imagery.
- Reloading changes the selections and avoids the four most recent images per pool when possible.
- No duplicate image appears on one page opening.
- A failed image is replaced only by another image from the same pool.
- Existing exercise database imagery remains the first choice for specific exercises.
