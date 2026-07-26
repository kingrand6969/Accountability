import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font } from '../ui/theme';
import type { RunMediaDestination } from './saveRunMedia';

const LIME = '#c6f24e';

type DestinationState = {
  status: 'idle' | 'working' | 'success' | 'error';
  error: string | null;
};

export type RunMediaActionsProps = {
  onDestination(destination: RunMediaDestination): Promise<void>;
  disabled?: boolean;
  activityQueued?: boolean;
  feedDisabledReason?: string;
};

const actions: readonly {
  destination: RunMediaDestination;
  label: string;
  progressLabel: string;
  successLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
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
  {
    destination: 'feed',
    label: 'Post to Feed',
    progressLabel: 'Posting to Feed…',
    successLabel: 'Posted to Feed',
    icon: 'newspaper-outline',
  },
];

const initialState = (): Record<RunMediaDestination, DestinationState> => ({
  memories: { status: 'idle', error: null },
  phone: { status: 'idle', error: null },
  share: { status: 'idle', error: null },
  feed: { status: 'idle', error: null },
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
  disabled = false,
  activityQueued = false,
  feedDisabledReason,
}: RunMediaActionsProps) {
  const [states, setStates] = useState(initialState);
  const working = actions.some(({ destination }) => states[destination].status === 'working');
  const feedReason = feedDisabledReasonFor(activityQueued, feedDisabledReason);

  async function run(destination: RunMediaDestination) {
    if (disabled || working || (destination === 'feed' && feedReason)) return;
    setStates((current) => ({
      ...current,
      [destination]: { status: 'working', error: null },
    }));
    try {
      await onDestination(destination);
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
      <View style={styles.grid}>
        {actions.map((action) => {
          const state = states[action.destination];
          const feedDisabled = action.destination === 'feed' && feedReason !== null;
          const actionDisabled = disabled || working || feedDisabled;
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
                  action.destination === 'feed' && styles.feedAction,
                  state.status === 'success' && styles.successAction,
                  actionDisabled && styles.disabled,
                  pressed && !actionDisabled && styles.pressed,
                ]}
                onPress={() => run(action.destination)}
                disabled={actionDisabled}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                accessibilityHint={feedDisabled ? feedReason : undefined}
                accessibilityState={{
                  disabled: actionDisabled,
                  busy: state.status === 'working',
                }}
              >
                {state.status === 'working' ? (
                  <ActivityIndicator size="small" color={action.destination === 'feed' ? '#101319' : '#fff'} />
                ) : (
                  <Ionicons
                    name={state.status === 'success' ? 'checkmark-circle' : action.icon}
                    size={18}
                    color={action.destination === 'feed' ? '#101319' : state.status === 'success' ? LIME : '#fff'}
                  />
                )}
                <Text
                  style={[
                    styles.actionText,
                    action.destination === 'feed' && styles.feedActionText,
                    state.status === 'success' && action.destination !== 'feed' && styles.successText,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
              {state.error ? (
                <Text style={styles.error} accessibilityRole="alert">
                  {state.error}
                </Text>
              ) : feedDisabled ? (
                <Text style={styles.disabledReason}>{feedReason}</Text>
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
  },
  cell: {
    width: '48%',
    flexGrow: 1,
  },
  action: {
    minHeight: 44,
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
    backgroundColor: LIME,
    borderColor: LIME,
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
    color: '#101319',
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
