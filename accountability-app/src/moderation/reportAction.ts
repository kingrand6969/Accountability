export const REPORT_VISIBILITY_MESSAGE =
  'This content stays visible unless AI confirms a violation or an admin removes it.';

export type ReportKind = 'comment' | 'story';

export type ReportConfirmation = {
  title: string;
  message: string;
  onConfirm: () => Promise<boolean>;
};

type ReportActionOptions = {
  kind: ReportKind;
  report: (targetId: string) => Promise<void>;
  confirm: (confirmation: ReportConfirmation) => void;
  toast: (message: string) => void;
  announce: (message: string) => void;
  alertError: (title: string, message: string) => void;
  pendingChanged?: (pendingIds: ReadonlySet<string>) => void;
};

export function canReportContent(viewerId: string | null, authorId: string): boolean {
  return Boolean(viewerId && viewerId !== authorId);
}

export function createReportAction(options: ReportActionOptions) {
  const pendingIds = new Set<string>();
  const label = options.kind === 'comment' ? 'Comment' : 'Story';

  const publishPending = () => options.pendingChanged?.(new Set(pendingIds));

  async function submit(targetId: string): Promise<boolean> {
    if (pendingIds.has(targetId)) return false;
    pendingIds.add(targetId);
    publishPending();
    try {
      await options.report(targetId);
      options.toast(`${label} reported`);
      options.announce(`${label} reported successfully.`);
      return true;
    } catch (error) {
      options.alertError(
        `Could not report ${options.kind}`,
        String((error as Error).message ?? error),
      );
      return false;
    } finally {
      pendingIds.delete(targetId);
      publishPending();
    }
  }

  return {
    isPending: (targetId: string) => pendingIds.has(targetId),
    request(targetId: string, viewerId: string | null, authorId: string): boolean {
      if (!canReportContent(viewerId, authorId) || pendingIds.has(targetId)) return false;
      options.confirm({
        title: `Report ${options.kind}?`,
        message: REPORT_VISIBILITY_MESSAGE,
        onConfirm: () => submit(targetId),
      });
      return true;
    },
  };
}
