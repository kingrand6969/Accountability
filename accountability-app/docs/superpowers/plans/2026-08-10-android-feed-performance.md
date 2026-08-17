# Android Feed Performance and Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Android Feed and My Day smoother by bounding list work and keeping video resources active only for visible, focused content.

**Architecture:** The Feed owns visibility state, cards receive an `active` signal, and `PostVideo` mounts a player only for the active item. Expo's `useVideoPlayer` then disposes the native player automatically on unmount; focus/background changes pause and unmount media without changing the card design.

**Tech Stack:** React Native FlatList, Expo Router focus hooks, AppState, expo-video, Jest, Android ADB/device profiling

---

## File map

- Visibility policy: `src/feed/videoPolicy.ts`, `src/feed/videoPolicy.test.ts`.
- Feed windowing: `src/app/(app)/index.tsx`.
- Propagation: `src/feed/FeedProofCard.tsx`, `src/feed/ImmersivePost.tsx`, `src/feed/PostVideo.tsx`.
- Story cleanup: `src/app/story/[userId].tsx`, `src/stories/StoryRail.tsx`.
- Release profile: `eas.json`, `package.json`, native dependency imports.
- Evidence: `docs/release-evidence/2026-08-10-fitness-feed-android-performance.md`.

### Task 1: Extend the video policy to one eligible visible video

**Files:**
- Modify: `src/feed/videoPolicy.ts`
- Modify: `src/feed/videoPolicy.test.ts`

- [ ] **Step 1: Add failing eligibility tests**

```ts
expect(activeVideoPost({ focused: true, appActive: true, visiblePostIds: ['a', 'b'] })).toBe('a');
expect(activeVideoPost({ focused: false, appActive: true, visiblePostIds: ['a'] })).toBeNull();
expect(activeVideoPost({ focused: true, appActive: false, visiblePostIds: ['a'] })).toBeNull();
```

- [ ] **Step 2: Implement the minimal pure policy**

```ts
export function activeVideoPost(input: {
  focused: boolean;
  appActive: boolean;
  visiblePostIds: readonly string[];
}): string | null {
  if (!input.focused || !input.appActive) return null;
  return input.visiblePostIds[0] ?? null;
}
```

- [ ] **Step 3: Run and commit**

Run: `npm test -- --runInBand src/feed/videoPolicy.test.ts`  
Expected: PASS.

```bash
git add src/feed/videoPolicy.ts src/feed/videoPolicy.test.ts
git commit -m "test: define visible video playback policy"
```

### Task 2: Add Feed viewability and bounded list rendering

**Files:**
- Modify: `src/app/(app)/index.tsx`
- Modify: `src/feed/FeedProofCard.tsx`
- Modify: `src/feed/ImmersivePost.tsx`
- Modify: `src/feed/socialScreenContract.test.ts`

- [ ] **Step 1: Track visible post IDs without state churn**

Create stable refs outside render:

```ts
const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 65, minimumViewTime: 180 }).current;
const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
  const ids = viewableItems.flatMap(({ item }) =>
    item?.kind === 'post' ? [item.post.id] : [],
  );
  setVisiblePostIds((current) => current.join('|') === ids.join('|') ? current : ids);
}).current;
```

Also derive screen focus with `useIsFocused()` and foreground state with an `AppState` listener.

- [ ] **Step 2: Apply bounded FlatList settings**

Add to the existing Feed `FlatList`:

```tsx
initialNumToRender={4}
maxToRenderPerBatch={4}
updateCellsBatchingPeriod={50}
windowSize={7}
removeClippedSubviews={Platform.OS === 'android'}
viewabilityConfig={viewabilityConfig}
onViewableItemsChanged={onViewableItemsChanged}
```

- [ ] **Step 3: Pass `mediaActive` through existing cards**

```tsx
<FeedProofCard
  post={item}
  mediaActive={activeVideoId === item.id}
  currentUserId={myId}
  preview={encouragementPreviews.get(item.id)}
  attending={!!item.event && attending.has(item.event.group_id)}
  onOpen={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
  onMenu={() => onPostMenu(item)}
  onAttend={() => onAttend(item)}
  onToggleLike={() => onToggleLike(item)}
  onShare={() => setBroadcast(item)}
  onOpenEncouragement={() => router.push({ pathname: '/post/[id]', params: { id: item.id, encouragement: '1' } } as never)}
/>
```

Add the optional prop to `FeedProofCard` and `ImmersivePost`; default it to `false` so detail pages do not unexpectedly autoplay.

- [ ] **Step 4: Run contracts and commit**

Run: `npm test -- --runInBand src/feed/socialScreenContract.test.ts src/feed/videoPolicy.test.ts`  
Expected: PASS.

```bash
git add src/app/(app)/index.tsx src/feed/FeedProofCard.tsx src/feed/ImmersivePost.tsx src/feed/socialScreenContract.test.ts
git commit -m "perf: bound Feed rendering and track visible media"
```

### Task 3: Mount video players only for active cards

**Files:**
- Modify: `src/feed/PostVideo.tsx`
- Create: `src/feed/PostVideo.test.tsx`

- [ ] **Step 1: Write a component contract**

Test that inactive media renders a poster/placeholder without calling the player-host component and active media renders `VideoView`. Mock `expo-video` and `useResolvedMediaUrl`.

- [ ] **Step 2: Split inactive and active rendering**

```tsx
export function PostVideo({ url, detail = false, active = false }: Props) {
  const resolvedUrl = useResolvedMediaUrl(url);
  return active && resolvedUrl
    ? <ActivePostVideo url={resolvedUrl} detail={detail} />
    : <VideoPlaceholder detail={detail} />;
}

function ActivePostVideo({ url, detail }: { url: string; detail: boolean }) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
    instance.muted = false;
  });
  useEffect(() => () => player.pause(), [player]);
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
}
```

The child boundary is required: `useVideoPlayer` owns and automatically disposes the native player when `ActivePostVideo` unmounts.

- [ ] **Step 3: Preserve detail-screen manual playback**

On the dedicated post-detail route, pass `active={isFocused && appActive}`. Do not autoplay; native controls remain the user's trigger.

- [ ] **Step 4: Test and commit**

Run: `npm test -- --runInBand src/feed/PostVideo.test.tsx src/feed/videoPolicy.test.ts`  
Expected: PASS.

```bash
git add src/feed/PostVideo.tsx src/feed/PostVideo.test.tsx src/feed/ImmersivePost.tsx src/app/post/[id].tsx
git commit -m "perf: release off-screen Feed video players"
```

### Task 4: Verify story timers and media cleanup

**Files:**
- Modify: `src/app/story/[userId].tsx`
- Modify: `src/stories/StoryRail.tsx`
- Modify: `src/stories/StoryRail.test.ts`

- [ ] **Step 1: Add cleanup assertions**

Use fake timers to mount the viewer, advance a story, unmount, and assert no timer callback fires afterward. Verify picker/editor state resets when the rail loses its owner/session.

- [ ] **Step 2: Centralize the auto-advance timer cleanup**

The effect must always return `clearTimeout(timer)` and depend only on the current story ID, pause state, and stable `goNext` callback:

```ts
useEffect(() => {
  if (loading || paused || !story?.id) return;
  const timer = setTimeout(goNext, 6_000);
  return () => clearTimeout(timer);
}, [loading, paused, story?.id, goNext]);
```

- [ ] **Step 3: Test and commit**

Run: `npm test -- --runInBand src/stories src/app/story`  
Expected: PASS.

```bash
git add src/app/story/[userId].tsx src/stories
git commit -m "perf: clean up My Day timers and media state"
```

### Task 5: Keep development tooling out of release builds where safe

**Files:**
- Modify: `eas.json`
- Modify: `package.json` only if dependency analysis proves a package is development-only
- Test: Android release export/build

- [ ] **Step 1: Inspect build profiles and native imports**

Run: `Get-Content eas.json`  
Expected: current EAS profiles are displayed.

Run: `rg -n "expo-dev-client|vision-camera|react-native-skia|worklets" src app.json package.json`  
Expected: runtime beauty-camera imports are distinguished from the development-client dependency.

- [ ] **Step 2: Ensure the staging performance build is release-like**

Configure the internal staging profile with `developmentClient: false` while retaining internal distribution:

```json
"staging": {
  "distribution": "internal",
  "developmentClient": false,
  "channel": "staging"
}
```

The current beauty camera imports vision-camera, Skia, and worklets at runtime, so keep those packages. Move only `expo-dev-client` out of the staging/production runtime path by setting `developmentClient: false`; do not delete the dependency because the separate development profile still uses it.

- [ ] **Step 3: Export and test dependency integrity**

Run: `npx expo export --platform android --output-dir dist-performance`  
Expected: export succeeds with no missing native/module imports.

- [ ] **Step 4: Commit**

```bash
git add eas.json package.json package-lock.json
git commit -m "build: make staging performance release-like"
```

### Task 6: Android device verification and evidence

**Files:**
- Create: `docs/release-evidence/2026-08-10-fitness-feed-android-performance.md`

- [ ] **Step 1: Build and install staging on the connected phone**

Run the approved EAS staging build, download the resulting APK, and install it with:

```powershell
& 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe' -s FY24068108E6 install -r .\AccountAbility-Staging.apk
```

Expected: `Success`.

- [ ] **Step 2: Exercise the exact risk flows**

Test cold launch, Feed scroll through at least 20 mixed image/video posts, pause on videos, switch Feed/Discover, open/advance/close My Day, background/foreground, Journey, Run completion share choices, Messages, and repeat navigation ten times.

- [ ] **Step 3: Capture objective Android evidence**

Record launch timing, memory, frame stats, and crash history with `am start -W`, `dumpsys meminfo`, `dumpsys gfxinfo`, and `dumpsys activity exit-info`. Compare with the baseline: 529 ms cold launch, about 233 MB PSS, about 13.33% legacy janky frames, and 29/30 high-input-latency frames.

- [ ] **Step 4: Write the evidence report**

Record device/build IDs, exact commands, before/after metrics, observed crashes, and pass/fail for every flow. Do not claim the crash fixed without either a clean repeated run or a captured stack trace tied to a fix.

- [ ] **Step 5: Commit evidence**

```bash
git add docs/release-evidence/2026-08-10-fitness-feed-android-performance.md
git commit -m "docs: record Android Feed performance verification"
```
