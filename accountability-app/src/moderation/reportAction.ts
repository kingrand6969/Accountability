export const REPORT_VISIBILITY_MESSAGE =
  'This content stays visible unless AI confirms a violation or an admin removes it.';

export type ReportKind = 'comment' | 'story';

export type ReportConfirmation = {
  title: string;
  message: string;
  onConfirm: () => Promise<boolean>;
  onCancel: () => void;
  onDismiss: () => void;
};

type ReportActionOptions = {
  kind: ReportKind;
  report: (targetId: string) => Promise<void>;
  confirm: (confirmation: ReportConfirmation) => void;
  toast: (message: string) => void;
  announce: (message: string) => void;
  alertError: (title: string, message: string) => void;
  pendingChanged?: (pendingIds: ReadonlySet<string>) => void;
  getContextKey: (targetId: string) => string | null;
};

export function canReportContent(viewerId: string | null, authorId: string): boolean {
  return Boolean(viewerId && viewerId !== authorId);
}

export function safeReportErrorMessage(error: unknown): string {
  const value = error && typeof error === 'object' ? (error as { code?: unknown; status?: unknown }) : {};
  const code = String(value.code ?? value.status ?? '').toLowerCase();
  if (code === '401' || code === 'unauthenticated') return 'Please sign in again and try again.';
  if (code === '403' || code === '42501' || code === 'permission_denied')
    return 'You can’t report this content.';
  if (code === '429' || code === 'rate_limit')
    return 'You’re reporting too quickly. Please wait and try again.';
  if (code === '404' || code === 'pgrst116' || code === 'not_found')
    return 'This content is no longer available.';
  return 'Something went wrong. Please try again.';
}

export function createReportAction(options: ReportActionOptions) {
  const pending = new Map<string, { version: number; contextKey: string; phase: 'confirming' | 'submitting' }>();
  const label = options.kind === 'comment' ? 'Comment' : 'Story';
  let version = 0;
  let disposed = false;

  const pendingIds = () => new Set(pending.keys());
  const publishPending = () => options.pendingChanged?.(pendingIds());
  const isCurrent = (targetId: string, entry: { version: number; contextKey: string }) =>
    !disposed &&
    entry.version === version &&
    options.getContextKey(targetId) === entry.contextKey;

  const releaseConfirmation = (targetId: string, entry: { version: number; contextKey: string }) => {
    const active = pending.get(targetId);
    if (!active || active !== entry || active.phase !== 'confirming') return;
    pending.delete(targetId);
    if (isCurrent(targetId, entry)) publishPending();
  };

  async function submit(
    targetId: string,
    entry: { version: number; contextKey: string; phase: 'confirming' | 'submitting' },
  ): Promise<boolean> {
    if (pending.get(targetId) !== entry || entry.phase !== 'confirming') return false;
    if (!isCurrent(targetId, entry)) {
      pending.delete(targetId);
      return false;
    }
    entry.phase = 'submitting';
    try {
      await options.report(targetId);
      if (!isCurrent(targetId, entry)) return false;
      options.toast(`${label} reported`);
      options.announce(`${label} reported successfully.`);
      return true;
    } catch (error) {
      if (!isCurrent(targetId, entry)) return false;
      options.alertError(
        `Could not report ${options.kind}`,
        safeReportErrorMessage(error),
      );
      return false;
    } finally {
      if (pending.get(targetId) === entry) pending.delete(targetId);
      if (isCurrent(targetId, entry)) publishPending();
    }
  }

  return {
    isPending: (targetId: string) => pending.has(targetId),
    request(targetId: string, viewerId: string | null, authorId: string): boolean {
      if (!canReportContent(viewerId, authorId) || pending.has(targetId) || disposed) return false;
      const contextKey = options.getContextKey(targetId);
      if (!contextKey) return false;
      const entry = { version, contextKey, phase: 'confirming' as const };
      pending.set(targetId, entry);
      publishPending();
      options.confirm({
        title: `Report ${options.kind}?`,
        message: REPORT_VISIBILITY_MESSAGE,
        onConfirm: () => submit(targetId, entry),
        onCancel: () => releaseConfirmation(targetId, entry),
        onDismiss: () => releaseConfirmation(targetId, entry),
      });
      return true;
    },
    invalidate() {
      version += 1;
      pending.clear();
      publishPending();
    },
    dispose() {
      disposed = true;
      version += 1;
      pending.clear();
    },
  };
}
