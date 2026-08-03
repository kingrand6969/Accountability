import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';

import { font } from '../../ui/theme';
import { runMediaCache } from '../saveRunMedia';
import type { BeautyCaptureSource } from './cameraMode';
import { renderBeautyImage } from './renderBeautyImage.native';
import {
  COLOR_LOOK_PRESETS,
  DEFAULT_BEAUTY,
  effectiveBeautySettings,
  normalizeBeautySettings,
  type BeautySettings,
  type ColorLook,
} from './types';

const LIME = '#c6f24e';
const SAFE_RENDER_ERROR =
  'Beauty processing could not finish. Try again or retake the photo.';

type BeautyNumericControl = Exclude<
  keyof BeautySettings,
  'enabled' | 'colorLook'
>;

export const BEAUTY_EDITOR_COPY = Object.freeze({
  privacy: 'No face reshaping · Original untouched',
});

export const BEAUTY_CONTROL_METADATA = Object.freeze([
  { key: 'overall', label: 'Overall Beauty', minimum: 0, maximum: 100 },
  { key: 'smooth', label: 'Smooth', minimum: 0, maximum: 60 },
  { key: 'blemish', label: 'Blemishes', minimum: 0, maximum: 60 },
  { key: 'shine', label: 'Shine', minimum: 0, maximum: 50 },
  { key: 'underEye', label: 'Under-eyes', minimum: 0, maximum: 40 },
  { key: 'lighting', label: 'Lighting', minimum: 0, maximum: 40 },
  {
    key: 'colorStrength',
    label: 'Color strength',
    minimum: 0,
    maximum: 100,
  },
] as const satisfies readonly Readonly<{
  key: BeautyNumericControl;
  label: string;
  minimum: number;
  maximum: number;
}>[]);

export type BeautyEditorRenderResult = Readonly<{
  cacheItemId: string | null;
  uri: string;
}>;

type EditorRelease = (
  id: string,
  owner: 'editor',
) => Promise<void>;

function createEditorReleaseTracker(release: EditorRelease) {
  const heldIds = new Set<string>();
  const releasedIds = new Set<string>();
  const inFlight = new Map<string, Promise<boolean>>();

  function track(id: string | null): void {
    if (id && !releasedIds.has(id)) heldIds.add(id);
  }

  function transfer(id: string | null): void {
    if (id) heldIds.delete(id);
  }

  function releaseOnce(id: string | null): Promise<boolean> {
    if (!id || releasedIds.has(id)) return Promise.resolve(true);
    track(id);
    const existing = inFlight.get(id);
    if (existing) return existing;
    const pending = release(id, 'editor')
      .then(() => {
        releasedIds.add(id);
        heldIds.delete(id);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        if (inFlight.get(id) === pending) inFlight.delete(id);
      });
    inFlight.set(id, pending);
    return pending;
  }

  async function releaseHeld(maxAttempts = 2): Promise<void> {
    const attempts = Math.max(1, Math.min(2, Math.round(maxAttempts)));
    for (let attempt = 0; attempt < attempts && heldIds.size > 0; attempt += 1) {
      await Promise.all([...heldIds].map((id) => releaseOnce(id)));
    }
  }

  return { track, transfer, releaseOnce, releaseHeld };
}

export function createBeautyCaptureLeaseSlot(release: EditorRelease) {
  const releases = createEditorReleaseTracker(release);
  let currentSource: BeautyCaptureSource | null = null;
  let releaseAllPromise: Promise<void> | null = null;

  async function accept(source: BeautyCaptureSource): Promise<void> {
    const previous = currentSource;
    currentSource = source;
    releases.track(source.cacheItemId);
    if (
      previous?.cacheItemId &&
      previous.cacheItemId !== source.cacheItemId
    ) {
      await releases.releaseOnce(previous.cacheItemId);
    }
  }

  function transferToEditor(source: BeautyCaptureSource): boolean {
    if (
      releaseAllPromise ||
      !currentSource ||
      currentSource.cacheItemId !== source.cacheItemId ||
      currentSource.sourceUri !== source.sourceUri
    ) {
      return false;
    }
    currentSource = null;
    releases.transfer(source.cacheItemId);
    return true;
  }

  function releaseAll(): Promise<void> {
    if (releaseAllPromise) return releaseAllPromise;
    const sourceAtRelease = currentSource;
    releases.track(sourceAtRelease?.cacheItemId ?? null);
    const pending = releases.releaseHeld().then(() => {
      if (currentSource === sourceAtRelease) currentSource = null;
    });
    const wrapped = pending.finally(() => {
      if (releaseAllPromise === wrapped) releaseAllPromise = null;
    });
    releaseAllPromise = wrapped;
    return releaseAllPromise;
  }

  return {
    accept,
    transferToEditor,
    releaseAll,
    current: () => currentSource,
  };
}

export function createBeautyPreviewScheduler(
  request: (settings: BeautySettings) => Promise<void>,
  debounceMs = 140,
) {
  const delay = Math.max(0, Math.min(500, Math.round(debounceMs)));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: BeautySettings | null = null;
  let disposed = false;

  function clearTimer(): void {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function flush(): Promise<void> {
    if (disposed || !pending) return Promise.resolve();
    clearTimer();
    const settings = pending;
    pending = null;
    return request(settings);
  }

  function schedule(settings: BeautySettings): void {
    if (disposed) return;
    pending = normalizeBeautySettings(settings);
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, delay);
  }

  function dispose(): void {
    disposed = true;
    pending = null;
    clearTimer();
  }

  return { schedule, flush, dispose };
}

export function createBeautyActionMutex() {
  let active: 'done' | 'retake' | null = null;
  return {
    run<T>(
      action: 'done' | 'retake',
      operation: () => Promise<T>,
    ): Promise<T> | null {
      if (active) return null;
      active = action;
      let pending: Promise<T>;
      try {
        pending = operation();
      } catch (error) {
        active = null;
        return Promise.reject(error);
      }
      void pending.then(
        () => {
          if (active === action) active = null;
        },
        () => {
          if (active === action) active = null;
        },
      );
      return pending;
    },
    active: () => active,
  };
}

export function beautyAccessibilityValueAfterAction(input: Readonly<{
  actionName: string;
  disabled: boolean;
  maximum: number;
  minimum: number;
  step: number;
  value: number;
}>): number | null {
  if (input.disabled) return null;
  if (input.actionName === 'increment') {
    return Math.min(input.maximum, input.value + input.step);
  }
  if (input.actionName === 'decrement') {
    return Math.max(input.minimum, input.value - input.step);
  }
  return null;
}

export function createBeautySheetExportController(dependencies: Readonly<{
  advanceGeneration: () => number;
  takeStaged: () => { id: string } | null;
  release: EditorRelease;
}>) {
  function invalidate(): number {
    const generation = dependencies.advanceGeneration();
    const stale = dependencies.takeStaged();
    if (stale) {
      void dependencies.release(stale.id, 'editor').catch(() => {});
    }
    return generation;
  }

  function acceptProcessed(result: BeautyEditorRenderResult) {
    const generation = invalidate();
    return {
      generation,
      uri: result.uri,
      exportKey: `${generation}:${result.cacheItemId ?? 'external'}:${result.uri}`,
    };
  }

  return { invalidate, acceptProcessed };
}

export function createBeautyEditorModel(
  initial: BeautySettings = { ...DEFAULT_BEAUTY },
) {
  let value = normalizeBeautySettings(initial);
  let originalHeld = false;
  let originalToggled = false;

  return {
    settings: () => value,
    setControl(key: BeautyNumericControl, nextValue: number) {
      value = normalizeBeautySettings({ ...value, [key]: nextValue });
      return value;
    },
    selectLook(colorLook: ColorLook) {
      value = normalizeBeautySettings({ ...value, colorLook });
      return value;
    },
    pressOriginal() {
      originalHeld = true;
    },
    releaseOriginal() {
      originalHeld = false;
    },
    toggleOriginal() {
      originalToggled = !originalToggled;
      return originalToggled;
    },
    showOriginal: () => originalHeld || originalToggled,
  };
}

type BeautyRenderCoordinatorDependencies = Readonly<{
  sourceCacheItemId: string | null;
  ownerToken: string;
  currentOwnerToken: () => string | null;
  render: (
    settings: BeautySettings,
    signal: AbortSignal,
  ) => Promise<BeautyEditorRenderResult>;
  release: (
    id: string,
    owner: 'editor',
  ) => Promise<void>;
  transfer?: (result: BeautyEditorRenderResult) => Promise<void> | void;
  onPreview?: (result: BeautyEditorRenderResult) => void;
  onProcessing?: (processing: boolean) => void;
  onError?: (safeMessage: string | null) => void;
  maxAttempts?: number;
}>;

type VersionWaiter = {
  promise: Promise<void>;
  resolve: () => void;
};

/**
 * Serializes expensive beauty renders. New settings abort the active attempt,
 * stale managed results are released, and only the newest owner-valid result
 * can replace the preview.
 */
export function createBeautyRenderCoordinator(
  dependencies: BeautyRenderCoordinatorDependencies,
) {
  const maxAttempts = Math.max(
    1,
    Math.min(2, Math.round(dependencies.maxAttempts ?? 2)),
  );
  const waiters = new Map<number, VersionWaiter>();
  const releases = createEditorReleaseTracker(dependencies.release);
  let desiredVersion = 0;
  let desiredSettings: BeautySettings | null = null;
  let activePromise: Promise<void> | null = null;
  let activeAbort: AbortController | null = null;
  let currentResult: BeautyEditorRenderResult | null = null;
  let currentResultVersion = 0;
  let currentTransferred = false;
  let transferPromise: Promise<void> | null = null;
  let disposePromise: Promise<void> | null = null;
  let completed = false;
  let disposed = false;
  releases.track(dependencies.sourceCacheItemId);

  function owned(): boolean {
    return dependencies.currentOwnerToken() === dependencies.ownerToken;
  }

  async function releaseSource(): Promise<void> {
    await releases.releaseOnce(dependencies.sourceCacheItemId);
  }

  function waiter(version: number): VersionWaiter {
    const existing = waiters.get(version);
    if (existing) return existing;
    let resolve!: () => void;
    const promise = new Promise<void>((resolvePromise) => {
      resolve = resolvePromise;
    });
    const created = { promise, resolve };
    waiters.set(version, created);
    return created;
  }

  function settleWaiter(version: number): void {
    const pending = waiters.get(version);
    pending?.resolve();
    waiters.delete(version);
  }

  async function pump(): Promise<void> {
    if (!disposed && owned()) dependencies.onProcessing?.(true);
    try {
      while (!disposed && desiredSettings) {
        const version = desiredVersion;
        const settings = desiredSettings;
        let rendered: BeautyEditorRenderResult | null = null;
        let failed = false;

        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          if (disposed || version !== desiredVersion || !owned()) break;
          const controller = new AbortController();
          activeAbort = controller;
          try {
            const effective = effectiveBeautySettings(settings);
            rendered = await dependencies.render(effective, controller.signal);
            failed = false;
            break;
          } catch (error) {
            const cancelled =
              controller.signal.aborted ||
              (error instanceof Error && error.name === 'AbortError');
            if (cancelled || disposed || version !== desiredVersion || !owned()) {
              break;
            }
            failed = true;
          } finally {
            if (activeAbort === controller) activeAbort = null;
          }
        }

        const stale = disposed || version !== desiredVersion || !owned();
        releases.track(rendered?.cacheItemId ?? null);
        if (rendered && stale) {
          await releases.releaseOnce(rendered.cacheItemId);
        } else if (rendered) {
          const previous = currentResult;
          currentResult = rendered;
          currentResultVersion = version;
          currentTransferred = false;
          if (!disposed && owned()) {
            dependencies.onError?.(null);
            dependencies.onPreview?.(rendered);
          }
          if (
            previous?.cacheItemId &&
            previous.cacheItemId !== rendered.cacheItemId
          ) {
            await releases.releaseOnce(previous.cacheItemId);
          }
        } else if (failed && !stale) {
          if (!disposed && owned()) {
            dependencies.onError?.(SAFE_RENDER_ERROR);
          }
        }

        settleWaiter(version);
        if (disposed || version === desiredVersion) break;
      }
    } finally {
      activeAbort = null;
      activePromise = null;
      if (!disposed && owned()) dependencies.onProcessing?.(false);
      if (!disposed && desiredSettings && waiters.has(desiredVersion)) {
        activePromise = pump();
      }
    }
  }

  function request(settings: BeautySettings): Promise<void> {
    if (disposed) return Promise.resolve();
    desiredSettings = normalizeBeautySettings(settings);
    desiredVersion += 1;
    const pending = waiter(desiredVersion);
    activeAbort?.abort();
    if (!activePromise) activePromise = pump();
    return pending.promise;
  }

  async function ensureLatest(): Promise<void> {
    const pending = waiters.get(desiredVersion);
    if (pending) await pending.promise;
  }

  async function done(): Promise<BeautyEditorRenderResult> {
    await ensureLatest();
    if (disposed || completed) {
      throw new Error('Beauty editor is closed.');
    }
    if (!owned()) throw new Error('Recording owner changed.');
    if (!currentResult || currentResultVersion !== desiredVersion) {
      throw new Error(SAFE_RENDER_ERROR);
    }
    const result = currentResult;
    const pendingTransfer = Promise.resolve(dependencies.transfer?.(result)).then(
      () => {
        currentTransferred = true;
        releases.transfer(result.cacheItemId);
      },
    );
    transferPromise = pendingTransfer;
    try {
      await pendingTransfer;
    } finally {
      if (transferPromise === pendingTransfer) transferPromise = null;
    }
    await releaseSource();
    completed = true;
    return result;
  }

  function dispose(): Promise<void> {
    if (disposePromise) return disposePromise;
    disposePromise = (async () => {
      disposed = true;
      activeAbort?.abort();
      if (activePromise) await activePromise.catch(() => {});
      if (transferPromise) await transferPromise.catch(() => {});
      if (!currentTransferred) {
        releases.track(currentResult?.cacheItemId ?? null);
      }
      await releases.releaseHeld();
      for (const pending of waiters.values()) pending.resolve();
      waiters.clear();
    })();
    return disposePromise;
  }

  return {
    request,
    ensureLatest,
    done,
    dispose,
    current: () => currentResult,
  };
}

export type BeautyEditorProps = Readonly<{
  source: BeautyCaptureSource;
  ownerToken: string;
  currentOwnerToken: () => string | null;
  onSourceLeaseAccepted?: () => boolean;
  onDone: (result: BeautyEditorRenderResult) => Promise<void> | void;
  onRetake: () => void;
  onSettingsChange?: (settings: BeautySettings) => void;
}>;

export function BeautyEditor({
  source,
  ownerToken,
  currentOwnerToken,
  onSourceLeaseAccepted,
  onDone,
  onRetake,
  onSettingsChange,
}: BeautyEditorProps) {
  const [settings, setSettings] = useState<BeautySettings>({
    ...DEFAULT_BEAUTY,
  });
  const [previewUri, setPreviewUri] = useState(source.sourceUri);
  const [processing, setProcessing] = useState(Platform.OS !== 'web');
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [originalToggled, setOriginalToggled] = useState(false);
  const [originalHeld, setOriginalHeld] = useState(false);
  const [busyAction, setBusyAction] = useState<'done' | 'retake' | null>(null);
  const coordinatorRef = useRef<ReturnType<
    typeof createBeautyRenderCoordinator
  > | null>(null);
  const previewSchedulerRef = useRef<ReturnType<
    typeof createBeautyPreviewScheduler
  > | null>(null);
  const actionMutexRef = useRef(createBeautyActionMutex());
  const mountedRef = useRef(true);
  const latestSettings = useRef(settings);
  const onDoneRef = useRef(onDone);
  const onRetakeRef = useRef(onRetake);
  const onSettingsChangeRef = useRef(onSettingsChange);
  const onSourceLeaseAcceptedRef = useRef(onSourceLeaseAccepted);
  const originalUri = source.sourceUri;
  latestSettings.current = settings;
  onDoneRef.current = onDone;
  onRetakeRef.current = onRetake;
  onSettingsChangeRef.current = onSettingsChange;
  onSourceLeaseAcceptedRef.current = onSourceLeaseAccepted;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const leaseAccepted = onSourceLeaseAcceptedRef.current?.() ?? true;
    if (!leaseAccepted) {
      setProcessing(false);
      setError(SAFE_RENDER_ERROR);
      return;
    }
    if (Platform.OS === 'web') {
      setProcessing(false);
      return;
    }
    const coordinator = createBeautyRenderCoordinator({
      sourceCacheItemId: source.cacheItemId,
      ownerToken,
      currentOwnerToken,
      render: async (effective, signal) => {
        const rendered = await renderBeautyImage({
          sourceUri: source.sourceUri,
          settings: effective,
          faceSnapshot: source.faces,
          capturedAt: source.faces?.capturedAt,
          signal,
        });
        return {
          cacheItemId: rendered.cacheItemId,
          uri: rendered.uri,
        };
      },
      release: runMediaCache.release,
      transfer: (result) => onDoneRef.current(result),
      onPreview: (result) => {
        if (mountedRef.current) setPreviewUri(result.uri);
      },
      onProcessing: (value) => {
        if (mountedRef.current) setProcessing(value);
      },
      onError: (value) => {
        if (mountedRef.current) setError(value);
      },
    });
    const scheduler = createBeautyPreviewScheduler(
      (next) => coordinator.request(next),
    );
    coordinatorRef.current = coordinator;
    previewSchedulerRef.current = scheduler;
    void coordinator.request(latestSettings.current);
    return () => {
      scheduler.dispose();
      previewSchedulerRef.current = null;
      coordinatorRef.current = null;
      void coordinator.dispose();
    };
  }, [currentOwnerToken, ownerToken, source]);

  const disabled = busyAction !== null;
  const showOriginal = originalToggled || originalHeld;
  const renderingUnavailable = Platform.OS === 'web';

  function commitSettings(next: BeautySettings): void {
    if (actionMutexRef.current.active()) return;
    const normalized = normalizeBeautySettings(next);
    setSettings(normalized);
    latestSettings.current = normalized;
    onSettingsChangeRef.current?.(normalized);
    if (!renderingUnavailable) {
      previewSchedulerRef.current?.schedule(normalized);
    }
  }

  function commitControl(
    metadata: (typeof BEAUTY_CONTROL_METADATA)[number],
    nextValue: number,
  ): void {
    const bounded = Math.min(
      metadata.maximum,
      Math.max(metadata.minimum, Math.round(nextValue)),
    );
    commitSettings({ ...latestSettings.current, [metadata.key]: bounded });
  }

  function finish(): void {
    const pending = actionMutexRef.current.run('done', async () => {
      if (!mountedRef.current) return;
      setBusyAction('done');
      setError(null);
      try {
        if (renderingUnavailable) {
          if (!mountedRef.current) return;
          await onDoneRef.current({
            cacheItemId: null,
            uri: source.sourceUri,
          });
        } else {
          const scheduler = previewSchedulerRef.current;
          const coordinator = coordinatorRef.current;
          if (!scheduler || !coordinator) throw new Error(SAFE_RENDER_ERROR);
          await scheduler.flush();
          await coordinator.done();
        }
        if (mountedRef.current) setBusyAction(null);
      } catch {
        if (mountedRef.current) {
          setError(SAFE_RENDER_ERROR);
          setBusyAction(null);
        }
      }
    });
    if (pending) void pending;
  }

  function retake(): void {
    const pending = actionMutexRef.current.run('retake', async () => {
      if (!mountedRef.current) return;
      setBusyAction('retake');
      previewSchedulerRef.current?.dispose();
      await coordinatorRef.current?.dispose();
      if (mountedRef.current) onRetakeRef.current();
    });
    if (pending) void pending;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={retake}
          style={styles.headerAction}
        >
          <Text style={styles.headerActionText}>Retake</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Beauty
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            busy: busyAction === 'done' || processing,
            disabled,
          }}
          disabled={disabled}
          onPress={finish}
          style={[styles.done, disabled && styles.dim]}
        >
          {busyAction === 'done' ? (
            <ActivityIndicator color="#101319" />
          ) : (
            <Text style={styles.doneText}>Done</Text>
          )}
        </Pressable>
      </View>

      <Pressable
        accessibilityHint="Press and hold to compare with the untouched original"
        accessibilityLabel="Beauty photo preview"
        accessibilityRole="button"
        onPressIn={() => setOriginalHeld(true)}
        onPressOut={() => setOriginalHeld(false)}
        style={styles.preview}
      >
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: showOriginal ? originalUri : previewUri }}
          resizeMode="contain"
          style={StyleSheet.absoluteFill}
        />
        {processing ? (
          <View
            accessibilityLiveRegion="polite"
            style={styles.processingOverlay}
          >
            <ActivityIndicator color={LIME} />
            <Text style={styles.processingText}>Processing beauty…</Text>
          </View>
        ) : null}
        {showOriginal ? (
          <View style={styles.originalBadge}>
            <Text style={styles.originalBadgeText}>Original</Text>
          </View>
        ) : null}
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.controls}
        showsVerticalScrollIndicator={false}
      >
        {renderingUnavailable ? (
          <Text accessibilityLiveRegion="polite" style={styles.webNotice}>
            Beauty effects are unavailable on web. Your chosen photo will stay
            unfiltered.
          </Text>
        ) : null}

        <View style={styles.compareRow}>
          <Text style={styles.sectionLabel}>Compare</Text>
          <Pressable
            accessibilityLabel="Show Original"
            accessibilityRole="switch"
            accessibilityState={{ checked: originalToggled }}
            onPress={() => setOriginalToggled((shown) => !shown)}
            style={[
              styles.originalToggle,
              originalToggled && styles.originalToggleActive,
            ]}
          >
            <Text
              style={[
                styles.originalToggleText,
                originalToggled && styles.originalToggleTextActive,
              ]}
            >
              Original
            </Text>
          </Pressable>
        </View>

        <PercentControl
          disabled={disabled || renderingUnavailable}
          metadata={BEAUTY_CONTROL_METADATA[0]}
          onCommit={commitControl}
          value={settings.overall}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: advanced }}
          onPress={() => setAdvanced((shown) => !shown)}
          style={styles.advancedToggle}
        >
          <Text style={styles.sectionLabel}>Advanced</Text>
          <Text style={styles.advancedAction}>
            {advanced ? 'Hide' : 'Show'}
          </Text>
        </Pressable>

        {advanced
          ? BEAUTY_CONTROL_METADATA.slice(1, 6).map((metadata) => (
              <PercentControl
                disabled={disabled || renderingUnavailable}
                key={metadata.key}
                metadata={metadata}
                onCommit={commitControl}
                value={settings[metadata.key]}
              />
            ))
          : null}

        <Text style={styles.sectionLabel}>Looks</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.looks}
        >
          {COLOR_LOOK_PRESETS.map((preset) => {
            const selected = settings.colorLook === preset.value;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{
                  selected,
                  disabled: disabled || renderingUnavailable,
                }}
                disabled={disabled || renderingUnavailable}
                key={preset.value}
                onPress={() =>
                  commitSettings({
                    ...latestSettings.current,
                    colorLook: preset.value,
                  })
                }
                style={[styles.look, selected && styles.lookActive]}
              >
                <Text
                  style={[styles.lookText, selected && styles.lookTextActive]}
                >
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <PercentControl
          disabled={disabled || renderingUnavailable}
          metadata={BEAUTY_CONTROL_METADATA[6]}
          onCommit={commitControl}
          value={settings.colorStrength}
        />

        {error ? (
          <Text accessibilityLiveRegion="assertive" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Text style={styles.privacy}>{BEAUTY_EDITOR_COPY.privacy}</Text>
      </ScrollView>
    </View>
  );
}

function PercentControl({
  disabled,
  metadata,
  onCommit,
  value,
}: {
  disabled: boolean;
  metadata: (typeof BEAUTY_CONTROL_METADATA)[number];
  onCommit: (
    metadata: (typeof BEAUTY_CONTROL_METADATA)[number],
    nextValue: number,
  ) => void;
  value: number;
}) {
  const step = 5;
  const updateFromAccessibility = (event: AccessibilityActionEvent) => {
    const nextValue = beautyAccessibilityValueAfterAction({
      actionName: event.nativeEvent.actionName,
      disabled,
      maximum: metadata.maximum,
      minimum: metadata.minimum,
      step,
      value,
    });
    if (nextValue !== null) onCommit(metadata, nextValue);
  };
  return (
    <View style={styles.controlRow}>
      <Text style={styles.controlLabel}>{metadata.label}</Text>
      <View
        accessibilityActions={
          disabled
            ? undefined
            : [
                { name: 'increment', label: `Increase ${metadata.label}` },
                { name: 'decrement', label: `Decrease ${metadata.label}` },
              ]
        }
        accessibilityLabel={metadata.label}
        accessibilityRole="adjustable"
        accessibilityState={{ disabled }}
        accessibilityValue={{
          min: metadata.minimum,
          max: metadata.maximum,
          now: value,
          text: `${value}%`,
        }}
        onAccessibilityAction={
          disabled ? undefined : updateFromAccessibility
        }
        style={styles.adjuster}
      >
        <Pressable
          accessibilityLabel={`Decrease ${metadata.label}`}
          accessibilityRole="button"
          accessibilityState={{
            disabled: disabled || value <= metadata.minimum,
          }}
          disabled={disabled || value <= metadata.minimum}
          onPress={() => onCommit(metadata, value - step)}
          style={styles.stepButton}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text style={styles.percent}>{value}%</Text>
        <Pressable
          accessibilityLabel={`Increase ${metadata.label}`}
          accessibilityRole="button"
          accessibilityState={{
            disabled: disabled || value >= metadata.maximum,
          }}
          disabled={disabled || value >= metadata.maximum}
          onPress={() => onCommit(metadata, value + step)}
          style={styles.stepButton}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default BeautyEditor;

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0b0e14',
    paddingTop: 42,
    zIndex: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  headerAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 70,
  },
  headerActionText: { color: '#e2e8f0', fontFamily: font.bold, fontSize: 14 },
  title: { color: '#fff', fontFamily: font.extrabold, fontSize: 18 },
  done: {
    alignItems: 'center',
    backgroundColor: LIME,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 70,
    paddingHorizontal: 15,
  },
  doneText: { color: '#101319', fontFamily: font.extrabold, fontSize: 14 },
  preview: {
    alignSelf: 'center',
    backgroundColor: '#151a24',
    borderRadius: 20,
    height: '40%',
    maxWidth: 500,
    minHeight: 220,
    overflow: 'hidden',
    width: '92%',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: 'rgba(11,14,20,0.66)',
    gap: 8,
    justifyContent: 'center',
  },
  processingText: { color: '#fff', fontFamily: font.bold, fontSize: 13 },
  originalBadge: {
    backgroundColor: 'rgba(11,14,20,0.82)',
    borderRadius: 999,
    left: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
    position: 'absolute',
    top: 12,
  },
  originalBadgeText: { color: '#fff', fontFamily: font.bold, fontSize: 12 },
  controls: { gap: 10, padding: 16, paddingBottom: 36 },
  webNotice: {
    color: '#fbbf24',
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  compareRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  sectionLabel: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
  originalToggle: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 100,
    paddingHorizontal: 15,
  },
  originalToggleActive: { backgroundColor: LIME, borderColor: LIME },
  originalToggleText: { color: '#e2e8f0', fontFamily: font.bold, fontSize: 13 },
  originalToggleTextActive: { color: '#101319' },
  controlRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  controlLabel: {
    color: '#cbd5e1',
    flexShrink: 1,
    fontFamily: font.semibold,
    fontSize: 13,
  },
  adjuster: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  stepButton: {
    alignItems: 'center',
    backgroundColor: '#1e2430',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  stepText: { color: '#fff', fontFamily: font.bold, fontSize: 23 },
  percent: {
    color: '#fff',
    fontFamily: font.bold,
    fontSize: 13,
    minWidth: 48,
    textAlign: 'center',
  },
  advancedToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  advancedAction: { color: LIME, fontFamily: font.bold, fontSize: 13 },
  looks: { gap: 8 },
  look: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 15,
  },
  lookActive: { backgroundColor: LIME, borderColor: LIME },
  lookText: { color: '#cbd5e1', fontFamily: font.bold, fontSize: 12 },
  lookTextActive: { color: '#101319' },
  error: {
    color: '#fca5a5',
    fontFamily: font.semibold,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  privacy: {
    color: '#94a3b8',
    fontFamily: font.medium,
    fontSize: 12,
    textAlign: 'center',
  },
  dim: { opacity: 0.58 },
});
