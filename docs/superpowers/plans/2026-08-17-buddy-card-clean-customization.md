# Buddy Card Clean Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the public Buddy Card with the approved clean information hierarchy and add safe preset palette plus four-medal customization without weakening privacy or account ownership.

**Architecture:** Keep authorization and data loading in the screen/API layer, normalize all owner-supplied presentation values through pure helpers, and render the approved design through small focused components composed by `PublicBuddyCardFace`. Persist only a palette key and ordered featured-medal IDs in the existing `profiles.buddy_card` JSON, validate their shape in PostgreSQL, and expose them through the existing public-profile allowlist.

**Tech Stack:** Expo SDK 56, React Native 0.85, Expo Router, TypeScript 6, Supabase/PostgreSQL, Jest 29, existing RankBadge/Medal/CachedImage/theme primitives.

---

## File Map

- Create `accountability-app/src/buddy/palette.ts`: typed palette registry and safe fallback resolution.
- Create `accountability-app/src/buddy/palette.test.ts`: palette-key, theme, and fallback tests.
- Create `accountability-app/src/buddy/featuredMedals.ts`: deterministic selection and ordering of up to four earned medals.
- Create `accountability-app/src/buddy/featuredMedals.test.ts`: selection, order, eligibility, duplicate, and legacy fallback tests.
- Create `accountability-app/src/buddy/BuddyCardFocus.tsx`: clean expandable Current Focus section.
- Create `accountability-app/src/buddy/BuddyCardAchievements.tsx`: four-medal row and full-gallery action.
- Create `accountability-app/src/buddy/BuddyCardPresentationContract.test.ts`: focused JSX/accessibility/layout contract.
- Modify `accountability-app/src/buddy/card.ts`: add presentation fields, safe normalization, and expected-owner save binding.
- Modify `accountability-app/src/buddy/PublicBuddyCardFace.tsx`: compose the approved clean card.
- Modify `accountability-app/src/app/buddy-card-edit.tsx`: palette picker, featured-medal picker, live preview, dirty-state guard, and owner-bound save.
- Modify `accountability-app/src/app/buddy-card/[id].tsx`: owner detection, safe async generation, public/full-view branching, and clean-card data.
- Modify `accountability-app/src/app/buddy-medals/[id].tsx`: keep the complete gallery independent of featured selection.
- Modify `accountability-app/src/compete/api.ts`: load a member's completed joined challenges in one query.
- Create `accountability-app/supabase/migrations/0097_buddy_card_presentation.sql`: validate and expose palette/featured-medal presentation fields.
- Modify `accountability-app/src/buddy/publicProfilePrivacyMigration.test.ts`: enforce the new migration's allowlist, validation, and grants.

## Task 1: Add Safe Palette and Featured-Medal Domain Helpers

**Files:**
- Create: `accountability-app/src/buddy/palette.test.ts`
- Create: `accountability-app/src/buddy/featuredMedals.test.ts`
- Create: `accountability-app/src/buddy/palette.ts`
- Create: `accountability-app/src/buddy/featuredMedals.ts`
- Modify: `accountability-app/src/buddy/card.ts`

- [ ] **Step 1: Write failing palette tests**

```ts
import { BUDDY_CARD_PALETTE_KEYS, resolveBuddyCardPalette } from './palette';

describe('Buddy Card palettes', () => {
  test('ships only the four approved preset keys', () => {
    expect(BUDDY_CARD_PALETTE_KEYS).toEqual([
      'polar_blue',
      'victory_ember',
      'momentum_teal',
      'power_violet',
    ]);
  });

  test.each(BUDDY_CARD_PALETTE_KEYS)('%s has reviewed light and dark tokens', (key) => {
    expect(resolveBuddyCardPalette(key, 'light')).toMatchObject({ key, scheme: 'light' });
    expect(resolveBuddyCardPalette(key, 'dark')).toMatchObject({ key, scheme: 'dark' });
  });

  test('unknown and missing values fall back to Polar Blue', () => {
    expect(resolveBuddyCardPalette('neon-broken', 'light').key).toBe('polar_blue');
    expect(resolveBuddyCardPalette(undefined, 'dark').key).toBe('polar_blue');
  });
});
```

- [ ] **Step 2: Write failing featured-medal tests**

```ts
import { normalizeFeaturedMedalIds } from './featuredMedals';

describe('normalizeFeaturedMedalIds', () => {
  const earned = ['streak', 'distance', 'iron', 'champion', 'explorer'];

  test('keeps owner order, removes duplicates and caps at four', () => {
    expect(normalizeFeaturedMedalIds(
      ['champion', 'streak', 'champion', 'distance', 'iron', 'explorer'],
      earned,
    )).toEqual(['champion', 'streak', 'distance', 'iron']);
  });

  test('rejects unearned and unknown medal IDs', () => {
    expect(normalizeFeaturedMedalIds(['myth', 'champion'], earned)).toEqual(['champion']);
  });

  test('uses the first four earned medals for legacy cards with no selection', () => {
    expect(normalizeFeaturedMedalIds(undefined, earned)).toEqual(earned.slice(0, 4));
  });
});
```

- [ ] **Step 3: Run the tests and verify RED**

Run from `accountability-app`:

```powershell
npm.cmd test -- --runInBand src/buddy/palette.test.ts src/buddy/featuredMedals.test.ts
```

Expected: FAIL because `palette.ts` and `featuredMedals.ts` do not exist.

- [ ] **Step 4: Implement the palette registry**

```ts
export const BUDDY_CARD_PALETTE_KEYS = [
  'polar_blue',
  'victory_ember',
  'momentum_teal',
  'power_violet',
] as const;

export type BuddyCardPaletteKey = typeof BUDDY_CARD_PALETTE_KEYS[number];
export type BuddyCardScheme = 'light' | 'dark';
export type BuddyCardPalette = {
  key: BuddyCardPaletteKey;
  scheme: BuddyCardScheme;
  accent: string;
  accentSecondary: string;
  surface: string;
  surfaceTint: string;
  canvas: string;
  text: string;
  textMuted: string;
  border: string;
};

const PALETTES: Record<BuddyCardPaletteKey, Record<BuddyCardScheme, Omit<BuddyCardPalette, 'key' | 'scheme'>>> = {
  polar_blue: {
    light: { accent: '#1768EF', accentSecondary: '#45C9ED', surface: '#FFFFFF', surfaceTint: '#EDF5FF', canvas: '#EDF2F7', text: '#13253E', textMuted: '#6B7B91', border: '#DCE6F0' },
    dark: { accent: '#6EA8FF', accentSecondary: '#63D7EE', surface: '#101B2B', surfaceTint: '#142946', canvas: '#09111D', text: '#F4F8FF', textMuted: '#A8B8CC', border: '#2B3B50' },
  },
  victory_ember: {
    light: { accent: '#E14D36', accentSecondary: '#FF9D4D', surface: '#FFFFFF', surfaceTint: '#FFF1EC', canvas: '#F4EFEC', text: '#2E1A18', textMuted: '#806761', border: '#EADDD8' },
    dark: { accent: '#FF826C', accentSecondary: '#FFB368', surface: '#241714', surfaceTint: '#38201B', canvas: '#160E0C', text: '#FFF6F2', textMuted: '#D0AFA7', border: '#55332C' },
  },
  momentum_teal: {
    light: { accent: '#0D9276', accentSecondary: '#55D6B3', surface: '#FFFFFF', surfaceTint: '#EAFAF5', canvas: '#EDF5F2', text: '#12352E', textMuted: '#607C75', border: '#D5E8E2' },
    dark: { accent: '#4DD6B4', accentSecondary: '#78E5C9', surface: '#10211D', surfaceTint: '#15352D', canvas: '#091511', text: '#F1FFF9', textMuted: '#A3C5BB', border: '#285046' },
  },
  power_violet: {
    light: { accent: '#7357D8', accentSecondary: '#B78CFF', surface: '#FFFFFF', surfaceTint: '#F2EFFF', canvas: '#F0EEF5', text: '#241D3B', textMuted: '#756D8B', border: '#E1DDEC' },
    dark: { accent: '#A993FF', accentSecondary: '#C8AAFF', surface: '#1C172B', surfaceTint: '#2C2345', canvas: '#100D19', text: '#FAF7FF', textMuted: '#BEB3D5', border: '#44385E' },
  },
};

export function resolveBuddyCardPalette(value: unknown, scheme: BuddyCardScheme): BuddyCardPalette {
  const key = BUDDY_CARD_PALETTE_KEYS.includes(value as BuddyCardPaletteKey)
    ? value as BuddyCardPaletteKey
    : 'polar_blue';
  return { key, scheme, ...PALETTES[key][scheme] };
}
```

- [ ] **Step 5: Implement featured-medal normalization and types**

```ts
export const MAX_FEATURED_MEDALS = 4;

export function normalizeFeaturedMedalIds(
  requested: readonly string[] | null | undefined,
  earnedIds: readonly string[],
): string[] {
  const earned = new Set(earnedIds);
  const source = requested == null ? earnedIds : requested;
  const seen = new Set<string>();
  return source.filter((id) => {
    if (!earned.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, MAX_FEATURED_MEDALS);
}
```

Add to `BuddyCard` in `card.ts`:

```ts
import type { BuddyCardPaletteKey } from './palette';

export type BuddyCard = {
  // existing fields remain unchanged
  palette_key?: BuddyCardPaletteKey;
  featured_medal_ids?: string[];
};
```

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd test -- --runInBand src/buddy/palette.test.ts src/buddy/featuredMedals.test.ts
npx.cmd tsc --noEmit
git add src/buddy/palette.ts src/buddy/palette.test.ts src/buddy/featuredMedals.ts src/buddy/featuredMedals.test.ts src/buddy/card.ts
git commit -m "feat: define safe Buddy Card customization"
```

Expected: both suites PASS and TypeScript exits 0.

## Task 2: Enforce the Presentation Boundary in PostgreSQL

**Files:**
- Create: `accountability-app/supabase/migrations/0097_buddy_card_presentation.sql`
- Modify: `accountability-app/src/buddy/publicProfilePrivacyMigration.test.ts`

- [ ] **Step 1: Add failing migration-contract tests**

```ts
const presentationSql = fs.readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/0097_buddy_card_presentation.sql'),
  'utf8',
);

test('validates palette and featured medal JSON at the database boundary', () => {
  expect(presentationSql).toContain("buddy_card ->> 'palette_key' in");
  expect(presentationSql).toContain("jsonb_typeof(buddy_card -> 'featured_medal_ids') = 'array'");
  expect(presentationSql).toContain("jsonb_array_length(buddy_card -> 'featured_medal_ids') <= 4");
  expect(presentationSql).toContain('jsonb_path_exists');
});

test('exposes only the two new presentation values through the strict allowlist', () => {
  expect(presentationSql).toContain("'palette_key'");
  expect(presentationSql).toContain("'featured_medal_ids'");
  expect(presentationSql).toContain('jsonb_build_object(');
  expect(presentationSql).toContain('security_barrier = true');
  expect(presentationSql).toContain('revoke all on public.public_profiles from public, anon');
});
```

- [ ] **Step 2: Run the migration test and verify RED**

```powershell
npm.cmd test -- --runInBand src/buddy/publicProfilePrivacyMigration.test.ts
```

Expected: FAIL with ENOENT for migration 0097.

- [ ] **Step 3: Add the replay-safe migration**

Create migration 0097 by recreating the current `public_profiles` view from migration 0088 and adding these exact operations before the view definition:

```sql
alter table public.profiles
  drop constraint if exists profiles_buddy_card_presentation_check;

alter table public.profiles
  add constraint profiles_buddy_card_presentation_check
  check (
    buddy_card is null
    or (
      (
        not (buddy_card ? 'palette_key')
        or buddy_card ->> 'palette_key' in (
          'polar_blue', 'victory_ember', 'momentum_teal', 'power_violet'
        )
      )
      and case
        when not (buddy_card ? 'featured_medal_ids') then true
        when jsonb_typeof(buddy_card -> 'featured_medal_ids') <> 'array' then false
        else
          jsonb_array_length(buddy_card -> 'featured_medal_ids') <= 4
          and not jsonb_path_exists(
            buddy_card -> 'featured_medal_ids',
            '$[*] ? (@.type() != "string")'
          )
      end
    )
  ) not valid;

alter table public.profiles
  validate constraint profiles_buddy_card_presentation_check;
```

Inside the non-owner `jsonb_build_object`, append:

```sql
'palette_key',
  case
    when p.buddy_card ->> 'palette_key' in (
      'polar_blue', 'victory_ember', 'momentum_teal', 'power_violet'
    ) then p.buddy_card -> 'palette_key'
    else '"polar_blue"'::jsonb
  end,
'featured_medal_ids',
  case
    when coalesce(p.buddy_card -> 'show_medals' = 'true'::jsonb, false)
    then p.buddy_card -> 'featured_medal_ids'
    else null
  end
```

Retain the exact 0088 security-barrier view, all existing consent gates, and these grants:

```sql
revoke all on public.public_profiles from public, anon;
grant select on public.public_profiles to authenticated;
```

- [ ] **Step 4: Verify and commit**

```powershell
npm.cmd test -- --runInBand src/buddy/publicProfilePrivacyMigration.test.ts
git diff --check
git add supabase/migrations/0097_buddy_card_presentation.sql src/buddy/publicProfilePrivacyMigration.test.ts
git commit -m "feat: secure Buddy Card presentation settings"
```

Expected: migration contract PASS and no diff-check output.

## Task 3: Build the Clean Focus and Achievement Components

**Files:**
- Create: `accountability-app/src/buddy/BuddyCardFocus.tsx`
- Create: `accountability-app/src/buddy/BuddyCardAchievements.tsx`
- Create: `accountability-app/src/buddy/BuddyCardPresentationContract.test.ts`
- Modify: `accountability-app/src/buddy/BuddyCardFace.tsx`

- [ ] **Step 1: Write failing presentation contracts**

```ts
import fs from 'node:fs';
import path from 'node:path';

const focus = fs.readFileSync(path.resolve(process.cwd(), 'src/buddy/BuddyCardFocus.tsx'), 'utf8');
const achievements = fs.readFileSync(path.resolve(process.cwd(), 'src/buddy/BuddyCardAchievements.tsx'), 'utf8');

test('Focus is plain text, capped at three lines and expandable', () => {
  expect(focus).toContain('CURRENT FOCUS');
  expect(focus).toContain('numberOfLines={expanded ? undefined : 3}');
  expect(focus).toContain('accessibilityState={{ expanded }}');
  expect(focus).not.toContain('LinearGradient');
  expect(focus).not.toContain('backgroundColor: palette.accent');
});

test('achievements show at most four and open the complete gallery', () => {
  expect(achievements).toContain('featured.slice(0, MAX_FEATURED_MEDALS)');
  expect(achievements).toContain('Medals and Challenges');
  expect(achievements).toContain('accessibilityLabel="View all medals and completed challenges"');
});
```

- [ ] **Step 2: Run the contract and verify RED**

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyCardPresentationContract.test.ts
```

Expected: FAIL because both components are missing.

- [ ] **Step 3: Implement clean Focus**

```tsx
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BuddyCardPalette } from './palette';
import { font, spacing } from '../ui/theme';

export function BuddyCardFocus({ text, palette }: { text: string | null; palette: BuddyCardPalette }) {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  if (!text?.trim()) return null;
  return (
    <View style={[styles.root, { borderBottomColor: palette.border }]}>
      <Text style={[styles.label, { color: palette.textMuted }]}>CURRENT FOCUS</Text>
      <Text
        accessible={false}
        pointerEvents="none"
        style={[styles.copy, styles.measurer, { color: palette.text }]}
        onTextLayout={(event) => setTruncated(event.nativeEvent.lines.length > 3)}
      >
        {text.trim()}
      </Text>
      <Text
        style={[styles.copy, { color: palette.text }]}
        numberOfLines={expanded ? undefined : 3}
      >
        {text.trim()}
      </Text>
      {truncated || expanded ? (
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Collapse current focus' : 'View full current focus'}
          accessibilityState={{ expanded }}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color: palette.accent }]}>
            {expanded ? 'Show less' : 'View full focus'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingBottom: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { fontFamily: font.extrabold, fontSize: 10, letterSpacing: 1.3, marginBottom: 6 },
  copy: { fontFamily: font.medium, fontSize: 14, lineHeight: 21 },
  measurer: { position: 'absolute', left: 0, right: 0, opacity: 0 },
  action: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center' },
  actionText: { fontFamily: font.bold, fontSize: 12.5 },
});
```

- [ ] **Step 4: Implement featured achievements**

Use `normalizeFeaturedMedalIds`, `allMedalsFromCard`, `Medal`, and `MAX_FEATURED_MEDALS`. The component must return `null` when medal visibility is off or no earned medal exists, render the exact ordered selection, and make the whole header a 48-point gallery action.

```tsx
const featuredIds = normalizeFeaturedMedalIds(card.featured_medal_ids, all.map((state) => state.def.id));
const byId = new Map(all.map((state) => [state.def.id, state]));
const featured = featuredIds.map((id) => byId.get(id)).filter(isMedalState);

return (
  <View style={styles.root}>
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="View all medals and completed challenges"
      style={styles.header}
    >
      <Text style={styles.title}>Medals and Challenges</Text>
      <Ionicons name="chevron-forward" size={18} color={palette.accent} />
    </Pressable>
    <View style={styles.row}>
      {featured.slice(0, MAX_FEATURED_MEDALS).map((state) => (
        <View key={state.def.id} style={styles.medal} accessible accessibilityLabel={`${state.def.title}, ${state.tierName}`}>
          <Medal state={state} size={52} animate={false} />
        </View>
      ))}
    </View>
  </View>
);
```

Rename the current `medalsFromCard` implementation to `allMedalsFromCard` and retain a deprecated alias until all current call sites are migrated:

```ts
export const medalsFromCard = allMedalsFromCard;
```

- [ ] **Step 5: Verify and commit**

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyCardPresentationContract.test.ts src/buddy/featuredMedals.test.ts
npx.cmd tsc --noEmit
git add src/buddy/BuddyCardFocus.tsx src/buddy/BuddyCardAchievements.tsx src/buddy/BuddyCardPresentationContract.test.ts src/buddy/BuddyCardFace.tsx
git commit -m "feat: add clean Buddy Card sections"
```

Expected: focused tests and TypeScript PASS.

## Task 4: Compose the Approved Public Buddy Card

**Files:**
- Modify: `accountability-app/src/buddy/PublicBuddyCardFace.tsx`
- Modify: `accountability-app/src/buddy/BuddyCardPresentationContract.test.ts`

- [ ] **Step 1: Extend the contract for the approved hierarchy**

```ts
const publicFace = fs.readFileSync(path.resolve(process.cwd(), 'src/buddy/PublicBuddyCardFace.tsx'), 'utf8');

test('public card follows the approved clean information order', () => {
  const order = [
    'BuddyCardIdentity',
    'BuddyCardFocus',
    'BuddyCardRankings',
    'BuddyCardAchievements',
    'BuddyCardSocialProof',
    'BuddyCardFitnessMetrics',
  ].map((name) => publicFace.indexOf(`<${name}`));
  expect(order.every((index) => index >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(publicFace).not.toContain("colors={['#155EEF', '#0B3DAE', '#081A3A']}");
  expect(publicFace).not.toContain('Top achievements');
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyCardPresentationContract.test.ts
```

Expected: FAIL because the current card is a dark photo-led hero and lacks the approved section composition.

- [ ] **Step 3: Refactor `PublicBuddyCardFace` into a clean compositor**

Add explicit props for already-authorized `memberSince`, `stats`, and `boardRank`. Resolve the palette using the application color scheme, render a palette-tinted light/dark surface, keep the profile image prominent, put the compact `RankBadge` immediately before rank text, put Challenges won below it, and pass official medal/rank components without color overrides.

The top-level composition must be:

```tsx
const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
const palette = resolveBuddyCardPalette(card.palette_key, scheme);

return (
  <View style={[styles.frame, { backgroundColor: palette.surface, borderColor: palette.border }]}>
    <BuddyCardIdentity {...identityProps} palette={palette} />
    <BuddyCardFocus text={headline} palette={palette} />
    <BuddyCardRankings card={card} boardRank={boardRank} metrics={metrics} palette={palette} />
    <BuddyCardAchievements card={card} palette={palette} onPress={onPressMedals} />
    <BuddyCardSocialProof stats={stats} ownerView={ownerView} palette={palette} />
    <BuddyCardFitnessMetrics card={card} metrics={metrics} palette={palette} />
  </View>
);
```

Define `BuddyCardIdentity`, `BuddyCardRankings`, `BuddyCardSocialProof`, and `BuddyCardFitnessMetrics` as private functions in `PublicBuddyCardFace.tsx` with these exact boundaries:

```ts
type IdentityProps = {
  name: string | null; area: string | null; avatar: string | null;
  memberSince: string; lastActive: string | null; card: BuddyCard;
  metrics: CardMetrics | null; palette: BuddyCardPalette;
};
function BuddyCardIdentity(props: IdentityProps): React.JSX.Element;

function BuddyCardRankings(props: {
  card: BuddyCard; boardRank: BoardRank | null;
  metrics: CardMetrics | null; palette: BuddyCardPalette;
}): React.JSX.Element | null;

function BuddyCardSocialProof(props: {
  stats: BuddyStats | null; ownerView: boolean; groupsCount: number | null;
  palette: BuddyCardPalette;
}): React.JSX.Element | null;

function BuddyCardFitnessMetrics(props: {
  card: BuddyCard; metrics: CardMetrics | null; palette: BuddyCardPalette;
}): React.JSX.Element | null;
```

`BuddyCardIdentity` renders `RankBadge` immediately before the rank name and `Challenges won · N` directly below it. `BuddyCardRankings` renders only enabled Country, City, Buddies, and Points values and uses an em dash for missing data. `BuddyCardSocialProof` renders Cheers/Buddies/Mutual for visitors and Cheers/Buddies/Groups for `ownerView`. `BuddyCardFitnessMetrics` renders only enabled Consistency, Points, Avg km/day, and Distance values.

Every optional component returns `null` when it has no authorized content. Use existing `font`, `spacing`, `radius`, `shadow`, `CachedImage`, `useResolvedMediaUrl`, `RankBadge`, and `Medal` primitives. Do not add a second design-token system outside `palette.ts`.

- [ ] **Step 4: Verify and commit**

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyCardPresentationContract.test.ts
npx.cmd tsc --noEmit
npm.cmd run lint -- --quiet
git add src/buddy/PublicBuddyCardFace.tsx src/buddy/BuddyCardPresentationContract.test.ts
git commit -m "feat: redesign the public Buddy Card"
```

Expected: contract, typecheck, and lint PASS.

## Task 5: Add Palette and Featured-Medal Editing

**Files:**
- Modify: `accountability-app/src/buddy/card.ts`
- Modify: `accountability-app/src/app/buddy-card-edit.tsx`
- Create: `accountability-app/src/buddy/BuddyCardEditorContract.test.ts`

- [ ] **Step 1: Write failing editor and owner-binding tests**

```ts
test('editor uses radio palettes and a four-item ordered medal selection', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/app/buddy-card-edit.tsx'), 'utf8');
  expect(source).toContain('accessibilityRole="radio"');
  expect(source).toContain('accessibilityState={{ selected }}');
  expect(source).toContain('MAX_FEATURED_MEDALS');
  expect(source).toContain('normalizeFeaturedMedalIds');
  expect(source).toContain('You can feature up to four medals');
  expect(source).toContain('usePreventRemove');
});
```

Add a mocked Supabase test proving `saveMyBuddyCard(card, expectedOwnerId)` rejects when the current UID differs and never calls `profiles.update`.

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyCardEditorContract.test.ts
```

Expected: FAIL because the editor has no palette, medal selection, unsaved guard, or expected-owner save.

- [ ] **Step 3: Bind save to the initiating account**

Change the API signature and reject before mutation:

```ts
export async function saveMyBuddyCard(card: BuddyCard, expectedOwnerId: string): Promise<void> {
  const uid = await me();
  if (!uid || uid !== expectedOwnerId) throw new Error('Account changed. Review your Buddy Card and try again.');
  const { error } = await supabase
    .from('profiles')
    .update({ buddy_card: card })
    .eq('id', expectedOwnerId);
  if (error) throw error;
}
```

Capture `expectedOwnerId` during editor load, generation-guard all profile/card/rank results, and pass it to save. A stale account completion must not update preview state or show a success toast.

- [ ] **Step 4: Add palette and medal controls**

Render four 48-point radio rows from `BUDDY_CARD_PALETTE_KEYS`; each row shows its name plus two color swatches and updates only draft state. Render earned medals from `medals_list` as selectable 48-point controls. Selecting appends to order, deselecting removes, and a fifth selection is disabled with the visible hint `You can feature up to four medals`.

Remove the photo-led hero toggle from the active editor UI because the approved clean card no longer renders a cover-photo hero. Retain legacy `show_hero` and `hero_url` parsing for backward compatibility, but do not include a hero image in the new card or write a newly enabled hero value.

Before save:

```ts
const earnedIds = (card.medals_list ?? []).map((medal) => medal.id);
const toSave: BuddyCard = {
  ...card,
  palette_key: resolveBuddyCardPalette(card.palette_key, 'light').key,
  featured_medal_ids: normalizeFeaturedMedalIds(card.featured_medal_ids, earnedIds),
  mode: 'custom',
  // retain existing snapshots and visibility flags
};
await saveMyBuddyCard(toSave, expectedOwnerId);
```

Use `usePreventRemove(dirty && !saving, ...)` to show `Discard unsaved Buddy Card changes?` with `Keep editing` and `Discard` actions. Reset dirty state only after a successful owner-bound save.

- [ ] **Step 5: Verify and commit**

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyCardEditorContract.test.ts src/buddy/palette.test.ts src/buddy/featuredMedals.test.ts
npx.cmd tsc --noEmit
git add src/buddy/card.ts src/app/buddy-card-edit.tsx src/buddy/BuddyCardEditorContract.test.ts
git commit -m "feat: customize Buddy Card appearance"
```

Expected: focused tests and TypeScript PASS.

## Task 6: Fix Owner Self-View and Lifecycle-Safe Profile Loading

**Files:**
- Modify: `accountability-app/src/app/buddy-card/[id].tsx`
- Create: `accountability-app/src/buddy/BuddyCardScreenContract.test.ts`

- [ ] **Step 1: Write failing owner/lifecycle contracts**

```ts
test('owner sees their own public-card preview and never a connect-to-self action', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/app/buddy-card/[id].tsx'), 'utf8');
  expect(source).toContain('const ownerView = currentUserId === id');
  expect(source).toContain('ownerView ?');
  expect(source).toContain("router.push('/buddy-card-edit'");
  expect(source).toContain('!ownerView && !isBuddy');
});

test('focus cleanup invalidates stale profile work', () => {
  expect(source).toContain('generationRef.current += 1');
  expect(source).toContain('if (generation !== generationRef.current) return');
  expect(source).toContain('return () =>');
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyCardScreenContract.test.ts
```

Expected: FAIL because the current screen treats the owner as a non-buddy and has no generation invalidation.

- [ ] **Step 3: Implement owner detection and safe loads**

At focus setup, capture the authenticated user ID and a generation. Clear prior viewer-specific data before loading. Load public card plus relationships, then load only data authorized for `ownerView`, `isBuddy`, or enabled public flags. Every completion checks both generation and current identity before calling state setters.

Render rules:

```tsx
const ownerView = currentUserId === id;
const fullBuddyView = isBuddy && !ownerView;

{fullBuddyView ? <BuddyCardFace {...fullProps} /> : <PublicBuddyCardFace ownerView={ownerView} {...publicProps} />}

{ownerView ? (
  <Button title="Edit Buddy Card" onPress={() => router.push('/buddy-card-edit' as never)} />
) : isBuddy ? (
  <Button title="Message" onPress={openChat} />
) : (
  <Button title={sent ? 'Request sent' : `Connect with ${displayName}`} onPress={onConnect} />
)}
```

The cleanup increments the generation and prevents late load, alert, navigation, or toast effects.

- [ ] **Step 4: Verify and commit**

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyCardScreenContract.test.ts src/buddy/BuddyCardPresentationContract.test.ts
npx.cmd tsc --noEmit
git add src/app/buddy-card/[id].tsx src/buddy/BuddyCardScreenContract.test.ts
git commit -m "fix: make Buddy Card owner-safe"
```

Expected: focused tests and TypeScript PASS.

## Task 7: Preserve the Complete Medals and Challenges Gallery

**Files:**
- Modify: `accountability-app/src/compete/api.ts`
- Modify: `accountability-app/src/app/buddy-medals/[id].tsx`
- Create: `accountability-app/src/buddy/BuddyMedalsGalleryContract.test.ts`

- [ ] **Step 1: Write failing gallery contract**

```ts
test('gallery is complete and independent of the featured four', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/app/buddy-medals/[id].tsx'), 'utf8');
  expect(source).toContain('Medals and Challenges');
  expect(source).toContain('MEDALS.map');
  expect(source).not.toContain('featured_medal_ids');
  expect(source).toContain('Completed challenges');
  expect(source).toContain('listCompletedChallengesForMember(id)');
});
```

- [ ] **Step 2: Run and verify RED**

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyMedalsGalleryContract.test.ts
```

Expected: FAIL because the current title is only `Medals` and the screen has no completed-challenges section.

- [ ] **Step 3: Add the completed-challenge query**

Add to `src/compete/api.ts`:

```ts
export type CompletedChallenge = {
  id: string;
  title: string;
  metric: string;
  endsAt: string;
};

export async function listCompletedChallengesForMember(userId: string): Promise<CompletedChallenge[]> {
  const { data, error } = await supabase
    .from('challenge_participants')
    .select('challenge_id, challenges!inner(id,title,metric,ends_at)')
    .eq('user_id', userId)
    .lte('challenges.ends_at', new Date().toISOString())
    .order('ends_at', { referencedTable: 'challenges', ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.challenges.id,
    title: row.challenges.title,
    metric: row.challenges.metric,
    endsAt: row.challenges.ends_at,
  }));
}
```

The query returns only challenges the member joined and that have ended. It does not claim the member won; wins remain the separately calculated `Challenges won` metric.

- [ ] **Step 4: Update the gallery without changing achievement calculations**

Rename the page title to `{displayName}'s Medals and Challenges`, retain the complete `MEDALS.map` catalog, and append an authorized `Completed challenges` section loaded through `listCompletedChallengesForMember(id)`. The section renders a loading indicator, `No completed challenges yet.`, or challenge rows containing title, metric, and completion date. It must not infer challenge completion or a win from medal IDs.

- [ ] **Step 5: Verify and commit**

```powershell
npm.cmd test -- --runInBand src/buddy/BuddyMedalsGalleryContract.test.ts
npx.cmd tsc --noEmit
git add src/compete/api.ts src/app/buddy-medals/[id].tsx src/buddy/BuddyMedalsGalleryContract.test.ts
git commit -m "feat: complete Buddy Card achievement gallery"
```

Expected: focused test and TypeScript PASS.

## Task 8: Full Verification and Device Acceptance

**Files:**
- Modify only files required by failures found in this task.

- [ ] **Step 1: Run the full automated suite**

```powershell
npm.cmd test -- --runInBand
npx.cmd tsc --noEmit
npm.cmd run lint -- --quiet
git diff --check
```

Expected: all Jest suites PASS; TypeScript, lint, and diff check exit 0.

- [ ] **Step 2: Apply the migration to a disposable/local Supabase instance**

Run the project migration workflow against a disposable database, then verify:

```sql
select convalidated
from pg_constraint
where conname = 'profiles_buddy_card_presentation_check';

select has_table_privilege('anon', 'public.public_profiles', 'select');
select has_table_privilege('authenticated', 'public.public_profiles', 'select');
```

Expected: constraint is validated; anon is false; authenticated is true. Attempt invalid palette, five featured IDs, and a non-string featured ID; all must fail the constraint. Existing cards without the new keys must remain readable.

- [ ] **Step 3: Verify on a small Android device and an iPhone-sized viewport**

Check:

- Owner opens their own avatar → Buddy Card without a self-connect button.
- Non-buddy sees only enabled public information and selected public posts.
- Buddy reaches the existing fuller profile view.
- Current Focus shows zero dead space when empty, three lines when long, and expands/collapses visibly above the keyboard and navigation areas.
- All four palettes remain readable in app Light and Dark modes.
- Exactly four selected medals appear in owner order; the gallery still shows all medals and completed challenges.
- Enlarged text does not overlap profile identity, rank, Focus, rankings, or editor controls.
- Account switching during load/save produces no stale card, mutation, navigation, or success toast.

- [ ] **Step 4: Commit any verification-only fixes**

```powershell
git add accountability-app
git commit -m "test: verify clean Buddy Card customization"
```

Skip this commit if Step 1–3 require no code or test changes.
