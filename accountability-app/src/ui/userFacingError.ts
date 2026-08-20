export type UserFacingErrorContext = 'load' | 'comment' | 'update' | 'publish' | 'media';

const OFFLINE_MESSAGE = "You're offline or the connection timed out. Check your connection, then try again.";
const SESSION_MESSAGE = 'Your session has expired. Sign in again, then retry.';
const PERMISSION_MESSAGE = "You don't have permission to do that.";
const VALIDATION_MESSAGE = 'Some information is missing or invalid. Review it, then try again.';
const RATE_LIMIT_MESSAGE = 'Too many attempts. Wait a moment, then try again.';

const FALLBACK_MESSAGES: Record<UserFacingErrorContext, string> = {
  load: "Couldn't load this right now. Please try again.",
  comment: "Your comment wasn't posted. Please try again.",
  update: "Your change wasn't saved. Please try again.",
  publish: 'Nothing was posted. Please try again.',
  media: "The media couldn't be prepared. Retry or remove it.",
};

const SIGNAL_KEYS = ['name', 'message', 'code', 'status', 'statusCode', 'details', 'hint'] as const;

function readSignal(error: unknown): string {
  if (typeof error === 'string' || typeof error === 'number') return String(error).toLowerCase();
  if (!error || typeof error !== 'object') return '';

  const parts: string[] = [];
  for (const key of SIGNAL_KEYS) {
    try {
      const value = (error as Record<string, unknown>)[key];
      if (typeof value === 'string' || typeof value === 'number') parts.push(String(value));
    } catch {
      // Classification is best-effort. The original error is never returned to the UI.
    }
  }

  try {
    const nativeContext = (error as { context?: unknown }).context;
    if (nativeContext && typeof nativeContext === 'object') {
      const status = (nativeContext as { status?: unknown }).status;
      if (typeof status === 'string' || typeof status === 'number') parts.push(String(status));
    }
  } catch {
    // Some native errors expose throwing getters; fall through to a safe fixed message.
  }

  return parts.join(' ').toLowerCase();
}

export function userFacingErrorMessage(error: unknown, context: UserFacingErrorContext): string {
  const signal = readSignal(error);

  if (/\b429\b|rate[ -]?limit|too many requests|throttl/.test(signal)) return RATE_LIMIT_MESSAGE;
  if (
    /network request failed|failed to fetch|networkerror|offline|internet|timed? ?out|timeout|connection|socket|\bdns\b|abort/.test(
      signal,
    )
  ) {
    return OFFLINE_MESSAGE;
  }
  if (/\b401\b|\bpgrst301\b|\bjwt\b|\btoken\b|\bsession\b|not authenticated|authentication required|sign[ -]?in/.test(signal)) {
    return SESSION_MESSAGE;
  }
  if (/\b403\b|\b42501\b|permission|not allowed|forbidden|row[ -]?level security|\brls\b/.test(signal)) {
    return PERMISSION_MESSAGE;
  }
  if (
    /\b(?:400|409|422)\b|\b(?:22p02|23502|23503|23505|23514)\b|invalid|validation|required|must be|too large|too long|bad request|constraint/.test(
      signal,
    )
  ) {
    return VALIDATION_MESSAGE;
  }

  return FALLBACK_MESSAGES[context];
}
