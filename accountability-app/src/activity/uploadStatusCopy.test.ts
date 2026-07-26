import { describe, expect, it, test } from '@jest/globals';
import type { QueuedActivity, UploadStatus } from './offlineQueueTypes';
import {
  OTHER_ACCOUNT_UPLOADS_TITLE,
  otherAccountUploadCopy,
  retryButtonCopy,
  safeQueuedActivitySummary,
  shouldShowUploadsPanel,
  uploadIssueCopy,
  uploadStatusCopy,
} from './UploadStatus';

describe('uploadStatusCopy', () => {
  const expected: Record<
    UploadStatus,
    { title: string; detail: string; icon: string }
  > = {
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

  test.each(Object.entries(expected) as [UploadStatus, (typeof expected)[UploadStatus]][])(
    'returns safe copy and an icon for %s',
    (status, copy) => {
      expect(uploadStatusCopy(status)).toEqual(copy);
    },
  );
});

describe('privacy-safe upload formatting', () => {
  const queued: QueuedActivity = {
    schema: 1,
    id: '11111111-1111-4111-8111-111111111111',
    ownerId: '22222222-2222-4222-8222-222222222222',
    activity: {
      type: 'run',
      distance_m: 3210,
      duration_s: 1200,
      started_at: '2026-07-25T01:30:00.000Z',
      route: [
        { lat: -31.9523, lon: 115.8613 },
        { lat: -31.953, lon: 115.862 },
      ],
    },
    createdAt: '2026-07-25T01:50:00.000Z',
    status: 'waiting_network',
    attemptCount: 2,
    nextAttemptAt: 0,
    lastError: {
      category: 'network',
      message: 'private host and raw upload failure',
    },
  };

  it('returns only activity type, local start time, distance, and safe status', () => {
    const summary = safeQueuedActivitySummary(queued, 'en-AU');

    expect(summary).toEqual({
      type: 'Run',
      localStart: expect.any(String),
      distance: '3.21 km',
      status: uploadStatusCopy('waiting_network'),
    });
    expect(Object.keys(summary).sort()).toEqual([
      'distance',
      'localStart',
      'status',
      'type',
    ]);
    expect(JSON.stringify(summary)).not.toContain('115.8613');
    expect(JSON.stringify(summary)).not.toContain(queued.ownerId);
    expect(JSON.stringify(summary)).not.toContain('private host');
  });
});

describe('retry and aggregate copy', () => {
  it('shows the panel for owner uploads, privacy-safe aggregates, loading, or fail-closed errors', () => {
    expect(
      shouldShowUploadsPanel({
        queuedCount: 0,
        issueCount: 0,
        otherAccountPendingCount: 0,
        status: 'idle',
      }),
    ).toBe(false);
    for (const state of [
      {
        queuedCount: 1,
        issueCount: 0,
        otherAccountPendingCount: 0,
        status: 'idle' as const,
      },
      {
        queuedCount: 0,
        issueCount: 1,
        otherAccountPendingCount: 0,
        status: 'idle' as const,
      },
      {
        queuedCount: 0,
        issueCount: 0,
        otherAccountPendingCount: 1,
        status: 'idle' as const,
      },
      {
        queuedCount: 0,
        issueCount: 0,
        otherAccountPendingCount: 0,
        status: 'recovering' as const,
      },
      {
        queuedCount: 0,
        issueCount: 0,
        otherAccountPendingCount: 0,
        status: 'error' as const,
      },
    ]) {
      expect(shouldShowUploadsPanel(state)).toBe(true);
    }
  });

  it('disables and announces Retry now while a retry is busy', () => {
    expect(retryButtonCopy(false)).toEqual({
      label: 'Retry now',
      accessibilityLabel: 'Retry activity uploads now',
      disabled: false,
      busy: false,
    });
    expect(retryButtonCopy(true)).toEqual({
      label: 'Retrying…',
      accessibilityLabel: 'Retrying activity uploads',
      disabled: true,
      busy: true,
    });
  });

  it('uses the required privacy-safe other-account title and marks estimates', () => {
    expect(OTHER_ACCOUNT_UPLOADS_TITLE).toBe(
      'Pending uploads for another account',
    );
    expect(otherAccountUploadCopy(2, false)).toEqual({
      title: OTHER_ACCOUNT_UPLOADS_TITLE,
      detail: '2 pending uploads',
    });
    expect(otherAccountUploadCopy(3, true)).toEqual({
      title: OTHER_ACCOUNT_UPLOADS_TITLE,
      detail: 'Approximately 3 pending uploads',
    });
  });

  it('shows only the count and privacy-safe category for quarantine issues', () => {
    expect(uploadIssueCopy(2)).toEqual({
      title: 'Needs attention',
      detail: '2 saved items · Offline storage',
    });
  });
});
