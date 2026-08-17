# Approved Buddy Card Layout Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore every required Buddy Card section inside the exact approved clean-card design without exposing private values or introducing another visual redesign.

**Architecture:** Keep `PublicBuddyCardFace` as the sole compositor for the owner/non-buddy collectible card. Stabilize its required section shells, resolve owner-versus-public display policy once at the component boundary, and keep private public values represented by truthful placeholders rather than removing layout. Continue using the existing RPC/RLS authorization and real medal catalog; no schema expansion is needed.

**Tech Stack:** React Native, Expo Router, TypeScript, React Test Renderer, Jest, existing Buddy Card RPC/RLS boundaries.

---

## File structure

- `src/buddy/PublicBuddyCardFace.tsx` — exact approved clean-card composition, required identity/ranking/challenge/social/fitness presentation.
- `src/buddy/BuddyCardAchievements.tsx` — stable Medals and Challenges section with earned-only artwork and a truthful empty/private state.
- `src/buddy/card.ts` — pure display-text resolution without weakening public privacy.
- `src/app/buddy-card/[id].tsx` — owner/buddy/public runtime wiring and About/profile-text placement.
- `src/app/buddy-card-edit.tsx` — live public preview; continues to show the actual public consent configuration.
- `src/buddy/BuddyCardPresentationContract.test.ts` — component-level visual/content regression tests.
- `src/buddy/BuddyCardScreenContract.test.ts` — owner/public/buddy wiring regression tests.

### Task 1: Lock the exact approved visual and mandatory section behavior

**Files:**
- Modify: `src/buddy/BuddyCardPresentationContract.test.ts`
- Modify: `src/buddy/BuddyCardScreenContract.test.ts`

- [ ] **Step 1: Replace the obsolete “omit optional sections” expectation with the required stable-layout contract**

Add component tests that render the minimal public card and assert that the exact approved section skeleton remains present:

```ts
it('keeps required Buddy Card sections when public values are unavailable', () => {
  const renderer = publicCard({
    card: { palette_key: 'polar_blue' },
    area: 'Perth, Australia',
    headline: null,
    metrics: null,
    stats: null,
    boardRank: null,
    mutualBuddiesCount: null,
    groupsCount: null,
  });
  const copy = renderedText(renderer);

  expect(renderer.root.findByProps({ testID: 'public-buddy-card' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'buddy-card-rankings' })).toBeDefined();
  expect(renderer.root.findByProps({ testID: 'buddy-card-achievements' })).toBeDefined();
  expect(copy).toEqual(expect.arrayContaining([
    'Rankings',
    'Country',
    'City',
    'Buddies',
    'Points',
    'Medals and Challenges',
    'Challenges won · —',
  ]));
});
```

- [ ] **Step 2: Add owner-safe full-core display tests**

Add a test proving that the owner sees their actual authorized core values even when public consent flags are off, while a non-buddy does not receive those values:

```ts
it('shows authorized core values to the owner without broadening the public card', () => {
  const hiddenCard: BuddyCard = {
    ...completeCard,
    show_area: false,
    show_rank: false,
    show_medals: false,
    show_challenge_wins: false,
    show_country_rank: false,
    show_city_rank: false,
    show_consistency: false,
    show_points: false,
  };

  const ownerCopy = renderedText(publicCard({ ownerView: true, card: hiddenCard }));
  const visitorCopy = renderedText(publicCard({ ownerView: false, card: hiddenCard }));

  expect(ownerCopy).toEqual(expect.arrayContaining([
    expect.stringContaining('Perth, Australia'),
    'Mythical',
    'Challenges won · 7',
    '#4',
    '#3',
    '1,234',
  ]));
  expect(visitorCopy).not.toContain('Mythical');
  expect(visitorCopy).not.toContain('Challenges won · 7');
  expect(visitorCopy).toContain('Challenges won · —');
});
```

- [ ] **Step 3: Add earned-medal and truthful-empty tests**

Add assertions that owner/consented renderings use real `Medal` components, unshared/empty cards still show the section and gallery action, and no invented medal appears:

```ts
expect(renderer.root.findAllByProps({ testID: /^featured-medal-/ })).toHaveLength(0);
expect(renderedText(renderer)).toContain('No earned medals shared yet');
expect(renderer.root.findByProps({ accessibilityLabel: 'View all medals and completed challenges' })).toBeDefined();
```

- [ ] **Step 4: Add screen wiring tests for About/profile text and owner card display**

In `BuddyCardScreenContract.test.ts`, assert:

```ts
expect(screenSource).toContain('ownerView={ownerView}');
expect(screenSource).toContain('visibleAbout');
expect(screenSource).toContain("accessMode === 'self'");
expect(screenSource).not.toContain('connectToSelf');
```

Also add a runtime test proving owner-visible bio comes from authorized `view.bio`, while the public path still uses `cardText(view).about`.

- [ ] **Step 5: Run the focused tests and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyCardPresentationContract.test.ts src/buddy/BuddyCardScreenContract.test.ts
```

Expected: FAIL because required Rankings, Challenges won, and Medals and Challenges currently collapse when display flags/data are absent, and the owner still uses the same public flag filtering.

- [ ] **Step 6: Commit the failing contracts**

```powershell
git add src/buddy/BuddyCardPresentationContract.test.ts src/buddy/BuddyCardScreenContract.test.ts
git commit -m "test: lock approved Buddy Card structure"
```

### Task 2: Stabilize the approved clean-card sections

**Files:**
- Modify: `src/buddy/PublicBuddyCardFace.tsx`
- Modify: `src/buddy/BuddyCardAchievements.tsx`
- Test: `src/buddy/BuddyCardPresentationContract.test.ts`

- [ ] **Step 1: Resolve owner-authorized display flags without mutating saved settings**

Inside `PublicBuddyCardFace`, derive a render-only card for the owner:

```ts
const presentedCard: BuddyCard = ownerView
  ? {
      ...card,
      show_area: true,
      show_rank: true,
      show_medals: true,
      show_challenge_wins: true,
      show_country_rank: true,
      show_city_rank: true,
      show_consistency: true,
      show_points: true,
      show_distance: true,
    }
  : card;
```

Pass `presentedCard` to Identity, Rankings, Achievements, and Fitness. Do not persist it and do not use it in the editor’s public preview.

- [ ] **Step 2: Keep Challenges won in its approved identity position**

Replace conditional removal with a stable line whose value remains privacy-safe:

```ts
const sharedChallengeWins = card.show_challenge_wins;
const challengeWins = sharedChallengeWins && metrics?.chwin != null
  ? String(Math.round(metrics.chwin))
  : EMPTY_VALUE;

<Text style={[styles.challengeWins, !showRank && styles.challengeWinsWithoutRank, { color: palette.textMuted }]}> 
  Challenges won · {challengeWins}
</Text>
```

The owner’s `presentedCard` makes their authorized count visible; a public card with consent off keeps the location but renders an em dash.

- [ ] **Step 3: Keep all four approved Rankings columns stable**

Build the four fixed items without filtering columns:

```ts
const items = [
  { label: 'Country', value: card.show_country_rank ? formatRank(boardRank?.countryRank) : EMPTY_VALUE },
  { label: 'City', value: card.show_city_rank ? formatRank(boardRank?.cityRank) : EMPTY_VALUE },
  { label: 'Buddies', value: card.show_consistency ? formatRank(metrics?.buddiesRank) : EMPTY_VALUE },
  { label: 'Points', value: card.show_points ? formatWholeNumber(metrics?.points) : EMPTY_VALUE },
];
```

Always render `buddy-card-rankings`. Do not infer or fabricate a rank.

- [ ] **Step 4: Keep Medals and Challenges visible without inventing medals**

In `BuddyCardAchievements`, remove early returns based on `show_medals` or zero earned medals. Resolve medal artwork only when the value is shared, then render the approved header and truthful empty copy:

```tsx
const all = card.show_medals ? allMedalsFromCard(card) : [];

<View testID="buddy-card-achievements" style={[styles.root, { borderBottomColor: palette.border }]}> 
  <Pressable accessibilityLabel="View all medals and completed challenges" ...>
    <Text style={[styles.title, { color: palette.text }]}>Medals and Challenges</Text>
    <Ionicons name="chevron-forward" size={18} color={palette.accent} />
  </Pressable>
  {featured.length > 0 ? <View style={styles.row}>{/* existing real Medal render */}</View> : (
    <Text style={[styles.empty, { color: palette.textMuted }]}>No earned medals shared yet</Text>
  )}
</View>
```

Add an `empty` style with readable compact copy and no fake medal placeholders.

- [ ] **Step 5: Preserve the exact approved visual treatment**

Keep the current clean palette surface, subtle top atmosphere, 4-pixel accent, rounded frame, dividers, metric grid, compact crest, and existing spacing. Do not add gradients, dark section cards, flames, aura, or new decoration. Add source-contract guards if needed:

```ts
expect(publicFaceSource).not.toContain('LinearGradient');
expect(publicFaceSource).not.toContain('rankAura');
expect(publicFaceSource).not.toContain('backgroundColor: \'#0');
```

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyCardPresentationContract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the stable compositor**

```powershell
git add src/buddy/PublicBuddyCardFace.tsx src/buddy/BuddyCardAchievements.tsx src/buddy/BuddyCardPresentationContract.test.ts
git commit -m "fix: restore approved Buddy Card sections"
```

### Task 3: Preserve profile text, area, and privacy semantics at runtime

**Files:**
- Modify: `src/buddy/card.ts`
- Modify: `src/app/buddy-card/[id].tsx`
- Modify: `src/app/buddy-card-edit.tsx` only if preview wiring needs an explicit `ownerView={false}`
- Test: `src/buddy/BuddyCardScreenContract.test.ts`
- Test: `src/buddy/BuddyCardEditorContract.test.ts`

- [ ] **Step 1: Make text selection explicit for full-access versus public viewers**

Change `cardText` to accept an authorization mode without changing stored card JSON:

```ts
export function cardText(
  view: BuddyCardView,
  fullAccess = false,
): { headline: string | null; about: string | null } {
  return {
    headline: fullAccess
      ? view.card.headline?.trim() || null
      : view.card.show_headline
        ? view.card.headline?.trim() || null
        : null,
    about: fullAccess
      ? view.bio?.trim() || view.card.about?.trim() || null
      : view.card.show_bio
        ? view.card.about?.trim() || null
        : null,
  };
}
```

This gives self/buddy viewers authorized profile text while preserving public consent.

- [ ] **Step 2: Bind screen text and area presentation to the access mode**

In `src/app/buddy-card/[id].tsx`:

```ts
const fullTextAccess = ownerView || isBuddy;
const { headline, about } = cardText(view, fullTextAccess);
const visibleAbout = fullTextAccess ? view.bio?.trim() || about : about;
```

Continue passing the real `area`; `PublicBuddyCardFace` decides whether it is shown using `ownerView` plus consent. Keep About in its existing readable card below the collectible card so the approved inner-card hierarchy is unchanged.

- [ ] **Step 3: Keep the editor preview truthful**

Ensure the editor’s `PublicBuddyCardFace` invocation does not pass `ownerView`, so it remains a preview of what a non-buddy sees. The four palette radios and selected-medal ordering remain unchanged.

- [ ] **Step 4: Add and run focused text/privacy tests**

Add cases for:

```ts
expect(cardText(view, true)).toEqual({ headline: 'Morning 10K', about: 'Runner and lifter' });
expect(cardText(view, false)).toEqual({ headline: null, about: null });
```

Run:

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyCardScreenContract.test.ts src/buddy/BuddyCardEditorContract.test.ts src/buddy/BuddyCardPresentationContract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit runtime wiring**

```powershell
git add src/buddy/card.ts src/app/buddy-card/[id].tsx src/app/buddy-card-edit.tsx src/buddy/BuddyCardScreenContract.test.ts src/buddy/BuddyCardEditorContract.test.ts
git commit -m "fix: keep Buddy Card profile content visible"
```

### Task 4: Verify no redesign, privacy regression, or device breakage

**Files:**
- Verify only; modify tests only when a genuine missing regression is found.

- [ ] **Step 1: Run all Buddy Card tests**

```powershell
npm.cmd test -- --runInBand src/buddy
```

Expected: all Buddy Card suites pass.

- [ ] **Step 2: Run full static verification**

```powershell
npm.cmd test -- --runInBand --silent
npx.cmd tsc --noEmit
npm.cmd run lint -- --quiet
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Verify the exact approved design on Android**

On the connected phone, verify:

1. Owner card uses the clean light/palette design shown in `buddy-card-customization-example.html`.
2. Profile text and area appear when authorized.
3. Challenges won remains below the rank/member identity and shows `0` truthfully.
4. Rankings keeps Country, City, Buddies, and Points in one stable row; unavailable values are em dashes.
5. Medals and Challenges stays visible, shows at most four real earned medals, and opens the full gallery.
6. A non-buddy does not see values whose consent is disabled.
7. Back returns once to the previous screen without a black frame.

- [ ] **Step 4: Commit any final test-only correction**

```powershell
git add src/buddy
git commit -m "test: verify approved Buddy Card restoration"
```

Skip this commit if verification required no file changes.

## Self-review

- Spec coverage: exact approved design, profile text, area, earned medals, challenge wins, Rankings, owner/public distinction, truthful empty states, and privacy are each mapped to a task.
- Placeholder scan: no TBD/TODO/deferred implementation remains.
- Type consistency: `cardText(view, fullAccess)`, `ownerView`, `BuddyCard`, `BoardRank`, `CardMetrics`, and existing component props match current source types.
- Scope: no new database columns, RPCs, dependencies, or unrelated UI redesign.
