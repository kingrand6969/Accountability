import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { font } from '../ui/theme';
import type { RunMediaDestination } from './saveRunMedia';

const LIME = '#c6f24e';

type DestinationState = {
  status: 'idle' | 'working' | 'success' | 'error';
  error: string | null;
};

export type RunMediaActionsProps = {
  onDestination(destination: RunMediaDestination): Promise<void>;
  onContinueToFeed(): void;
  onMyDay(): Promise<void>;
  disabled?: boolean;
  activityQueued?: boolean;
  feedDisabledReason?: string;
};

type UtilityDestination = Exclude<RunMediaDestination, 'feed'> | 'story';

const actions: readonly {
  destination: UtilityDestination;
  label: string;
  progressLabel: string;
  successLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    destination: 'story',
    label: 'Add to My Day',
    progressLabel: 'Adding to My Day…',
    successLabel: 'Added to My Day',
    icon: 'sparkles-outline',
  },
  {
    destination: 'memories',
    label: 'Save to Memories',
    progressLabel: 'Saving to Memories…',
    successLabel: 'Saved to Memories',
    icon: 'bookmark-outline',
  },
  {
    destination: 'phone',
    label: 'Save to phone',
    progressLabel: 'Saving to phone…',
    successLabel: 'Saved to phone',
    icon: 'download-outline',
  },
  {
    destination: 'share',
    label: 'Share',
    progressLabel: 'Opening Share…',
    successLabel: 'Share sheet closed',
    icon: 'share-social-outline',
  },
];

const initialState = (): Record<UtilityDestination, DestinationState> => ({
  memories: { status: 'idle', error: null },
  phone: { status: 'idle', error: null },
  share: { status: 'idle', error: null },
  story: { status: 'idle', error: null },
});

export function feedDisabledReasonFor(
  activityQueued = false,
  feedDisabledReason?: string,
): string | null {
  if (feedDisabledReason) return feedDisabledReason;
  return activityQueued ? 'Post to Feed is available after this activity syncs.' : null;
}

export function runMediaErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error ?? 'Something went wrong');
}

export function RunMediaActions({
  onDestination,
  onContinueToFeed,
  onMyDay,
  disabled = false,
  activityQueued = false,
  feedDisabledReason,
}: RunMediaActionsProps) {
  const [states, setStates] = useState(initialState);
  const working = actions.some(({ destination }) => states[destination].status === 'working');
  const feedReason = feedDisabledReasonFor(activityQueued, feedDisabledReason);

  async function run(destination: UtilityDestination) {
    if (disabled || working) return;
    setStates((current) => ({
      ...current,
      [destination]: { status: 'working', error: null },
    }));
    try {
      if (destination === 'story') await onMyDay();
      else await onDestination(destination);
      setStates((current) => ({
        ...current,
        [destination]: { status: 'success', error: null },
      }));
    } catch (error) {
      setStates((current) => ({
        ...current,
        [destination]: {
          status: 'error',
          error: runMediaErrorMessage(error),
        },
      }));
    }
  }

  return (
    <View style={styles.container} accessibilityLabel="Run image destinations">
      <Pressable
        style={({ pressed }) => [
          styles.feedAction,
          (disabled || working || !!feedReason) && styles.disabled,
          pressed && !disabled && !working && !feedReason && styles.pressed,
        ]}
        onPress={onContinueToFeed}
        disabled={disabled || working || !!feedReason}
        accessibilityRole="button"
        accessibilityLabel="Continue to Feed"
        accessibilityHint={feedReason ?? 'Review your caption and who can see the Run post'}
        accessibilityState={{ disabled: disabled || working || !!feedReason }}
      >
        <Text style={styles.feedActionText}>Continue to Feed</Text>
        <Ionicons name="arrow-forward" size={19} color="#FFFFFF" />
      </Pressable>
      {feedReason ? <Text style={styles.disabledReason}>{feedReason}</Text> : null}
      <View style={styles.grid}>
        {actions.map((action) => {
          const state = states[action.destination];
          const actionDisabled = disabled || working;
          const label =
            state.status === 'working'
              ? action.progressLabel
              : state.status === 'success'
                ? action.successLabel
                : action.label;

          return (
            <View key={action.destination} style={styles.cell}>
              <Pressable
                style={({ pressed }) => [
                  styles.action,
                  state.status === 'success' && styles.successAction,
                  actionDisabled && styles.disabled,
                  pressed && !actionDisabled && styles.pressed,
                ]}
                onPress={() => run(action.destination)}
                disabled={actionDisabled}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityState={{
                  disabled: actionDisabled,
                  busy: state.status === 'working',
                }}
              >
                {state.status === 'working' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons
                    name={state.status === 'success' ? 'checkmark-circle' : action.icon}
                    size={18}
                    color={state.status === 'success' ? LIME : '#fff'}
                  />
                )}
                <Text
                  style={[
                    styles.actionText,
                    state.status === 'success' && styles.successText,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
              {state.error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {state.error}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 560,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  cell: {
    width: '48%',
    flexGrow: 1,
  },
  action: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  feedAction: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: '#FF642F',
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    shadowColor: '#FF642F',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  successAction: {
    borderColor: 'rgba(198,242,78,0.55)',
  },
  actionText: {
    color: '#fff',
    fontFamily: font.bold,
    fontSize: 13,
    textAlign: 'center',
  },
  feedActionText: {
    color: '#FFFFFF',
    fontFamily: font.extrabold,
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  successText: {
    color: LIME,
  },
  error: {
    color: '#fca5a5',
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  disabledReason: {
    color: '#94a3b8',
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.75,
  },
});
