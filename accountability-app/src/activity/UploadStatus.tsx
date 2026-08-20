import { useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  colors as legacyColors,
  font,
  radius,
  spacing,
  type AppThemeColors,
  type AppThemeMode,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import type {
  QueuedActivity,
  UploadStatus,
} from './offlineQueueTypes';
import type { ActivitySyncStatus } from './ActivitySyncProvider';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type UploadStatusCopy = {
  title: string;
  detail: string;
  icon: IoniconName;
};

const STATUS_COPY: Record<UploadStatus, UploadStatusCopy> = {
  saved: {
    title: 'Saved on phone',
    detail: 'Uploading automatically',
    icon: 'phone-portrait-outline',
  },
  uploading: {
    title: 'Uploading',
    detail: 'Safely stored until the upload completes',
    icon: 'cloud-upload-outline',
  },
  waiting_network: {
    title: 'Waiting for internet',
    detail: 'Uploading automatically when you’re back online',
    icon: 'cloud-offline-outline',
  },
  needs_sign_in: {
    title: 'Sign in to upload',
    detail: 'This activity stays safely saved on this phone',
    icon: 'log-in-outline',
  },
  needs_attention: {
    title: 'Needs attention',
    detail: 'This activity is still safely saved on this phone',
    icon: 'alert-circle-outline',
  },
};

const STATUS_COLOR: Record<UploadStatus, string> = {
  saved: legacyColors.primary,
  uploading: legacyColors.primary,
  waiting_network: '#92400e',
  needs_sign_in: '#6d28d9',
  needs_attention: '#b91c1c',
};

export function uploadStatusCopy(status: UploadStatus): UploadStatusCopy {
  return STATUS_COPY[status];
}

export type DurableQueueConfirmation = {
  activityId: string;
  status: UploadStatus;
};

export function activityUploadBadgeStatus(
  currentActivityId: string | null,
  confirmation: DurableQueueConfirmation | null,
): UploadStatus | null {
  if (
    !currentActivityId ||
    !confirmation ||
    confirmation.activityId !== currentActivityId
  ) {
    return null;
  }
  return confirmation.status;
}

export type SafeQueuedActivitySummary = {
  type: string;
  localStart: string;
  distance: string;
  status: UploadStatusCopy;
};

export function safeQueuedActivitySummary(
  entry: QueuedActivity,
  locales?: Intl.LocalesArgument,
): SafeQueuedActivitySummary {
  const started = new Date(entry.activity.started_at);
  const localStart = Number.isFinite(started.getTime())
    ? started.toLocaleString(locales, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Time unavailable';

  return {
    type:
      entry.activity.type.charAt(0).toUpperCase() +
      entry.activity.type.slice(1),
    localStart,
    distance: `${(entry.activity.distance_m / 1000).toFixed(2)} km`,
    status: uploadStatusCopy(entry.status),
  };
}

export function retryButtonCopy(busy: boolean) {
  return busy
    ? {
        label: 'Retrying…',
        accessibilityLabel: 'Retrying activity uploads',
        disabled: true,
        busy: true,
      }
    : {
        label: 'Retry now',
        accessibilityLabel: 'Retry activity uploads now',
        disabled: false,
        busy: false,
      };
}

export const OTHER_ACCOUNT_UPLOADS_TITLE =
  'Pending uploads for another account';

export function otherAccountUploadCopy(
  count: number,
  approximate: boolean,
) {
  const safeCount = Math.max(0, Math.floor(count));
  const noun = safeCount === 1 ? 'upload' : 'uploads';
  return {
    title: OTHER_ACCOUNT_UPLOADS_TITLE,
    detail: approximate
      ? `Approximately ${safeCount} pending ${noun}`
      : `${safeCount} pending ${noun}`,
  };
}

export function uploadIssueCopy(count: number) {
  const safeCount = Math.max(0, Math.floor(count));
  return {
    title: 'Needs attention',
    detail: `${safeCount} saved ${safeCount === 1 ? 'item' : 'items'} · Offline storage`,
  };
}

export const ACTIVITY_UPLOAD_PREVIEW_LIMIT = 8;

export function activityUploadsPreview(
  queued: readonly QueuedActivity[],
): {
  items: QueuedActivity[];
  remainingCount: number;
} {
  const ordered = [...queued].sort((left, right) => {
    const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
    return byCreatedAt !== 0
      ? byCreatedAt
      : left.id.localeCompare(right.id);
  });
  return {
    items: ordered.slice(0, ACTIVITY_UPLOAD_PREVIEW_LIMIT),
    remainingCount: Math.max(
      0,
      ordered.length - ACTIVITY_UPLOAD_PREVIEW_LIMIT,
    ),
  };
}

export function remainingUploadsCopy(count: number): string {
  return `${Math.max(0, Math.floor(count))} more uploads will continue automatically`;
}

export function shouldShowUploadsPanel({
  queuedCount,
  issueCount,
  otherAccountPendingCount,
  status,
}: {
  queuedCount: number;
  issueCount: number;
  otherAccountPendingCount: number;
  status: ActivitySyncStatus;
}) {
  return (
    queuedCount > 0 ||
    issueCount > 0 ||
    otherAccountPendingCount > 0 ||
    status === 'recovering' ||
    status === 'error'
  );
}

type ActivityUploadBadgeProps = {
  status: UploadStatus;
  dark?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ActivityUploadBadge({
  status,
  dark = false,
  onPress,
  style,
}: ActivityUploadBadgeProps) {
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
  const copy = uploadStatusCopy(status);
  const statusColor = themedStatusColor(status, theme, mode);
  const iconColor = dark ? '#e2f78e' : statusColor;
  const content = (
    <>
      <Ionicons name={copy.icon} size={17} color={iconColor} />
      <Text
        style={[
          styles.badgeText,
          dark ? styles.badgeTextDark : { color: statusColor },
        ]}
      >
        {copy.title}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${copy.title}. ${copy.detail}.`}
        onPress={onPress}
        hitSlop={2}
        style={({ pressed }) => [
          styles.badge,
          styles.badgeAction,
          dark ? styles.badgeDark : styles.badgeLight,
          style,
          pressed && styles.pressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessible
      role="status"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${copy.title}. ${copy.detail}.`}
      style={[
        styles.badge,
        dark ? styles.badgeDark : styles.badgeLight,
        style,
      ]}
    >
      {content}
    </View>
  );
}

type ActivityUploadsPanelProps = {
  queued: QueuedActivity[];
  issueCount: number;
  otherAccountPendingCount: number;
  otherAccountPendingIsApproximate: boolean;
  status: ActivitySyncStatus;
  onRetryNow: () => Promise<void>;
};

export function ActivityUploadsPanel({
  queued,
  issueCount,
  otherAccountPendingCount,
  otherAccountPendingIsApproximate,
  status,
  onRetryNow,
}: ActivityUploadsPanelProps) {
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
  const palette = useMemo(() => createPalette(theme, mode), [theme, mode]);
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false);
  const retryCopy = retryButtonCopy(retrying);
  const preview = activityUploadsPreview(queued);
  const hasCurrentOwnerUploads = queued.length > 0;
  const hasAggregateItems =
    issueCount > 0 || otherAccountPendingCount > 0;
  const visible = shouldShowUploadsPanel({
    queuedCount: queued.length,
    issueCount,
    otherAccountPendingCount,
    status,
  });

  if (!visible) return null;

  const retry = async () => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    setRetrying(true);
    try {
      await onRetryNow();
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  };

  const canRetry = status === 'error' || hasCurrentOwnerUploads;

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeadingCopy}>
          <Text style={styles.panelKicker}>UPLOADS</Text>
          <Text style={styles.panelTitle}>Saved activities</Text>
        </View>
        {status === 'syncing' ? (
          <ActivityUploadBadge status="uploading" />
        ) : null}
      </View>

      {status === 'recovering' ? (
        <View
          accessible
          role="status"
          accessibilityLiveRegion="polite"
          accessibilityLabel="Checking saved activities"
          style={styles.notice}
        >
          <Ionicons
            name="hourglass-outline"
            size={19}
            color={palette.action}
          />
          <Text style={styles.noticeText}>Checking saved activities…</Text>
        </View>
      ) : null}

      {status === 'error' ? (
        <View
          accessible
          accessibilityRole="alert"
          style={[styles.notice, styles.errorNotice]}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={19}
            color={palette.danger}
          />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>
              Uploads couldn’t be checked
            </Text>
            <Text style={styles.noticeDetail}>
              Saved activities remain on this phone. Retry when ready.
            </Text>
          </View>
        </View>
      ) : null}

      {status !== 'recovering' && queued.length === 0 && hasAggregateItems ? (
        <Text style={styles.emptyText}>
          No pending uploads for this account.
        </Text>
      ) : null}

      {preview.items.map((entry) => {
        const summary = safeQueuedActivitySummary(entry);
        return (
          <View key={entry.id} style={styles.uploadRow}>
            <View style={styles.uploadRowTop}>
              <Text style={styles.activityType}>{summary.type}</Text>
              <ActivityUploadBadge status={entry.status} />
            </View>
            <Text style={styles.activityMeta}>
              {summary.localStart} · {summary.distance}
            </Text>
            <Text style={styles.activityDetail}>
              {summary.status.detail}
            </Text>
          </View>
        );
      })}

      {preview.remainingCount > 0 ? (
        <View
          accessible
          role="status"
          accessibilityLiveRegion="polite"
          accessibilityLabel={remainingUploadsCopy(
            preview.remainingCount,
          )}
          style={styles.remainingNotice}
        >
          <Ionicons
            name="ellipsis-horizontal-circle-outline"
            size={19}
            color={palette.action}
          />
          <Text style={styles.remainingText}>
            {remainingUploadsCopy(preview.remainingCount)}
          </Text>
        </View>
      ) : null}

      {otherAccountPendingCount > 0 ? (
        <AggregateNotice
          icon="people-outline"
          {...otherAccountUploadCopy(
            otherAccountPendingCount,
            otherAccountPendingIsApproximate,
          )}
        />
      ) : null}

      {issueCount > 0 ? (
        <AggregateNotice
          icon="alert-circle-outline"
          {...uploadIssueCopy(issueCount)}
        />
      ) : null}

      {canRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={retryCopy.accessibilityLabel}
          accessibilityState={{
            busy: retryCopy.busy,
            disabled: retryCopy.disabled,
          }}
          disabled={retryCopy.disabled}
          onPress={() => void retry()}
          hitSlop={2}
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.pressed,
            retryCopy.disabled && styles.disabled,
          ]}
        >
          <Ionicons
            name={retrying ? 'sync-outline' : 'refresh-outline'}
            size={18}
            color={palette.onAction}
          />
          <Text style={styles.retryButtonText}>{retryCopy.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AggregateNotice({
  icon,
  title,
  detail,
}: {
  icon: IoniconName;
  title: string;
  detail: string;
}) {
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
  const palette = useMemo(() => createPalette(theme, mode), [theme, mode]);
  return (
    <View style={styles.aggregateNotice}>
      <Ionicons name={icon} size={19} color={palette.inkSecondary} />
      <View style={styles.noticeCopy}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function themedStatusColor(
  status: UploadStatus,
  theme: AppThemeColors,
  mode: AppThemeMode,
): string {
  if (mode === 'light') return STATUS_COLOR[status];
  if (status === 'waiting_network') return theme.status.attention;
  if (status === 'needs_attention') return theme.status.danger;
  return theme.ink.action;
}

function createPalette(theme: AppThemeColors, mode: AppThemeMode) {
  return {
    ink: mode === 'light' ? legacyColors.ink : theme.ink.primary,
    inkSoft: mode === 'light' ? legacyColors.inkSoft : theme.ink.secondary,
    inkPrimary: mode === 'light' ? legacyColors.text : theme.ink.primary,
    inkSecondary: mode === 'light' ? legacyColors.textSecondary : theme.ink.secondary,
    inkMuted: mode === 'light' ? legacyColors.textMuted : theme.ink.muted,
    action: mode === 'light' ? legacyColors.primary : theme.ink.action,
    onAction: mode === 'light' ? legacyColors.onPrimary : theme.ink.inverse,
    actionSoft: mode === 'light' ? legacyColors.primarySoft : theme.surface.raised,
    actionBorder: mode === 'light' ? '#bfdbfe' : theme.border.action,
    danger: mode === 'light' ? legacyColors.danger : theme.status.danger,
    dangerSoft: mode === 'light' ? legacyColors.dangerSoft : theme.status.dangerSoft,
    dangerBorder: mode === 'light' ? '#fecaca' : theme.border.danger,
    row: mode === 'light' ? 'rgba(255,255,255,0.62)' : theme.surface.raised,
    rowBorder: mode === 'light' ? 'rgba(255,255,255,0.7)' : theme.border.subtle,
    aggregate: mode === 'light' ? 'rgba(255,255,255,0.5)' : theme.surface.card,
    aggregateBorder: mode === 'light' ? 'rgba(30,27,75,0.12)' : theme.border.subtle,
    badge: mode === 'light' ? 'rgba(255,255,255,0.82)' : theme.surface.card,
    badgeBorder: mode === 'light' ? 'rgba(30,27,75,0.14)' : theme.border.subtle,
  };
}

function createStyles(theme: AppThemeColors, mode: AppThemeMode) {
  const palette = createPalette(theme, mode);
  return StyleSheet.create({
  badge: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  badgeAction: { minHeight: 44 },
  badgeLight: {
    backgroundColor: palette.badge,
    borderColor: palette.badgeBorder,
  },
  badgeDark: {
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderColor: 'rgba(226,247,142,0.42)',
  },
  badgeText: { fontFamily: font.bold, fontSize: 12 },
  badgeTextDark: { color: '#f8fafc' },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.6 },
  panel: { padding: spacing.lg, gap: spacing.md },
  panelHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  panelHeadingCopy: { flex: 1 },
  panelKicker: {
    color: palette.ink,
    fontFamily: font.extrabold,
    fontSize: 13,
    letterSpacing: 1.2,
  },
  panelTitle: {
    color: palette.inkSoft,
    fontFamily: font.medium,
    fontSize: 12,
    marginTop: 2,
  },
  notice: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.actionSoft,
    borderWidth: 1,
    borderColor: palette.actionBorder,
  },
  errorNotice: {
    backgroundColor: palette.dangerSoft,
    borderColor: palette.dangerBorder,
  },
  noticeCopy: { flex: 1 },
  noticeText: {
    color: palette.inkSecondary,
    fontFamily: font.semibold,
    fontSize: 13,
  },
  noticeTitle: {
    color: palette.inkPrimary,
    fontFamily: font.bold,
    fontSize: 13,
  },
  noticeDetail: {
    color: palette.inkSecondary,
    fontFamily: font.regular,
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: palette.inkMuted,
    fontFamily: font.medium,
    fontSize: 13,
  },
  uploadRow: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.row,
    borderWidth: 1,
    borderColor: palette.rowBorder,
  },
  uploadRowTop: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  activityType: {
    color: palette.ink,
    fontFamily: font.bold,
    fontSize: 15,
  },
  activityMeta: {
    color: palette.inkSecondary,
    fontFamily: font.medium,
    fontSize: 12.5,
  },
  activityDetail: {
    color: palette.inkMuted,
    fontFamily: font.regular,
    fontSize: 12,
  },
  remainingNotice: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.actionSoft,
    borderWidth: 1,
    borderColor: palette.actionBorder,
  },
  remainingText: {
    flex: 1,
    color: palette.inkSecondary,
    fontFamily: font.semibold,
    fontSize: 12.5,
  },
  aggregateNotice: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.aggregate,
    borderWidth: 1,
    borderColor: palette.aggregateBorder,
  },
  retryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.action,
  },
  retryButtonText: {
    color: palette.onAction,
    fontFamily: font.bold,
    fontSize: 14,
  },
  });
}
