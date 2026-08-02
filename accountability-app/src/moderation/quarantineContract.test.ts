import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { reportComment, reportPost } from '../feed/api';
import { reportStory } from '../stories/api';
import { supabase } from '../lib/supabase';
import {
  REPORT_VISIBILITY_MESSAGE,
  canReportContent,
  createReportAction,
  safeReportErrorMessage,
  type ReportConfirmation,
} from './reportAction';

jest.mock('../lib/supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, rpc: jest.fn(), from: jest.fn() },
}));
jest.mock('../profiles/publicProfiles', () => ({ getPublicProfiles: jest.fn() }));
jest.mock('../media/privateMedia', () => ({ resolveMediaUrls: jest.fn() }));
jest.mock('../feed/uploadPostImage', () => ({ uploadPostImage: jest.fn() }));
jest.mock('../lib/r2', () => ({ uploadBytesToR2: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: class {} }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

const rpc = supabase.rpc as jest.Mock<any>;
const migration = readFileSync(
  require.resolve('../../supabase/migrations/0096_ai_moderation_quarantine.sql'),
  'utf8',
);

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
});

describe('structured content reporting clients', () => {
  test.each([
    ['posts', () => reportPost({ id: 'post-id', user_id: 'ignored', body: 'secret excerpt' }), 'post-id'],
    ['post_comments', () => reportComment('comment-id', '  bullying  '), 'comment-id'],
    ['stories', () => reportStory('story-id'), 'story-id'],
  ])('reports %s using an opaque structured RPC payload', async (table, invoke, id) => {
    await invoke();
    expect(rpc).toHaveBeenCalledWith('report_content', {
      p_source_table: table,
      p_source_id: id,
      p_reason: table === 'post_comments' ? 'bullying' : null,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('secret excerpt');
    expect(supabase.from).not.toHaveBeenCalledWith('buddy_reports');
  });

  test('propagates RPC errors', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(reportComment('comment-id')).rejects.toMatchObject({ code: '42501' });
  });
});

describe('manual-report screen contract', () => {
  test('only permits a report action for signed-in non-owners', () => {
    expect(canReportContent('viewer', 'author')).toBe(true);
    expect(canReportContent('owner', 'owner')).toBe(false);
    expect(canReportContent(null, 'author')).toBe(false);
  });

  test.each(['comment', 'story'] as const)(
    '%s reporting confirms visibility, rejects a duplicate pending attempt, and announces success',
    async (kind) => {
      let confirmation: ReportConfirmation | undefined;
      let resolveReport!: () => void;
      const pendingReport = new Promise<void>((resolve) => {
        resolveReport = resolve;
      });
      const report = jest.fn<(id: string) => Promise<void>>(() => pendingReport);
      const announce = jest.fn<(message: string) => void>();
      const toast = jest.fn<(message: string) => void>();
      const alertError = jest.fn<(title: string, message: string) => void>();
      const pendingChanges = jest.fn<(ids: ReadonlySet<string>) => void>();
      let context = `viewer:${kind}-current:1`;
      const action = createReportAction({
        kind,
        report,
        confirm: (next) => {
          confirmation = next;
        },
        announce,
        toast,
        alertError,
        pendingChanged: pendingChanges,
        getContextKey: (id) => (context ? `viewer:${id}:1` : null),
      });

      expect(action.request(`${kind}-current`, 'viewer', 'author')).toBe(true);
      expect(action.isPending(`${kind}-current`)).toBe(true);
      expect(confirmation).toMatchObject({
        title: `Report ${kind}?`,
        message: REPORT_VISIBILITY_MESSAGE,
      });
      const first = confirmation!.onConfirm();
      const duplicate = await confirmation!.onConfirm();
      expect(duplicate).toBe(false);
      expect(report).toHaveBeenCalledTimes(1);
      expect(report).toHaveBeenCalledWith(`${kind}-current`);

      resolveReport();
      await expect(first).resolves.toBe(true);
      expect(action.isPending(`${kind}-current`)).toBe(false);
      expect(toast).toHaveBeenCalledWith(`${kind === 'comment' ? 'Comment' : 'Story'} reported`);
      expect(announce).toHaveBeenCalledWith(
        `${kind === 'comment' ? 'Comment' : 'Story'} reported successfully.`,
      );
      expect(alertError).not.toHaveBeenCalled();
      expect(pendingChanges).toHaveBeenCalled();
    },
  );

  test.each(['comment', 'story'] as const)('%s reporting resets pending state and alerts on error', async (kind) => {
    let confirmation: ReportConfirmation | undefined;
    const report = jest.fn<(id: string) => Promise<void>>().mockRejectedValue(new Error('network down'));
    const announce = jest.fn<(message: string) => void>();
    const alertError = jest.fn<(title: string, message: string) => void>();
      const action = createReportAction({
      kind,
      report,
      confirm: (next) => {
        confirmation = next;
      },
      announce,
      toast: jest.fn(),
      alertError,
      getContextKey: (id) => `viewer:${id}:1`,
    });

    action.request(`${kind}-failed`, 'viewer', 'author');
    await expect(confirmation!.onConfirm()).resolves.toBe(false);
    expect(action.isPending(`${kind}-failed`)).toBe(false);
    expect(alertError).toHaveBeenCalledWith(
      `Could not report ${kind}`,
      'Something went wrong. Please try again.',
    );
    expect(announce).not.toHaveBeenCalled();
  });

  test('locks through confirmation and releases on cancel or Android dismiss', () => {
    const confirmations: ReportConfirmation[] = [];
    const pendingChanged = jest.fn<(ids: ReadonlySet<string>) => void>();
    let storyPaused = false;
    const action = createReportAction({
      kind: 'story',
      report: jest.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined),
      confirm: (confirmation) => {
        storyPaused = true;
        confirmations.push(confirmation);
      },
      announce: jest.fn(),
      toast: jest.fn(),
      alertError: jest.fn(),
      pendingChanged: (ids) => {
        pendingChanged(ids);
        if (ids.size === 0) storyPaused = false;
      },
      getContextKey: (id) => `viewer:${id}:1`,
    });

    expect(action.request('story-1', 'viewer', 'author')).toBe(true);
    expect(action.request('story-1', 'viewer', 'author')).toBe(false);
    confirmations[0].onCancel();
    expect(action.isPending('story-1')).toBe(false);
    expect(storyPaused).toBe(false);
    expect(action.request('story-1', 'viewer', 'author')).toBe(true);
    confirmations[1].onDismiss();
    expect(action.isPending('story-1')).toBe(false);
    expect(storyPaused).toBe(false);
    expect(pendingChanged.mock.calls.at(-1)?.[0].size).toBe(0);
  });

  test('navigation or identity change before confirm prevents the API call', async () => {
    let context = 'viewer:comment-1:1';
    let confirmation!: ReportConfirmation;
    const report = jest.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const pendingChanged = jest.fn<(ids: ReadonlySet<string>) => void>();
    const action = createReportAction({
      kind: 'comment', report, confirm: (next) => { confirmation = next; },
      announce: jest.fn(), toast: jest.fn(), alertError: jest.fn(), pendingChanged,
      getContextKey: () => context,
    });
    action.request('comment-1', 'viewer', 'author');
    context = 'other-viewer:comment-1:2';
    await expect(confirmation.onConfirm()).resolves.toBe(false);
    expect(report).not.toHaveBeenCalled();
    expect(pendingChanged).toHaveBeenCalledTimes(1);
  });

  test('navigation during submit suppresses success, error, and stale pending callbacks', async () => {
    let context = 'viewer:story-1:1';
    let confirmation!: ReportConfirmation;
    let rejectReport!: (reason: unknown) => void;
    const report = jest.fn(() => new Promise<void>((_resolve, reject) => { rejectReport = reject; }));
    const toast = jest.fn();
    const announce = jest.fn();
    const alertError = jest.fn();
    const pendingChanged = jest.fn<(ids: ReadonlySet<string>) => void>();
    const action = createReportAction({
      kind: 'story', report, confirm: (next) => { confirmation = next; }, toast, announce,
      alertError, pendingChanged, getContextKey: () => context,
    });
    action.request('story-1', 'viewer', 'author');
    const submitting = confirmation.onConfirm();
    context = 'viewer:story-2:2';
    rejectReport({ code: '42501', message: 'secret backend policy details' });
    await expect(submitting).resolves.toBe(false);
    expect(toast).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    expect(alertError).not.toHaveBeenCalled();
    expect(pendingChanged).toHaveBeenCalledTimes(1);
  });

  test('dispose prevents confirmation from submitting after unmount', async () => {
    let confirmation!: ReportConfirmation;
    const report = jest.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const action = createReportAction({
      kind: 'comment', report, confirm: (next) => { confirmation = next; },
      announce: jest.fn(), toast: jest.fn(), alertError: jest.fn(),
      getContextKey: (id) => `viewer:${id}:1`,
    });
    action.request('comment-1', 'viewer', 'author');
    action.dispose();
    await expect(confirmation.onConfirm()).resolves.toBe(false);
    expect(report).not.toHaveBeenCalled();
  });

  test.each([
    [{ code: '401' }, 'Please sign in again and try again.'],
    [{ code: '42501', message: 'raw policy secret' }, 'You can’t report this content.'],
    [{ code: '429' }, 'You’re reporting too quickly. Please wait and try again.'],
    [{ code: 'PGRST116' }, 'This content is no longer available.'],
    [new Error('database host and token details'), 'Something went wrong. Please try again.'],
  ])('maps report failures to safe copy without raw backend details', (error, expected) => {
    expect(safeReportErrorMessage(error)).toBe(expected);
    expect(safeReportErrorMessage(error)).not.toMatch(/raw policy|database host|token details/i);
  });
});

describe('manual-report database contract', () => {
  test('adds nullable structured columns without excluding legacy reports', () => {
    expect(migration).toMatch(/buddy_reports[\s\S]*source_table text[\s\S]*source_id uuid/i);
    expect(migration).toMatch(/source_table is null and source_id is null/i);
    expect(migration).toMatch(/source_table in \('posts', 'post_comments', 'stories'\)/i);
    expect(migration).toMatch(/create policy "File own reports"[\s\S]*source_table is null and source_id is null/i);
  });

  test('derives identities server-side and queues a priority manual check', () => {
    const reportFunction = migration.match(/create or replace function public\.report_content[\s\S]*?\$function\$;/i)?.[0] ?? '';
    expect(migration).toMatch(/create or replace function public\.report_content\(\s*p_source_table text,\s*p_source_id uuid,\s*p_reason text/i);
    expect(migration).toMatch(/v_reporter_id uuid := auth\.uid\(\)/i);
    expect(migration).toMatch(/insert into public\.buddy_reports[\s\S]*v_reporter_id[\s\S]*v_author_id/i);
    expect(migration).toMatch(/jsonb_build_object\([\s\S]*'table', p_source_table[\s\S]*'id', p_source_id[\s\S]*'reason', 'manual_report'[\s\S]*'report_id', p_report_id/i);
    expect(migration).toMatch(/body := jsonb_build_object/i);
    expect(reportFunction).toMatch(/pg_advisory_xact_lock\(hashtextextended\('report_content:' \|\| v_reporter_id::text, 0\)\)/i);
    expect(migration).toMatch(/create unique index if not exists buddy_reports_open_structured_idx[\s\S]*where source_table is not null and resolved_at is null/i);
    expect(reportFunction).toMatch(/on conflict \(reporter, source_table, source_id\)[\s\S]*where source_table is not null and resolved_at is null[\s\S]*do nothing/i);
    const limiterFunction = migration.match(/create or replace function public\.enforce_rate_limit[\s\S]*?\$function\$;/i)?.[0] ?? '';
    expect(limiterFunction).toMatch(/if tg_table_name = 'buddy_reports'[\s\S]*pg_advisory_xact_lock\([\s\S]*hashtextextended\('report_content:' \|\| new\.reporter::text, 0\)[\s\S]*select \* into cfg[\s\S]*select count\(\*\)/i);
  });

  test('is authenticated-only, fail-open, and never quarantines by itself', () => {
    const reportFunction = migration.match(/create or replace function public\.report_content[\s\S]*?\$function\$;/i)?.[0] ?? '';
    const enqueueFunction = migration.match(/create or replace function public\.enqueue_manual_moderation[\s\S]*?\$function\$;/i)?.[0] ?? '';
    expect(migration).toMatch(/revoke all on function public\.report_content\(text, uuid, text\) from public, anon/i);
    expect(migration).toMatch(/grant execute on function public\.report_content\(text, uuid, text\) to authenticated, service_role/i);
    expect(reportFunction).toMatch(/exception when others then[\s\S]*return v_report_id/i);
    expect(reportFunction).not.toMatch(/update public\.(posts|post_comments|stories).*moderation_state/i);
    expect(reportFunction).toMatch(/perform public\.enqueue_manual_moderation/i);
    expect(enqueueFunction).toMatch(/coalesce\(v_secret, ''\) <> ''/i);
    expect(enqueueFunction).toMatch(/\/functions\/v1\/moderate-content/i);
    expect(enqueueFunction).not.toMatch(/'x-moderation-secret', coalesce\(v_secret, ''\)/i);
    expect(migration).toMatch(/revoke all on function public\.enqueue_manual_moderation\(text, uuid, uuid\)\s*from public, anon, authenticated/i);
  });
});
