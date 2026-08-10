import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';
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
  const controller = createAchievementShareController({
    onFeed: () => latestCallbacks.onFeed(),
    onStory: () => latestCallbacks.onStory(),
    onPrivate: () => latestCallbacks.onPrivate(),
    onClose: () => latestCallbacks.onClose(),
  });

  return {
    controller,
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
};

export function AchievementSharePrompt({
  visible,
  payloadKey,
  resetKey,
  onFeed,
  onStory,
  onPrivate,
  onClose,
}: Props) {
  const lifecycleRef = useRef<ReturnType<typeof createAchievementSharePromptLifecycle> | null>(null);
  if (lifecycleRef.current === null) {
    lifecycleRef.current = createAchievementSharePromptLifecycle({ onFeed, onStory, onPrivate, onClose });
  }
  const lifecycle = lifecycleRef.current;
  lifecycle.updateCallbacks({ onFeed, onStory, onPrivate, onClose });
  const controller = lifecycle.controller;
  const [state, setState] = useState(controller.getState);

  useEffect(() => controller.subscribe(setState), [controller]);
  useEffect(() => {
    lifecycle.syncPresentation({ visible, payloadKey, resetKey });
  }, [lifecycle, visible, payloadKey, resetKey]);
  useEffect(() => () => lifecycle.dispose(), [lifecycle]);

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

          <DestinationButton
            label="Share to Feed"
            selected={selected === 'feed'}
            disabled={state.working}
            onPress={() => controller.select('feed')}
          />
          <DestinationButton
            label="Add to My Day"
            selected={selected === 'story'}
            disabled={state.working}
            onPress={() => controller.select('story')}
          />
          <Button
            title="Keep private"
            variant="ghost"
            disabled={state.working}
            loading={state.working && selected === 'private'}
            onPress={() => void controller.keepPrivate()}
          />

          {state.error ? (
            <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>
              {state.error}
            </Text>
          ) : null}

          <Button
            title="Confirm"
            loading={state.working && selected !== 'private'}
            disabled={state.working || (selected !== 'feed' && selected !== 'story')}
            onPress={() => void controller.confirm()}
            accessibilityLabel={selected ? `Confirm ${selected} share` : 'Confirm share'}
          />
          <Button
            title="Cancel"
            variant="outline"
            disabled={state.working}
            onPress={controller.cancel}
          />
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { fontFamily: font.extrabold, fontSize: 20, color: colors.text, textAlign: 'center' },
  message: {
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  destination: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  destinationText: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  destinationTextSelected: { color: colors.primary },
  error: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.danger, textAlign: 'center' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
