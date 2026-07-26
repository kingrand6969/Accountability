import { describe, expect, it, test } from '@jest/globals';
import type { QueuedActivity, UploadStatus } from './offlineQueueTypes';
import {
  activityUploadsPreview,
  activityUploadBadgeStatus,
  OTHER_ACCOUNT_UPLOADS_TITLE,
  otherAccountUploadCopy,
  remainingUploadsCopy,
  retryButtonCopy,
  safeQueuedActivitySummary,
  shouldShowUploadsPanel,
  uploadIssueCopy,
  uploadStatusCopy,
} from './UploadStatus';

function previewEntry(index: number): QueuedActivity {
  const suffix = String(index).padStart(12, '0');
  return {
    schema: 1,
    id: `11111111-1111-4111-8111-${suffix}`,
    ownerId: '22222222-2222-4222-8222-222222222222',
    activity: {
      type: 'run',
      distance_m: index,
      duration_s: 60,
      route: [],
      started_at: new Date(index * 1_000).toISOString(),
    },
    createdAt: new Date(index * 1_000).toISOString(),
    status: 'saved',
    attemptCount: 0,
    nextAttemptAt: 0,
    lastError: null,
  };
}

describe('activity uploads preview model', () => {
  it('renders no rows or remainder for an empty queue', () => {
    expect(activityUploadsPreview([])).toEqual({
      items: [],
      remainingCount: 0,
    });
  });

  it('renders all eight rows at the preview limit', () => {
    const queued = Array.from({ length: 8 }, (_, index) =>
      previewEntry(index),
    );

    expect(activityUploadsPreview(queued)).toEqual({
      items: queued,
      remainingCount: 0,
    });
  });

  it('caps nine rows at eight and reports the exact remainder', () => {
    const queued = Array.from({ length: 9 }, (_, index) =>
      previewEntry(8 - index),
    );
    const preview = activityUploadsPreview(queued);

    expect(preview.items).toHaveLength(8);
    expect(
      preview.items.map((entry) => entry.createdAt),
    ).toEqual(
      [...queued]
        .sort((left, right) =>
          left.createdAt.localeCompare(right.createdAt),
        )
        .slice(0, 8)
        .map((entry) => entry.createdAt),
    );
    expect(preview.remainingCount).toBe(1);
    expect(remainingUploadsCopy(preview.remainingCount)).toBe(
      '1 more uploads will continue automatically',
    );
  });

  it('never renders more than eight rows for thousands of uploads', () => {
    const queued = Array.from({ length: 3_257 }, (_, index) =>
      previewEntry(index),
    );
    const preview = activityUploadsPreview(queued);

    expect(preview.items).toHaveLength(8);
    expect(preview.remainingCount).toBe(3_249);
    expect(remainingUploadsCopy(preview.remainingCount)).toBe(
      '3249 more uploads will continue automatically',
    );
  });
});

describe('durable queue confirmation badge', () => {
  const activityId = '11111111-1111-4111-8111-111111111111';

  it('does not infer a badge before persistence starts', () => {
    expect(
      activityUploadBadgeStatus(activityId, null),
    ).toBeNull();
  });

  it('keeps the badge absent when enqueue rejects', async () => {
    let confirmation: {
      activityId: string;
      status: UploadStatus;
    } | null = null;

    await Promise.reject(new Error('queue storage failed')).catch(
      () => undefined,
    );

    expect(activityUploadBadgeStatus(activityId, confirmation)).toBeNull();
  });

  it('shows the confirmed queue status only after enqueue resolves', async () => {
    let confirmation: {
      activityId: string;
      status: UploadStatus;
    } | null = null;
    const queued = await Promise.resolve({
      activityId,
      status: 'saved' as const,
    });
    confirmation = queued;

    expect(activityUploadBadgeStatus(activityId, confirmation)).toBe(
      'saved',
    );
  });

  it('does not label a restored completed-but-unqueued recording', () => {
    const restoredCompletedId =
      '33333333-3333-4333-8333-333333333333';

    expect(
      activityUploadBadgeStatus(restoredCompletedId, null),
    ).toBeNull();
  });

  it('does not reuse confirmation from a different recording', () => {
    expect(
      activityUploadBadgeStatus(activityId, {
        activityId: '44444444-4444-4444-8444-444444444444',
        status: 'saved',
      }),
    ).toBeNull();
  });
});

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
