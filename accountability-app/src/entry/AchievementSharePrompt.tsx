import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import {
  colors as legacyColors,
  font,
  radius,
  spacing,
  type AppThemeColors,
  type AppThemeMode,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import {
  chooseAchievementDestination,
  confirmAchievementShare,
  initialAchievementShareDecision,
  type AchievementDestination,
  type AchievementShareDecision,
} from './achievementShareDecision';

const SHARE_ERROR = 'Could not share your achievement. Please try again.';

type ShareCallbacks = {
  onFeed: () => void | Promise<void>;
  onStory: () => void | Promise<void>;
  onPrivate: () => void | Promise<void>;
  onClose: () => void;
};

export type AchievementShareControllerState = {
  decision: AchievementShareDecision;
  error: string | null;
  working: boolean;
};

export function createAchievementShareController(callbacks: ShareCallbacks) {
  let state: AchievementShareControllerState = {
    decision: initialAchievementShareDecision(),
    error: null,
    working: false,
  };
  let generation = 0;
  let closed = false;
  let disposed = false;
  const listeners = new Set<(next: AchievementShareControllerState) => void>();

  function publish(next: AchievementShareControllerState) {
    state = next;
    listeners.forEach((listener) => listener(state));
  }

  function closeOnce() {
    if (!closed && !disposed) {
      closed = true;
      callbacks.onClose();
    }
  }

  async function submit(destination: AchievementDestination) {
    if (state.working || closed || disposed) return;
    const currentGeneration = generation;
    publish({ ...state, error: null, working: true });
    try {
      if (destination === 'feed') await callbacks.onFeed();
      else if (destination === 'story') await callbacks.onStory();
      else await callbacks.onPrivate();
      if (currentGeneration === generation && !disposed) closeOnce();
    } catch {
      if (currentGeneration === generation && !disposed) {
        publish({ ...state, error: SHARE_ERROR, working: false });
      }
      return;
    }
    if (currentGeneration === generation && !disposed) publish({ ...state, working: false });
  }

  return {
    getState: () => state,
    subscribe(listener: (next: AchievementShareControllerState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    select(destination: Exclude<AchievementDestination, 'private'>) {
      if (!state.working && !closed && !disposed) {
        publish({ ...state, decision: chooseAchievementDestination(state.decision, destination), error: null });
      }
    },
    confirm() {
      if (
        closed ||
        disposed ||
        state.decision.destination === null ||
        state.decision.destination === 'private'
      ) {
        return Promise.resolve();
      }
      publish({ ...state, decision: confirmAchievementShare(state.decision) });
      return submit(state.decision.destination);
    },
    keepPrivate() {
      if (state.working || closed || disposed) return Promise.resolve();
      publish({ ...state, decision: chooseAchievementDestination(state.decision, 'private'), error: null });
      return submit('private');
    },
    cancel() {
      if (!state.working && !disposed) closeOnce();
    },
    reset() {
      generation += 1;
      closed = false;
      publish({ decision: initialAchievementShareDecision(), error: null, working: false });
    },
    dispose() {
      disposed = true;
      generation += 1;
      listeners.clear();
    },
  };
}

type PresentationIdentity = {
  visible: boolean;
  payloadKey?: string | number;
  resetKey?: string | number;
};

export function createAchievementSharePromptLifecycle(initialCallbacks: ShareCallbacks) {
  let latestCallbacks = initialCallbacks;
  let presentation: PresentationIdentity | undefined;
  let attached = false;
  let attachmentGeneration = 0;
  const controller = createAchievementShareController({
    onFeed: () => latestCallbacks.onFeed(),
    onStory: () => latestCallbacks.onStory(),
    onPrivate: () => latestCallbacks.onPrivate(),
    onClose: () => {
      if (attached) latestCallbacks.onClose();
    },
  });

  return {
    controller,
    attach() {
      attached = true;
      attachmentGeneration += 1;
    },
    detach() {
      attached = false;
      const detachedGeneration = ++attachmentGeneration;
      void Promise.resolve().then(() => {
        if (!attached && detachedGeneration === attachmentGeneration) controller.dispose();
      });
    },
    updateCallbacks(callbacks: ShareCallbacks) {
      latestCallbacks = callbacks;
    },
    syncPresentation(next: PresentationIdentity) {
      if (
        presentation === undefined ||
        presentation.visible !== next.visible ||
        presentation.payloadKey !== next.payloadKey ||
        presentation.resetKey !== next.resetKey
      ) {
        presentation = next;
        controller.reset();
      }
    },
    dispose() {
      controller.dispose();
    },
  };
}

type Props = ShareCallbacks & {
  visible: boolean;
  payloadKey?: string | number;
  resetKey?: string | number;
  feedDisabledReason?: string;
};

export function AchievementSharePrompt({
  visible,
  payloadKey,
  resetKey,
  onFeed,
  onStory,
  onPrivate,
  onClose,
  feedDisabledReason,
}: Props) {
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
  const [lifecycle] = useState(() =>
    createAchievementSharePromptLifecycle({ onFeed, onStory, onPrivate, onClose }),
  );
  const controller = lifecycle.controller;
  const [state, setState] = useState(controller.getState);

  useLayoutEffect(() => {
    lifecycle.updateCallbacks({ onFeed, onStory, onPrivate, onClose });
  }, [lifecycle, onFeed, onStory, onPrivate, onClose]);
  useEffect(() => {
    lifecycle.attach();
    const unsubscribe = controller.subscribe(setState);
    return () => {
      unsubscribe();
      lifecycle.detach();
    };
  }, [controller, lifecycle]);
  useEffect(() => {
    lifecycle.syncPresentation({ visible, payloadKey, resetKey });
  }, [lifecycle, visible, payloadKey, resetKey]);

  const selected = state.decision.destination;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={controller.cancel}
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="summary" accessibilityLabel="Share achievement">
          <Text style={styles.title}>Share your achievement?</Text>
          <Text style={styles.message}>Choose where it should appear. Nothing posts until you confirm.</Text>

          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Achievement share destination"
            style={styles.destinationGroup}
          >
            <DestinationButton
              label="Share to Feed"
              selected={selected === 'feed'}
              disabled={state.working || !!feedDisabledReason}
              onPress={() => controller.select('feed')}
            />
            {feedDisabledReason ? <Text style={styles.disabledReason}>{feedDisabledReason}</Text> : null}
            <DestinationButton
              label="Add to My Day"
              selected={selected === 'story'}
              disabled={state.working}
              onPress={() => controller.select('story')}
            />
          </View>
          {mode === 'light' ? (
            <Button
              title="Keep private"
              variant="ghost"
              disabled={state.working}
              loading={state.working && selected === 'private'}
              onPress={() => void controller.keepPrivate()}
            />
          ) : (
            <DarkPromptButton
              title="Keep private"
              variant="ghost"
              disabled={state.working}
              loading={state.working && selected === 'private'}
              onPress={() => void controller.keepPrivate()}
            />
          )}

          {state.error ? (
            <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>
              {state.error}
            </Text>
          ) : null}

          {mode === 'light' ? (
            <Button
              title="Confirm"
              loading={state.working && selected !== 'private'}
              disabled={state.working || (selected !== 'feed' && selected !== 'story')}
              onPress={() => void controller.confirm()}
              accessibilityLabel={selected ? `Confirm ${selected} share` : 'Confirm share'}
            />
          ) : (
            <DarkPromptButton
              title="Confirm"
              loading={state.working && selected !== 'private'}
              disabled={state.working || (selected !== 'feed' && selected !== 'story')}
              onPress={() => void controller.confirm()}
              accessibilityLabel={selected ? `Confirm ${selected} share` : 'Confirm share'}
            />
          )}
          {mode === 'light' ? (
            <Button
              title="Cancel"
              variant="outline"
              disabled={state.working}
              onPress={controller.cancel}
            />
          ) : (
            <DarkPromptButton
              title="Cancel"
              variant="outline"
              disabled={state.working}
              onPress={controller.cancel}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function DestinationButton({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.destination,
        selected && styles.destinationSelected,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.destinationText, selected && styles.destinationTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function DarkPromptButton({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
  const inactive = disabled || loading;
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.darkAction,
        primary
          ? styles.darkActionPrimary
          : variant === 'outline'
          ? styles.darkActionOutline
          : styles.darkActionGhost,
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? theme.ink.inverse : theme.ink.action} />
      ) : (
        <Text style={[styles.darkActionText, primary ? styles.darkActionTextPrimary : styles.darkActionTextSecondary]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

function createStyles(theme: AppThemeColors, mode: AppThemeMode) {
  const palette = {
    backdrop: mode === 'light' ? 'rgba(15,23,42,0.5)' : theme.interaction.scrim,
    card: mode === 'light' ? legacyColors.card : theme.surface.card,
    ink: mode === 'light' ? legacyColors.text : theme.ink.primary,
    muted: mode === 'light' ? legacyColors.textMuted : theme.ink.muted,
    field: mode === 'light' ? legacyColors.surface : theme.surface.raised,
    border: mode === 'light' ? legacyColors.border : theme.border.subtle,
    action: mode === 'light' ? legacyColors.primaryDark : theme.ink.action,
    actionSoft: mode === 'light' ? legacyColors.primarySoft : theme.surface.raised,
    onAction: mode === 'light' ? '#FFFFFF' : theme.ink.inverse,
    danger: mode === 'light' ? legacyColors.danger : theme.status.danger,
    disabledOpacity: mode === 'light' ? 0.5 : theme.interaction.disabledOpacity,
  };
  return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: palette.backdrop,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: radius.lg,
    backgroundColor: palette.card,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { fontFamily: font.extrabold, fontSize: 20, color: palette.ink, textAlign: 'center' },
  message: {
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 20,
    color: palette.muted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  destinationGroup: { gap: spacing.md },
  destination: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.field,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationSelected: { borderColor: palette.action, backgroundColor: palette.actionSoft },
  destinationText: { fontFamily: font.bold, fontSize: 16, color: palette.ink },
  destinationTextSelected: { color: palette.action },
  error: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: palette.danger, textAlign: 'center' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: palette.disabledOpacity },
  disabledReason: { fontFamily: font.regular, fontSize: 12, color: palette.muted, textAlign: 'center' },
  darkAction: {
    minHeight: spacing.touch,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  darkActionPrimary: { backgroundColor: palette.action, borderColor: palette.action },
  darkActionGhost: { backgroundColor: theme.surface.muted, borderColor: theme.surface.muted },
  darkActionOutline: { backgroundColor: theme.surface.card, borderColor: palette.action },
  darkActionText: { fontFamily: font.bold, fontSize: 16 },
  darkActionTextPrimary: { color: palette.onAction },
  darkActionTextSecondary: { color: palette.action },
  });
}
