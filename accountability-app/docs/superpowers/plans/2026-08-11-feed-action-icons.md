# Feed Action Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Feed card’s text-heavy Cheer, Comment, Share, and Save actions with an evenly spaced, accessible icon-only row that retains meaningful counts and states.

**Architecture:** Keep action behavior inside the existing `FeedProofCard` and `SaveToMemories` components. Add one small layered `CheerIcon` presentation component for the clap glyph, extend the existing action renderer with optional counts, and add an explicit `iconOnly` boundary to Save so post-detail presentation does not change accidentally.

**Tech Stack:** React Native, TypeScript, Expo Vector Icons/Ionicons, Jest source-contract tests, Expo lint.

---

## File structure

- Modify `src/feed/FeedProofCard.tsx`: define the clap presentation, switch Feed actions to icons and optional counts, and enforce equal 48-point slots.
- Modify `src/memories/SaveToMemories.tsx`: support an explicit icon-only inline mode with the album icon while preserving save/busy/accessibility behavior.
- Modify `src/feed/socialScreenContract.test.ts`: lock the Feed icon set, conditional counts, absence of visible labels, spacing, and Save integration.
- Modify `src/feed/immersivePostContract.test.ts`: prove post detail does not opt into Feed-only icon presentation.

### Task 1: Lock the icon-only Feed contract

**Files:**
- Modify: `src/feed/socialScreenContract.test.ts`
- Modify: `src/feed/immersivePostContract.test.ts`

- [ ] **Step 1: Write the failing Feed presentation tests**

Add a source-contract test that requires the approved icon set and layout:

```ts
test('uses the approved balanced icon-only Feed actions', () => {
  expect(proofCardSource).toContain("icon=\"clap\"");
  expect(proofCardSource).toContain("icon=\"chatbubble-outline\"");
  expect(proofCardSource).toContain("icon=\"paper-plane-outline\"");
  expect(proofCardSource).toContain('count={post.like_count}');
  expect(proofCardSource).toContain('count={post.comment_count}');
  expect(proofCardSource).toContain('<SaveToMemories url={post.image_url} inline iconOnly />');
  expect(proofCardSource).toContain('minHeight: 48');
  expect(proofCardSource).not.toContain('label={`Cheer');
  expect(proofCardSource).not.toContain('label={`Comment');
});
```

Extend the immersive-post contract so only Feed opts into the new Save presentation:

```ts
expect(routeSource).toContain('<SaveToMemories');
expect(routeSource).not.toContain('<SaveToMemories url={post.image_url} inline iconOnly />');
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts
```

Expected: FAIL because `clap`, count props, `iconOnly`, and the 48-point action height are absent.

- [ ] **Step 3: Commit the red contract**

```powershell
git add src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts
git commit -m "test: specify icon-only Feed actions"
```

### Task 2: Implement the balanced Cheer, Comment, and Share icons

**Files:**
- Modify: `src/feed/FeedProofCard.tsx`
- Test: `src/feed/socialScreenContract.test.ts`

- [ ] **Step 1: Add a layered clap icon using the existing Ionicons library**

Add a local component above `Action`:

```tsx
function CheerIcon({ active }: { active: boolean }) {
  const color = active ? colors.primary : colors.textMuted;
  return (
    <View style={styles.clapIcon} accessibilityElementsHidden>
      <Ionicons name="hand-left-outline" size={19} color={color} style={styles.clapBack} />
      <Ionicons name="hand-right-outline" size={19} color={color} style={styles.clapFront} />
    </View>
  );
}
```

Add fixed geometry that keeps the two hands optically centered:

```ts
clapIcon: { width: 24, height: 22, alignItems: 'center', justifyContent: 'center' },
clapBack: { position: 'absolute', left: 1, transform: [{ rotate: '-12deg' }] },
clapFront: { position: 'absolute', right: 1, transform: [{ rotate: '12deg' }] },
```

- [ ] **Step 2: Replace visible labels with optional counts**

Change `Action` to accept the special clap value and a count:

```tsx
function Action({
  icon,
  count = 0,
  accessibilityLabel,
  active = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap | 'clap';
  count?: number;
  accessibilityLabel: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <View style={styles.actionContent}>
        {icon === 'clap' ? (
          <CheerIcon active={active} />
        ) : (
          <Ionicons name={icon} size={21} color={active ? colors.primary : colors.textMuted} />
        )}
        {count > 0 ? <Text style={[styles.actionCount, active && styles.active]}>{count}</Text> : null}
      </View>
    </Pressable>
  );
}
```

Update the three callers:

```tsx
<Action
  icon="clap"
  count={post.like_count}
  accessibilityLabel={post.liked_by_me ? `Remove Cheer, ${post.like_count}` : `Cheer, ${post.like_count}`}
  active={post.liked_by_me}
  onPress={onToggleLike}
/>
<Action
  icon="chatbubble-outline"
  count={post.comment_count}
  accessibilityLabel={`View comments, ${post.comment_count}`}
  onPress={onOpen}
/>
<Action
  icon="paper-plane-outline"
  accessibilityLabel="Share this post"
  onPress={onShare}
/>
```

- [ ] **Step 3: Apply equal spacing and minimum touch sizes**

Replace the action styles with:

```ts
action: {
  flex: 1,
  minWidth: 48,
  minHeight: 48,
  alignItems: 'center',
  justifyContent: 'center',
},
actionContent: {
  minWidth: 28,
  minHeight: 24,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
},
actionCount: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 12 },
```

Keep the existing row container and pressed/active styles. Remove the unused visible action-label style.

- [ ] **Step 4: Run the focused Feed test and verify the remaining failure is Save**

Run:

```powershell
npm.cmd test -- --runInBand src/feed/socialScreenContract.test.ts
```

Expected: FAIL only on the missing `iconOnly` Save contract.

### Task 3: Implement the icon-only Memories action

**Files:**
- Modify: `src/memories/SaveToMemories.tsx`
- Modify: `src/feed/FeedProofCard.tsx`
- Test: `src/feed/socialScreenContract.test.ts`
- Test: `src/feed/immersivePostContract.test.ts`

- [ ] **Step 1: Add the explicit icon-only prop**

Change the component signature:

```tsx
export function SaveToMemories({
  url,
  inline = false,
  iconOnly = false,
}: {
  url: string;
  inline?: boolean;
  iconOnly?: boolean;
}) {
```

- [ ] **Step 2: Render the album icon and preserve busy/saved behavior**

Use a neutral spinner for inline actions and hide visible text only when requested:

```tsx
{busy ? (
  <ActivityIndicator size="small" color={inline ? colors.textMuted : '#fff'} />
) : (
  <>
    <Ionicons
      name={saved ? 'albums' : 'albums-outline'}
      size={21}
      color={inline ? (saved ? colors.primary : colors.textMuted) : '#fff'}
    />
    {inline && !iconOnly ? (
      <Text style={[styles.inlineText, saved && styles.inlineSaved]}>
        {saved ? 'Saved' : 'Save'}
      </Text>
    ) : null}
  </>
)}
```

Update `inlineBtn` to `minWidth: 48` and `minHeight: 48`. Keep the existing accessibility label and busy/disabled state unchanged.

- [ ] **Step 3: Opt in only from the Feed card**

Change the Feed caller to:

```tsx
<SaveToMemories url={post.image_url} inline iconOnly />
```

Do not change the post-detail caller; it retains its visible Save/Saved label.

- [ ] **Step 4: Run the focused contracts and verify GREEN**

Run:

```powershell
npm.cmd test -- --runInBand src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts
```

Expected: both suites PASS.

- [ ] **Step 5: Commit the production change**

```powershell
git add src/feed/FeedProofCard.tsx src/memories/SaveToMemories.tsx src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts
git commit -m "feat: simplify Feed actions to icons"
```

### Task 4: Verify behavior and visual quality

**Files:**
- Verify only; no planned production edits.

- [ ] **Step 1: Run focused Feed and Memories coverage**

```powershell
npm.cmd test -- --runInBand src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts src/feed/FeedProofCard.test.tsx src/memories
```

Expected: all matching suites PASS. If Jest reports a listed path has no tests, rerun with the existing matching test files discovered by `rg --files src/feed src/memories | rg '\.test\.'`.

- [ ] **Step 2: Run static validation**

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint -- --quiet
git diff --check
```

Expected: all commands exit 0 with no errors or warnings.

- [ ] **Step 3: Run the full test suite**

```powershell
npm.cmd test -- --runInBand
```

Expected: all suites pass.

- [ ] **Step 4: Verify on the connected Android phone**

Publish to the already approved Expo preview channel only after explicit upload approval. On the phone, verify:

1. All four action slots are equal and centered.
2. The row does not crowd or overflow on the narrow phone viewport.
3. Cheer and Comment display nonzero counts without displaying zero.
4. Cheer changes to primary blue when selected and returns to muted when removed.
5. Save shows a spinner while working and a filled blue album after success.
6. Comment, Share, and Save still execute their existing actions.
7. Android large-font mode does not alter spacing because no visible labels remain.
8. Accessibility inspection reports the full control names and states.

- [ ] **Step 5: Commit any test-only verification adjustment**

If verification required only test tightening, commit it separately:

```powershell
git add src/feed src/memories
git commit -m "test: verify Feed action accessibility"
```
