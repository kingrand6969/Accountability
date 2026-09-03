# Feed Utility Action Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Feed's ambiguous send/archive-looking utilities with clearly labeled Share and Save actions while preserving all existing behavior.

**Architecture:** Keep the existing Feed action grouping and event handlers. Extend the standard proof-card action renderer only enough to support a compact utility label, give `SaveToMemories` a dedicated Feed-action presentation, and update the immersive post's share glyph without restructuring either post component.

**Tech Stack:** React Native, Expo SDK 56, TypeScript, `@expo/vector-icons/Ionicons`, Jest source-contract tests

---

## File map

- `src/feed/FeedProofCard.tsx` — standard Feed action-row composition and utility labels.
- `src/memories/SaveToMemories.tsx` — stateful Save action and its dedicated Feed presentation.
- `src/feed/ImmersivePost.tsx` — immersive and compact post Share glyph.
- `src/feed/socialScreenContract.test.ts` — standard Feed and Memories visual-contract coverage.
- `src/feed/immersivePostContract.test.ts` — immersive post Share contract.

### Task 1: Lock the approved utility contract with failing tests

**Files:**
- Modify: `src/feed/socialScreenContract.test.ts:214-306`
- Modify: `src/feed/immersivePostContract.test.ts:272-292`

- [ ] **Step 1: Replace the obsolete standard Feed assertions**

Change the standard action test to require the approved glyphs and labels:

```ts
test('uses grouped Feed actions with explicit Share and Save utility labels', () => {
  const actions = jsxCalls(proofCardSource, 'Action');
  const cheerAction = callWith(actions, 'onPress={onToggleLike}');
  const commentAction = callWith(actions, 'onPress={onComment}');
  const shareAction = callWith(actions, 'onPress={onShare}');

  expect(cheerAction).toMatch(/\bicon=["']cheer["']/);
  expect(cheerAction).toMatch(/\bcount=\{post\.like_count\}/);
  expect(commentAction).toMatch(/\bicon=["']chatbubble-outline["']/);
  expect(commentAction).toMatch(/\bcount=\{post\.comment_count\}/);
  expect(shareAction).toMatch(/\bicon=["']share-outline["']/);
  expect(shareAction).toMatch(/\bshortLabel=["']Share["']/);
  expect(proofCardSource).not.toContain('paper-plane-outline');

  for (const action of [cheerAction, commentAction, shareAction]) {
    expect(action).toMatch(/\baccessibilityLabel=/);
  }

  const memoryAction = jsxCalls(proofCardSource, 'SaveToMemories')[0] ?? '';
  expect(memoryAction).toMatch(/\burl=\{post\.image_url\}/);
  expect(hasBooleanProp(memoryAction, 'feedAction')).toBe(true);
  expect(hasBooleanProp(memoryAction, 'iconOnly')).toBe(false);

  const actionStyle = styleBlock(proofCardSource, 'action');
  expect(actionStyle).toMatch(/\bminWidth:\s*48\b/);
  expect(actionStyle).toMatch(/\bminHeight:\s*48\b/);
});
```

- [ ] **Step 2: Replace the album-glyph Memories assertion**

Require a bookmark, stable `Save` micro-label, and 44 px or larger Feed target:

```ts
test('renders the Feed memory action as a labeled stateful bookmark', () => {
  const memoryComponent = sourceSection(
    memorySource,
    'export function SaveToMemories(',
    'const styles = StyleSheet.create',
  );

  expect(memoryComponent).toMatch(/name=\{saved\s*\?\s*['"]bookmark['"]\s*:\s*['"]bookmark-outline['"]\}/);
  expect(memoryComponent).toContain("feedAction ? 'Save' : saved ? 'Saved' : 'Save'");
  expect(memoryComponent).not.toContain("'albums-outline'");
  expect(memoryComponent).not.toContain("'albums'");

  const feedActionStyle = styleBlock(memorySource, 'feedAction');
  expect(feedActionStyle).toMatch(/\bminWidth:\s*48\b/);
  expect(feedActionStyle).toMatch(/\bminHeight:\s*48\b/);
});
```

- [ ] **Step 3: Add the immersive Share-glyph assertion**

Add these expectations to the existing immersive action-contract test:

```ts
expect(componentSource).toContain('icon="share-outline"');
expect(componentSource).not.toContain('paper-plane-outline');
expect(componentSource).toContain('shortLabel="Share"');
```

- [ ] **Step 4: Run the focused tests and verify they fail for the old UI**

Run:

```powershell
npm test -- --runInBand src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts
```

Expected: FAIL because `FeedProofCard` still uses `paper-plane-outline`, `SaveToMemories` still uses album glyphs in `iconOnly` mode, and `feedAction` does not exist.

- [ ] **Step 5: Commit the red tests**

```powershell
git add src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts
git commit -m "test(feed): specify clear utility actions"
```

### Task 2: Implement the labeled Share action on standard Feed cards

**Files:**
- Modify: `src/feed/FeedProofCard.tsx:196-207`
- Modify: `src/feed/FeedProofCard.tsx:254-300`
- Modify: `src/feed/FeedProofCard.tsx:398-411`

- [ ] **Step 1: Replace the Share glyph and pass its visible micro-label**

```tsx
<Action
  theme={theme}
  styles={styles}
  icon="share-outline"
  shortLabel="Share"
  accessibilityLabel="Share this post"
  onPress={onShare}
/>
```

- [ ] **Step 2: Extend `Action` with an optional compact label**

Add `shortLabel` to the component arguments and type, apply the labeled layout only when it exists, and render it below the icon:

```tsx
function Action({
  theme,
  styles,
  icon,
  count,
  shortLabel,
  accessibilityLabel,
  active,
  onPress,
}: {
  theme: AppThemeColors;
  styles: ProofCardStyles;
  icon: 'cheer' | keyof typeof Ionicons.glyphMap;
  count?: number;
  shortLabel?: string;
  accessibilityLabel: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      style={({ pressed }) => [
        styles.action,
        shortLabel && styles.labeledAction,
        pressed && styles.pressed,
      ]}
    >
      {icon === 'cheer' ? (
        <Ionicons
          name={active ? 'thumbs-up' : 'thumbs-up-outline'}
          size={21}
          color={active ? theme.ink.action : theme.ink.muted}
        />
      ) : (
        <Ionicons name={icon} size={21} color={theme.ink.muted} />
      )}
      {count != null && count > 0 ? (
        <Text style={[styles.actionText, active && styles.active]}>{count}</Text>
      ) : null}
      {shortLabel ? <Text style={styles.utilityActionText}>{shortLabel}</Text> : null}
    </Pressable>
  );
}
```

- [ ] **Step 3: Add compact label styling without changing social actions**

```ts
labeledAction: {
  flexDirection: 'column',
  gap: 3,
},
utilityActionText: {
  color: theme.ink.muted,
  fontFamily: font.semibold,
  fontSize: 9.5,
  lineHeight: 11,
},
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
npm test -- --runInBand src/feed/socialScreenContract.test.ts
```

Expected: the Share assertions pass; the test still fails only on the not-yet-implemented `feedAction` Memories contract.

### Task 3: Implement the labeled bookmark Memories action

**Files:**
- Modify: `src/memories/SaveToMemories.tsx:9-83`
- Modify: `src/feed/FeedProofCard.tsx:204-207`

- [ ] **Step 1: Replace `iconOnly` with a purpose-specific `feedAction` prop**

Use this public component shape:

```ts
export function SaveToMemories({
  url,
  inline = false,
  feedAction = false,
}: {
  url: string;
  inline?: boolean;
  feedAction?: boolean;
}) {
```

- [ ] **Step 2: Render one bookmark family in every state**

Replace the current conditional icon tree with:

```tsx
{busy ? (
  <ActivityIndicator
    size="small"
    color={inline || feedAction ? colors.textMuted : '#fff'}
  />
) : (
  <>
    <Ionicons
      name={saved ? 'bookmark' : 'bookmark-outline'}
      size={feedAction ? 21 : 17}
      color={
        inline || feedAction
          ? saved
            ? colors.primaryDark
            : colors.textMuted
          : '#fff'
      }
    />
    {inline || feedAction ? (
      <Text
        style={[
          feedAction ? styles.feedActionText : styles.inlineText,
          saved && styles.inlineSaved,
        ]}
      >
        {feedAction ? 'Save' : saved ? 'Saved' : 'Save'}
      </Text>
    ) : null}
  </>
)}
```

- [ ] **Step 3: Give the Feed variant the approved vertical micro-label layout**

Select its Pressable style with:

```tsx
style={({ pressed }) => [
  feedAction ? styles.feedAction : inline ? styles.inlineBtn : styles.btn,
  pressed && styles.pressed,
]}
```

Add:

```ts
feedAction: {
  width: 48,
  minWidth: 48,
  minHeight: 48,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
},
feedActionText: {
  color: colors.textMuted,
  fontFamily: font.semibold,
  fontSize: 9.5,
  lineHeight: 11,
},
```

- [ ] **Step 4: Use the new Feed variant from the proof card**

```tsx
<SaveToMemories url={post.image_url} feedAction />
```

- [ ] **Step 5: Run the standard Feed contract**

Run:

```powershell
npm test -- --runInBand src/feed/socialScreenContract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the standard Feed implementation**

```powershell
git add src/feed/FeedProofCard.tsx src/memories/SaveToMemories.tsx
git commit -m "feat(feed): clarify Share and Save actions"
```

### Task 4: Align immersive posts and complete regression verification

**Files:**
- Modify: `src/feed/ImmersivePost.tsx:416-420`
- Modify: `src/feed/ImmersivePost.tsx:525-529`

- [ ] **Step 1: Replace both immersive paper-plane glyphs**

Use the same approved Share glyph in `ImmersivePostSurface` and `CompactPostSurface`:

```tsx
<Action
  icon="share-outline"
  label="Share this post"
  shortLabel="Share"
  onPress={onShare}
/>
```

- [ ] **Step 2: Run both focused contract suites**

Run:

```powershell
npm test -- --runInBand src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type checking**

Run:

```powershell
npx tsc --noEmit
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 4: Run the complete test suite**

Run:

```powershell
npm test -- --runInBand
```

Expected: all suites and tests pass.

- [ ] **Step 5: Commit the immersive alignment**

```powershell
git add src/feed/ImmersivePost.tsx
git commit -m "fix(feed): align immersive Share icon"
```

### Task 5: Verify the approved design on the connected staging device

**Files:**
- Create: `.release-evidence/feed-utility-action-clarity/phone-unsaved.png`
- Create: `.release-evidence/feed-utility-action-clarity/phone-saved.png`

- [ ] **Step 1: Publish only to the staging preview channel**

Run from `accountability-app`. `eas update --environment preview` does not inherit
`build.preview.env.APP_VARIANT` from `eas.json`, so set the staging identity and
disable EAS VCS upload explicitly for this publish. Resolve the public Expo config
and fail before publishing if any staging identity or runtime value is wrong:

```powershell
$env:APP_VARIANT = 'staging'
$env:EAS_NO_VCS = '1'

try {
  $configJson = npx expo config --type public --json
  if ($LASTEXITCODE -ne 0) {
    throw "Expo public config resolution failed with exit code $LASTEXITCODE."
  }

  $config = $configJson | ConvertFrom-Json
  $effectiveRuntimeVersion = if ($config.runtimeVersion -is [string]) {
    $config.runtimeVersion
  } elseif ($config.runtimeVersion.policy -eq 'appVersion') {
    $config.version
  } else {
    $null
  }

  $expected = [ordered]@{
    'name' = 'Mantle Staging'
    'scheme' = 'accountabilityapp-staging'
    'android.package' = 'com.awldesk.accountability.staging'
    'ios.bundleIdentifier' = 'com.awldesk.accountability.staging'
    'extra.appVariant' = 'preview'
    'extra.eas.projectId' = 'f91c0791-4a6e-4080-88fd-5cc9a4e720bf'
    'version' = '1.0.1'
    'effectiveRuntimeVersion' = '1.0.1'
  }
  $actual = [ordered]@{
    'name' = $config.name
    'scheme' = $config.scheme
    'android.package' = $config.android.package
    'ios.bundleIdentifier' = $config.ios.bundleIdentifier
    'extra.appVariant' = $config.extra.appVariant
    'extra.eas.projectId' = $config.extra.eas.projectId
    'version' = $config.version
    'effectiveRuntimeVersion' = $effectiveRuntimeVersion
  }

  $mismatches = @(
    foreach ($key in $expected.Keys) {
      if ([string]$actual[$key] -cne [string]$expected[$key]) {
        "${key}: expected '$($expected[$key])', got '$($actual[$key])'"
      }
    }
  )
  if ($mismatches.Count -gt 0) {
    $mismatches | ForEach-Object { Write-Error $_ }
    exit 1
  }

  Write-Host 'Staging public-config preflight passed.'
  npx eas update --channel preview --environment preview --message "Clarify Feed Share and Save actions (staging identity + share fix)"
  if ($LASTEXITCODE -ne 0) {
    throw "EAS preview update failed with exit code $LASTEXITCODE."
  }
} finally {
  Remove-Item Env:APP_VARIANT -ErrorAction SilentlyContinue
  Remove-Item Env:EAS_NO_VCS -ErrorAction SilentlyContinue
}
```

Expected: the staging public-config preflight passes, followed by a successful Android preview update group. Never use the production profile, production environment, or production channel.

- [ ] **Step 2: Reload `com.awldesk.accountability.staging` on device `FY24068108E6`**

Run:

```powershell
$adbPath = 'C:\Users\KinGrand\New folder\.device-tools\platform-tools\adb.exe'
& $adbPath -s FY24068108E6 shell am force-stop com.awldesk.accountability.staging
& $adbPath -s FY24068108E6 shell am start -n com.awldesk.accountability.staging/.MainActivity
```

Expected: the staging app launches with existing user data preserved.

- [ ] **Step 3: Inspect a Feed post at actual phone size**

Confirm all of the following:

- Cheer and Comments remain unchanged on the left.
- Share uses the share-arrow with the `Share` label.
- Save uses the outline bookmark with the `Save` label.
- Neither action has a pill, box, glow, or background fill.
- Both actions remain comfortably tappable.

- [ ] **Step 4: Save the post to Memories and inspect the saved state**

Expected: the bookmark becomes filled, the visible label remains `Save`, and existing saved feedback appears.

- [ ] **Step 5: Verify Share behavior**

Expected: tapping Share opens the existing system share flow, not Messages or a Feed editor.

- [ ] **Step 6: Capture device evidence**

Create the evidence directory, capture the unsaved state, perform the existing Save action, and capture the saved state:

```powershell
New-Item -ItemType Directory -Force '.release-evidence\feed-utility-action-clarity' | Out-Null
& $adbPath -s FY24068108E6 exec-out screencap -p > '.release-evidence\feed-utility-action-clarity\phone-unsaved.png'
& $adbPath -s FY24068108E6 exec-out screencap -p > '.release-evidence\feed-utility-action-clarity\phone-saved.png'
```

Expected: both screenshots exist and show the approved glyph-plus-label treatment. Do not commit device evidence unless explicitly requested.
