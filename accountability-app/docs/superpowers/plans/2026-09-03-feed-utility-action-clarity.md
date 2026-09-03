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
- Create: `.release-evidence/feed-utility-action-clarity/eas-update-<revision>.json`

- [ ] **Step 1: Publish only to the staging preview channel**

Run from `accountability-app`. `eas update --environment preview` does not inherit
`build.preview.env.APP_VARIANT` from `eas.json`. The commands below preserve the
caller's environment, prove the publish source and delivery isolation, resolve the
public Expo config, and inspect the EAS account, current remote channel mappings, and
latest compatible Android build. They use the pinned official EAS CLI 23.2.0 and
fail closed before publishing if any value is missing or wrong. Do not run any
channel-edit command.

```powershell
$appVariantEntry = Get-Item Env:APP_VARIANT -ErrorAction SilentlyContinue
$appVariantExisted = $null -ne $appVariantEntry
$originalAppVariant = if ($appVariantExisted) { $appVariantEntry.Value } else { $null }
$easNoVcsEntry = Get-Item Env:EAS_NO_VCS -ErrorAction SilentlyContinue
$easNoVcsExisted = $null -ne $easNoVcsEntry
$originalEasNoVcs = if ($easNoVcsExisted) { $easNoVcsEntry.Value } else { $null }

try {
  $env:APP_VARIANT = 'staging'

  $revision = (& git rev-parse --verify HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $revision -notmatch '^[0-9a-f]{40}$') {
    throw 'Could not resolve an exact 40-character source HEAD.'
  }
  Write-Host "Source revision: $revision"

  # These are the local inputs that can affect the app archive or Metro bundle.
  # Evidence and docs are excluded by .easignore and are intentionally not listed.
  $publishInputPaths = @(
    '.easignore', 'app', 'app.config.js', 'app.json', 'assets', 'babel.config.js',
    'components', 'constants', 'eas.json', 'expo-env.d.ts', 'hooks', 'infra',
    'lib', 'metro.config.js', 'modules', 'package.json', 'package-lock.json',
    'patches', 'scripts', 'src', 'tsconfig.json', 'types', 'yarn.lock',
    'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'android', 'ios'
  )
  $publishInputChanges = @(
    & git status --porcelain=v1 --untracked-files=all -- @publishInputPaths
  )
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect local app-source/config/dependency changes.'
  }
  if ($publishInputChanges.Count -gt 0) {
    throw ("Publish inputs differ from committed HEAD ${revision}:`n - " +
      ($publishInputChanges -join "`n - "))
  }

  # The feature may change app source, but it must not change delivery identity,
  # dependency manifests/locks, or native projects relative to its approved base.
  $deliveryIsolationPaths = @(
    '.easignore', 'app.json', 'app.config.js', 'eas.json', 'package.json',
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
    'patches', 'scripts/location-drain-bridge-patch.test.mjs', 'android', 'ios'
  )
  $deliveryIsolationChanges = @(
    & git diff --name-only "e81136a..$revision" -- @deliveryIsolationPaths
  )
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not prove the feature delivery-isolation range from e81136a.'
  }
  if ($deliveryIsolationChanges.Count -gt 0) {
    throw ("Feature range e81136a..${revision} changes protected delivery files:`n - " +
      ($deliveryIsolationChanges -join "`n - "))
  }

  $configJson = npx.cmd expo config --type public --json
  if ($LASTEXITCODE -ne 0) {
    throw "Expo public config resolution failed with exit code $LASTEXITCODE."
  }

  try {
    $config = $configJson | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "Expo public config did not return valid JSON: $($_.Exception.Message)"
  }
  $effectiveRuntimeVersion = if ($config.runtimeVersion -is [string]) {
    $config.runtimeVersion
  } elseif ($config.runtimeVersion.policy -eq 'appVersion') {
    $config.version
  } else {
    $null
  }

  $expected = [ordered]@{
    'name' = 'Mantle Staging'
    'owner' = 'kingrand'
    'slug' = 'accountability-app'
    'scheme' = 'accountabilityapp-staging'
    'android.package' = 'com.awldesk.accountability.staging'
    'ios.bundleIdentifier' = 'com.awldesk.accountability.staging'
    'extra.appVariant' = 'preview'
    'extra.eas.projectId' = 'f91c0791-4a6e-4080-88fd-5cc9a4e720bf'
    'updates.url' = 'https://u.expo.dev/f91c0791-4a6e-4080-88fd-5cc9a4e720bf'
    'runtimeVersion.policy' = 'appVersion'
    'version' = '1.0.1'
    'effectiveRuntimeVersion' = '1.0.1'
  }
  $actual = [ordered]@{
    'name' = $config.name
    'owner' = $config.owner
    'slug' = $config.slug
    'scheme' = $config.scheme
    'android.package' = $config.android.package
    'ios.bundleIdentifier' = $config.ios.bundleIdentifier
    'extra.appVariant' = $config.extra.appVariant
    'extra.eas.projectId' = $config.extra.eas.projectId
    'updates.url' = $config.updates.url
    'runtimeVersion.policy' = $config.runtimeVersion.policy
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
    throw ("Staging public-config preflight failed:`n - " +
      ($mismatches -join "`n - "))
  }

  $whoamiOutput = @(& npx.cmd eas-cli@23.2.0 whoami)
  if ($LASTEXITCODE -ne 0) {
    throw "EAS whoami failed with exit code $LASTEXITCODE."
  }
  $whoamiLines = @(
    $whoamiOutput | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  )
  if ($whoamiLines.Count -lt 1 -or $whoamiLines[0] -cne 'kingrand') {
    throw "Expected EAS account 'kingrand'; got '$($whoamiLines -join ' | ')'."
  }

  # Enumerate every current channel so no second channel can alias preview.
  $channelPageSize = 25
  $channelOffset = 0
  $allChannels = @()
  do {
    $channelJson = & npx.cmd eas-cli@23.2.0 channel:list --offset $channelOffset --limit $channelPageSize --json --non-interactive
    if ($LASTEXITCODE -ne 0) {
      throw "EAS channel:list failed at offset $channelOffset."
    }
    try {
      $channelDocument = $channelJson | ConvertFrom-Json -ErrorAction Stop
    } catch {
      throw "EAS channel:list returned invalid JSON at offset $channelOffset."
    }
    $channelPage = @($channelDocument.currentPage)
    if ($channelPage.Count -gt $channelPageSize) {
      throw "EAS channel:list exceeded the requested page size at offset $channelOffset."
    }
    $allChannels += $channelPage
    $channelOffset += $channelPage.Count
    if ($channelOffset -gt 1000) {
      throw 'Refusing to inspect more than 1000 EAS channels.'
    }
  } while ($channelPage.Count -eq $channelPageSize)

  $uniqueChannelIds = @(
    $allChannels.id |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Sort-Object -Unique
  )
  if ($allChannels.Count -lt 1 -or $uniqueChannelIds.Count -ne $allChannels.Count) {
    throw 'EAS channel enumeration is empty or contains missing/duplicate IDs.'
  }

  $previewMatches = @($allChannels | Where-Object { $_.name -ceq 'preview' })
  if ($previewMatches.Count -ne 1) {
    throw "Expected exactly one EAS 'preview' channel; found $($previewMatches.Count)."
  }
  $previewChannel = $previewMatches[0]
  if ($previewChannel.isPaused -isnot [bool] -or $previewChannel.isPaused) {
    throw "EAS channel 'preview' must exist and be active."
  }
  try {
    $previewMapping = $previewChannel.branchMapping | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "Channel 'preview' has an unreadable branch mapping."
  }
  $previewRules = @($previewMapping.data)
  if ($previewMapping.version -ne 0 -or $previewRules.Count -ne 1 -or
      $previewRules[0].branchMappingLogic -cne 'true' -or
      [string]::IsNullOrWhiteSpace($previewRules[0].branchId)) {
    throw "Channel 'preview' must have one unconditional version-0 mapping."
  }
  $previewBranches = @(
    $previewChannel.updateBranches |
      Where-Object { $_.id -ceq $previewRules[0].branchId }
  )
  if ($previewBranches.Count -ne 1 -or $previewBranches[0].name -cne 'preview') {
    throw "Channel 'preview' must map only to branch 'preview'."
  }
  $previewBranch = $previewBranches[0]

  # Every other existing channel must resolve without using preview's branch ID
  # or branch name. Unknown mapping schemas fail closed.
  foreach ($candidate in @($allChannels | Where-Object { $_.id -cne $previewChannel.id })) {
    try {
      $candidateMapping = $candidate.branchMapping | ConvertFrom-Json -ErrorAction Stop
    } catch {
      throw "Channel '$($candidate.name)' has an unreadable branch mapping."
    }
    $candidateRules = @($candidateMapping.data)
    if ($candidateMapping.version -ne 0 -or $candidateRules.Count -lt 1) {
      throw "Channel '$($candidate.name)' uses an unsupported mapping schema."
    }
    foreach ($candidateRule in $candidateRules) {
      if ([string]::IsNullOrWhiteSpace($candidateRule.branchId)) {
        throw "Channel '$($candidate.name)' has a mapping rule without a branch ID."
      }
      $resolvedBranches = @(
        $candidate.updateBranches |
          Where-Object { $_.id -ceq $candidateRule.branchId }
      )
      if ($resolvedBranches.Count -ne 1) {
        throw "Channel '$($candidate.name)' has a mapping rule that does not resolve exactly once."
      }
      if ($candidateRule.branchId -ceq $previewBranch.id -or
          $resolvedBranches[0].name -ceq 'preview') {
        throw "Channel '$($candidate.name)' aliases the protected preview branch."
      }
    }
  }

  $channelBindings = [ordered]@{
    preview = [ordered]@{
      present = $true
      channelId = $previewChannel.id
      branchId = $previewBranch.id
      branchName = $previewBranch.name
    }
  }
  $productionMatches = @($allChannels | Where-Object { $_.name -ceq 'production' })
  if ($productionMatches.Count -gt 1) {
    throw "Expected at most one EAS 'production' channel; found $($productionMatches.Count)."
  }
  if ($productionMatches.Count -eq 0) {
    $channelBindings.production = [ordered]@{ present = $false }
    Write-Host "No production channel exists; recorded as safe and leaving it absent."
  } else {
    $productionChannel = $productionMatches[0]
    if ($productionChannel.isPaused -isnot [bool] -or $productionChannel.isPaused) {
      throw "Existing EAS channel 'production' must be active."
    }
    try {
      $productionMapping = $productionChannel.branchMapping | ConvertFrom-Json -ErrorAction Stop
    } catch {
      throw "Channel 'production' has an unreadable branch mapping."
    }
    $productionRules = @($productionMapping.data)
    if ($productionMapping.version -ne 0 -or $productionRules.Count -ne 1 -or
        $productionRules[0].branchMappingLogic -cne 'true' -or
        [string]::IsNullOrWhiteSpace($productionRules[0].branchId)) {
      throw "Channel 'production' must have one unconditional version-0 mapping."
    }
    $productionBranches = @(
      $productionChannel.updateBranches |
        Where-Object { $_.id -ceq $productionRules[0].branchId }
    )
    if ($productionBranches.Count -ne 1 -or
        $productionBranches[0].name -cne 'production' -or
        $productionBranches[0].id -ceq $previewBranch.id) {
      throw "Channel 'production' must map only to a distinct 'production' branch."
    }
    $channelBindings.production = [ordered]@{
      present = $true
      channelId = $productionChannel.id
      branchId = $productionBranches[0].id
      branchName = $productionBranches[0].name
    }
  }

  $buildsJson = & npx.cmd eas-cli@23.2.0 build:list --platform android --status finished --channel preview --limit 1 --json --non-interactive
  if ($LASTEXITCODE -ne 0) {
    throw "EAS build:list failed with exit code $LASTEXITCODE."
  }
  try {
    $builds = @($buildsJson | ConvertFrom-Json -ErrorAction Stop)
  } catch {
    throw "EAS build:list did not return valid JSON: $($_.Exception.Message)"
  }
  if ($builds.Count -ne 1) {
    throw "Expected one latest finished Android preview build; found $($builds.Count)."
  }
  $latestBuild = $builds[0]
  $expectedBuild = [ordered]@{
    'status' = 'FINISHED'
    'platform' = 'ANDROID'
    'buildProfile' = 'preview'
    'updateChannel.name' = 'preview'
    'appVersion' = '1.0.1'
    'runtime.version' = '1.0.1'
    'appIdentifier' = 'com.awldesk.accountability.staging'
    'app.id' = 'f91c0791-4a6e-4080-88fd-5cc9a4e720bf'
  }
  $actualBuild = [ordered]@{
    'status' = $latestBuild.status
    'platform' = $latestBuild.platform
    'buildProfile' = $latestBuild.buildProfile
    'updateChannel.name' = $latestBuild.updateChannel.name
    'appVersion' = $latestBuild.appVersion
    'runtime.version' = $latestBuild.runtime.version
    'appIdentifier' = $latestBuild.appIdentifier
    'app.id' = $latestBuild.app.id
  }
  $buildMismatches = @(
    foreach ($key in $expectedBuild.Keys) {
      if ([string]$actualBuild[$key] -cne [string]$expectedBuild[$key]) {
        "${key}: expected '$($expectedBuild[$key])', got '$($actualBuild[$key])'"
      }
    }
  )
  if ($buildMismatches.Count -gt 0) {
    throw ("Latest Android preview build is incompatible:`n - " +
      ($buildMismatches -join "`n - "))
  }

  # Recheck HEAD and local publish inputs immediately before enabling no-VCS mode.
  $recheckedRevision = (& git rev-parse --verify HEAD).Trim()
  $recheckedInputChanges = @(
    & git status --porcelain=v1 --untracked-files=all -- @publishInputPaths
  )
  if ($LASTEXITCODE -ne 0 -or $recheckedRevision -cne $revision -or
      $recheckedInputChanges.Count -gt 0) {
    throw 'Source HEAD or local publish inputs changed during preflight.'
  }

  $env:EAS_NO_VCS = '1'
  $updateMessage = "Clarify Feed Share and Save actions (staging identity + share fix; HEAD $revision)"
  $updateJson = & npx.cmd eas-cli@23.2.0 update --channel preview --environment preview --platform android --non-interactive --json --message $updateMessage
  if ($LASTEXITCODE -ne 0) {
    throw "EAS Android preview update failed with exit code $LASTEXITCODE."
  }
  try {
    $updateResult = $updateJson | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "EAS update did not return valid JSON: $($_.Exception.Message)"
  }

  $shortRevision = $revision.Substring(0, 12)
  $evidenceDirectory = '.release-evidence/feed-utility-action-clarity'
  $evidencePath = Join-Path $evidenceDirectory "eas-update-$shortRevision.json"
  New-Item -ItemType Directory -Force $evidenceDirectory -ErrorAction Stop | Out-Null
  [ordered]@{
    sourceRevision = $revision
    message = $updateMessage
    platform = 'android'
    channel = 'preview'
    environment = 'preview'
    channelBindings = $channelBindings
    compatibleBuildId = $latestBuild.id
    easUpdate = $updateResult
  } | ConvertTo-Json -Depth 100 |
    Set-Content -LiteralPath $evidencePath -Encoding utf8 -ErrorAction Stop
  if (-not (Test-Path -LiteralPath $evidencePath -PathType Leaf -ErrorAction Stop)) {
    throw "EAS update evidence was not written to '$evidencePath'."
  }
  Write-Host "Published Android preview update from $revision; evidence: $evidencePath"
} finally {
  if ($appVariantExisted) {
    $env:APP_VARIANT = $originalAppVariant
  } else {
    Remove-Item Env:APP_VARIANT -ErrorAction SilentlyContinue
  }
  if ($easNoVcsExisted) {
    $env:EAS_NO_VCS = $originalEasNoVcs
  } else {
    Remove-Item Env:EAS_NO_VCS -ErrorAction SilentlyContinue
  }
}
```

Expected: every fail-closed preflight passes, then exactly one Android preview update
group is published and its JSON evidence names the exact source revision. Never use
the production profile, production environment, production branch, or production
channel. The active `preview` channel must map only to the `preview` branch, and no
other existing channel may map to that branch or branch ID. If `production` exists,
it must map only to a distinct `production` branch. If it is absent, record that
safe fact and proceed without creating it. Never create or repair mappings as part
of this task.

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
