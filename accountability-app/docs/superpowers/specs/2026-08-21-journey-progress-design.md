# Journey Progress Design

**Date:** 2026-08-21  
**Status:** Approved direction; detailed design pending user review  
**Surface:** Journey default route (`/activity`)

## Purpose

Journey should help a member answer two questions without interpretation or
guesswork:

1. Am I improving?
2. Am I staying consistent?

The page uses one calm vertical scroll. It borrows the useful interaction
principles of Hevy and Strong—an immediate overview followed by optional detail—
without copying their branding or turning AccountAbility into a workout logger.

## Design principles

- Show concrete activity before interpretation.
- Use progressive disclosure: overview first, details on tap.
- Keep every metric tied to persisted completion evidence.
- Never fabricate improvement, consistency, or a score when data is missing.
- Keep the page visually quiet: one primary chart, one consistency block, and
  three compact progress rows.
- Preserve access to planning, milestones, history, notifications, Body, Focus,
  and People without placing all of them at equal visual priority.
- Preserve existing Light and Dark appearance behavior, large-text reflow,
  account isolation, and history-safe navigation.

## Information architecture

### 1. Header

- Title: `Journey`
- Supporting line: `Your progress, clearly.`
- Notification action remains in the top-right.
- Remove the editorial `Build momentum.` headline.
- Replace the current Momentum / Path / Journal tab row with the period control
  on the default page. Milestones and History remain reachable near the bottom
  of the scroll with plain-language labels.

### 2. Period control

A compact segmented control offers exactly:

- `Week` — the last 7 complete/local calendar days including today.
- `Month` — the last 30 complete/local calendar days including today.

The comparison period is the immediately preceding period of equal length.
Changing the period updates the whole page without navigating, resetting the
scroll position, or showing a full-page loader.

The selected period is local UI state. It does not need persistence between app
launches; Journey opens to Week because it is the easiest view to understand.

### 3. Improvement

The first card answers `Am I improving?`.

It shows:

- Large primary value: number of completed promises/actions in the selected
  period.
- Plain comparison: for example, `3 more than the previous 7 days`, `2 fewer`,
  or `Same as the previous 30 days`.
- Completion rate as a secondary metric when at least one scheduled/completable
  item exists in both the current data model and selected period.
- A restrained bar trend:
  - Week: one bar per day.
  - Month: one bar per week-sized bucket, with the final partial bucket shown
    honestly.

The chart represents completed items only. It does not imply intensity, quality,
or health improvement.

If there is current-period activity but no prior-period activity, copy states
`Your first comparison starts next period.` It must not claim an increase from
zero as proof of improvement.

### 4. Consistency

The second card answers `Am I staying consistent?`.

It shows:

- `Active days`: days containing at least one item with completion proof.
- `Current streak`: consecutive local calendar days ending today, or ending
  yesterday when today is still open and has no completion yet.
- A compact day strip:
  - Week: seven labeled day markers.
  - Month: a compact calendar-style grid or grouped weekly rows.

Completed days, open days, and days with no planned activity must be visually
distinct. A day with no planned activity is neutral, not a failure.

Consistency must never be represented by a synthetic 0–100 score.

### 5. Where progress came from

The third section answers which area contributed to the recorded progress.
It contains three rows:

- `Body` → `/body`
- `Focus` → `/today`
- `People` → `/messages`

Each row contains:

- Domain icon and plain label.
- Completed item count for the selected period.
- Active-day count.
- A short equal-period comparison when prior data exists.
- Chevron indicating drill-down.

Rows do not use vague status words such as `Strong`, `Build`, or `Connect`.
When a domain has no data, it says `No activity recorded` and remains tappable.

### 6. Next useful action

Below progress, show one compact action based on the existing timeline:

- If an upcoming item exists: `Next up` with its title and `Open`.
- Otherwise: `Plan your next promise` with `Plan`.

This action remains secondary to progress. It must not resemble a hero card.

### 7. Milestones and history

The bottom of the scroll contains two quiet navigation rows:

- `Milestones` → existing Journey Path route (`/journey-path`)
- `History` → existing Journal route (`/today`)

These labels replace ambiguous top-level `Path` and `Journal` terminology on
the overview while preserving the routes, data, and back behavior.

Recent encouragement may remain below these rows only when real encouragement
exists. It must not occupy empty vertical space or interrupt the progress story.

## Data definitions

All calculations use `TimelineItem` records and existing completion-proof rules.

- A completed item is one for which `hasCompletionProof(item)` returns true.
- An active day is a local date containing at least one completed item.
- Current-period count is the number of completed items in the selected rolling
  period.
- Prior-period count uses the equal-length range immediately before it.
- Domain assignment continues to use `timelinePillar`:
  - Body: workout, activity, meal, grocery.
  - Focus: event, task.
  - People: remaining supported social/promise types.
- Completion rate is `completed / relevant scheduled items`, only when the
  denominator is meaningful and non-zero.

The screen should request enough history for both periods in one owner-bound
load:

- Week view requires 14 days.
- Month view requires 60 days.

Loading both ranges together allows Week/Month switching without another
network wait.

## States

### Loading

- Keep the page shell, title, period control, and static card silhouettes
  visible.
- Do not replace the route with a centered spinner.
- Expose loading status to assistive technology.

### Empty

When no completion evidence exists in the current or prior period:

- Improvement: `Complete your first promise to start a progress trend.`
- Consistency: show neutral day markers and `No active days yet.`
- Domain rows: `No activity recorded.`
- Keep `Plan your next promise` available.

### Refresh failure with cached data

- Preserve the last same-owner metrics.
- Show a compact, accessible notice and Retry action.

### Initial failure

- Do not render zeroes as if they were real data.
- Show an accessible error state with `Try again`.

### Account change

- Clear all prior-owner metrics, comparisons, error state, and pending work
  before showing the next account.
- Ignore late results from the previous owner.

## Motion and feel

- Period changes use a short opacity/position transition within charts, not a
  page transition.
- Press feedback is subtle and immediate.
- No scroll-jacking, horizontal carousels, parallax, or animated score counting.
- Respect reduced-motion settings.
- The entire page remains one native vertical scroll.

## Accessibility

- All interactive targets are at least 48 by 48 effective points.
- Week/Month announces selected state.
- Charts have concise text alternatives containing period, completed count, and
  comparison.
- Color is never the only signal for completed/open/neutral days.
- Text can wrap at large font sizes without clipping metrics or controls.
- Light and Dark text, chart, divider, and state colors meet WCAG contrast
  requirements appropriate to text size.

## Explicit non-goals

- No giant Momentum score.
- No body heat map.
- No social leaderboard on the Journey overview.
- No motivational quote or decorative hero artwork.
- No new database schema or generated health claim.
- No removal of Journey Path, Journal, Body, Focus, or People routes.
- No Feed or bottom-navigation redesign in this slice.

## Acceptance criteria

1. Journey reads as one calm vertical flow with no nested content tabs.
2. Week and Month update every progress section from one loaded data set.
3. The first viewport clearly answers improvement and begins the consistency
   story.
4. Improvement comparisons use equal-length periods and honest neutral copy.
5. Consistency distinguishes completed, open, and unplanned days.
6. Body, Focus, and People display concrete counts and open their existing
   destinations.
7. Milestones and History remain directly reachable.
8. Empty and failure states never present fabricated zero metrics as success.
9. Cached same-owner data survives a failed refresh; account changes never reuse
   another member's data.
10. Light/Dark, large text, reduced motion, safe areas, and 48-point controls are
    verified with focused tests and a physical Android canary before release.

