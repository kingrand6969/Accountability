# Feed Cheer Solid Signal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Mantle’s improvised two-hand Cheer glyph with the approved outline-to-solid Thumbs Up interaction and tighten the standard Feed action row without changing behavior.

**Architecture:** Keep the existing `Action` components and event handlers, but give `cheer` a semantic icon branch that maps inactive state to `thumbs-up-outline` and active state to `thumbs-up`. In the standard Feed card, group Cheer/Comments separately from Share/Memories while preserving 48-point controls; mirror the Cheer glyph state in immersive post actions for visual consistency.

**Tech Stack:** Expo SDK 56, React Native 0.85, Expo Ionicons, Jest source contracts, TypeScript.

---

### Task 1: Lock the approved standard Feed contract

**Files:**
- Modify: `src/feed/socialScreenContract.test.ts`
- Modify: `src/feed/FeedProofCard.tsx`

- [ ] **Step 1: Write the failing Feed contract**

Update the existing icon-only action test so the Cheer call is semantic and the implementation must use the approved outline/solid pair:

```ts
expect(cheerAction).toMatch(/\bicon=["']cheer["']/);
expect(actionComponent).toContain("name={active ? 'thumbs-up' : 'thumbs-up-outline'}");
expect(proofCardSource).not.toContain('hand-left-outline');
expect(proofCardSource).not.toContain('hand-right-outline');
expect(proofCardSource).not.toContain('function CheerIcon(');
expect(proofCardSource).toContain('<View style={styles.socialActions}>');
expect(proofCardSource).toContain('<View style={styles.utilityActions}>');
expect(styleBlock(proofCardSource, 'action')).not.toContain('flex: 1');
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
npm test -- --runInBand src/feed/socialScreenContract.test.ts
```

Expected: FAIL because the component still uses `icon="clap"`, the two overlapping hand glyphs, and equal-width actions.

- [ ] **Step 3: Implement the standard Feed design**

In `FeedProofCard.tsx`, replace the four equal actions with two groups:

```tsx
<View style={styles.actions}>
  <View style={styles.socialActions}>
    <Action
      theme={theme}
      styles={styles}
      icon="cheer"
      count={post.like_count}
      accessibilityLabel={`${post.liked_by_me ? 'Remove Cheer' : 'Cheer'}${post.like_count > 0 ? `, ${post.like_count} ${post.like_count === 1 ? 'Cheer' : 'Cheers'}` : ''}`}
      active={post.liked_by_me}
      onPress={onToggleLike}
    />
    <Action
      theme={theme}
      styles={styles}
      icon="chatbubble-outline"
      count={post.comment_count}
      accessibilityLabel={`${viewCommentsLabel}${post.comment_count > 0 ? `, ${post.comment_count} ${post.comment_count === 1 ? 'comment' : 'comments'}` : ''}`}
      onPress={onComment}
    />
  </View>
  <View style={styles.utilityActions}>
    <Action
      theme={theme}
      styles={styles}
      icon="paper-plane-outline"
      accessibilityLabel="Share this post"
      onPress={onShare}
    />
    {post.image_url && post.post_type !== 'video' ? (
      <View style={styles.memoryAction}>
        <SaveToMemories url={post.image_url} inline iconOnly />
      </View>
    ) : null}
  </View>
</View>
```

Change the semantic icon union and rendering branch:

```tsx
icon: 'cheer' | keyof typeof Ionicons.glyphMap;

<Ionicons
  name={icon === 'cheer' ? (active ? 'thumbs-up' : 'thumbs-up-outline') : icon}
  size={21}
  color={active ? theme.ink.action : theme.ink.muted}
/>
```

Use existing spacing and touch tokens while removing the old `CheerIcon`, `cheerIcon`, `cheerLeft`, and `cheerRight` definitions:

```tsx
actions: {
  minHeight: 48,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: spacing.md,
  backgroundColor: theme.surface.canvas,
},
socialActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
utilityActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
memoryAction: { width: 48, minHeight: 48 },
action: {
  width: 48,
  minWidth: 48,
  minHeight: 48,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: spacing.xs,
},
```

- [ ] **Step 4: Run the Feed contract and verify GREEN**

Run:

```bash
npm test -- --runInBand src/feed/socialScreenContract.test.ts
```

Expected: PASS.

### Task 2: Keep immersive Cheer actions consistent

**Files:**
- Modify: `src/feed/immersivePostContract.test.ts`
- Modify: `src/feed/ImmersivePost.tsx`

- [ ] **Step 1: Write the failing immersive contract**

Replace the old clap expectations with:

```ts
expect(componentSource).toContain('<Action icon="cheer"');
expect(componentSource).toContain("name={active ? 'thumbs-up' : 'thumbs-up-outline'}");
expect(componentSource).not.toContain('hand-left-outline');
expect(componentSource).not.toContain('hand-right-outline');
expect(componentSource).not.toContain('function CheerIcon(');
```

- [ ] **Step 2: Run the immersive contract and verify RED**

Run:

```bash
npm test -- --runInBand src/feed/immersivePostContract.test.ts
```

Expected: FAIL because immersive post actions still render the two-hand icon.

- [ ] **Step 3: Implement the same Solid Signal mapping**

Change both immersive Cheer calls to `icon="cheer"`, remove `CheerIcon` and its three positioning styles, and render:

```tsx
<Ionicons
  name={icon === 'cheer' ? (active ? 'thumbs-up' : 'thumbs-up-outline') : icon}
  size={18}
  color={color}
/>
```

Keep the existing visible “Cheer” text, handlers, colors, touch targets, and accessibility labels unchanged.

- [ ] **Step 4: Run the immersive contract and verify GREEN**

Run:

```bash
npm test -- --runInBand src/feed/immersivePostContract.test.ts
```

Expected: PASS.

### Task 3: Regression-check and show the staging result

**Files:**
- Verify: `src/feed/FeedProofCard.tsx`
- Verify: `src/feed/ImmersivePost.tsx`
- Verify: `src/memories/SaveToMemories.tsx`

- [ ] **Step 1: Run focused Feed tests**

Run:

```bash
npm test -- --runInBand src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts src/feed/feedInteractionAppearanceContract.test.ts
```

Expected: all focused suites PASS.

- [ ] **Step 2: Run static verification**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Commit the implementation**

Run:

```bash
git add src/feed/FeedProofCard.tsx src/feed/ImmersivePost.tsx src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts
git commit -m "feat(feed): adopt Solid Signal Cheer icon"
```

- [ ] **Step 4: Publish only to the staging preview channel**

Run from `accountability-app` with EAS VCS upload disabled:

```powershell
$env:EAS_NO_VCS = '1'
npx eas update --channel preview --environment preview --message "Feed Solid Signal Cheer icon"
```

Expected: a successful Android preview update group. Never use the production profile or production channel.

- [ ] **Step 5: Verify on the connected Android staging app**

Restart `com.awldesk.accountability.staging`, open Feed, and confirm:

```text
Resting Cheer = outline Thumbs Up
Cheered = solid neon Thumbs Up
Count stays aligned
No active capsule or icon background
Comment, Share, and Memories remain tappable
```

Capture a device screenshot as staging evidence.
