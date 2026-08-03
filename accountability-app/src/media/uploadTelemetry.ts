import { supabase } from '../lib/supabase';
import type { R2Kind } from '../lib/r2';
import type { UploadFailureClass } from './uploadPolicy';

export type UploadProvider = 'r2' | 'supabase';
export type UploadOutcome = 'success' | 'fallback' | 'rejected' | 'failed';
export async function recordUploadEvent(input: {
  provider: UploadProvider;
  kind: R2Kind;
  outcome: UploadOutcome;
  bytes: number;
  failureClass?: UploadFailureClass;
}): Promise<void> {
  try {
    await supabase.from('media_upload_events').insert({
      provider: input.provider,
      kind: input.kind,
      outcome: input.outcome,
      bytes: Math.max(1, Math.floor(input.bytes)),
      failure_class: input.failureClass ?? null,
    });
  } catch {
    // Telemetry must never break a completed upload.
  }
}
