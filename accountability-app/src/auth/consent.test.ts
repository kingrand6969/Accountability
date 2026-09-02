import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const mockRpc = jest.fn<(
  name: string,
  args: Record<string, string>,
) => Promise<{ error: Error | null }>>();
const mockMaybeSingle = jest.fn<() => Promise<{
  data: { terms_version: string | null } | null;
  error: Error | null;
}>>();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((_name: string) => ({ select: mockSelect }));

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, string>) => mockRpc(name, args),
    from: (name: string) => mockFrom(name),
  },
}));

// eslint-disable-next-line import/first
import {
  acceptCurrentLegalTerms,
  getLegalConsentVersion,
  isLegalConsentCurrent,
  recordConsent,
} from './consent';
// eslint-disable-next-line import/first
import { LEGAL_VERSION } from '../legal/content';

describe('legal consent version behavior', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockMaybeSingle.mockReset();
    mockEq.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
  });

  const consentCases: readonly (readonly [string | null | undefined, boolean])[] = [
    [null, false],
    [undefined, false],
    ['', false],
    ['2026-08-10', false],
    ['2026-09-03', false],
    [LEGAL_VERSION, true],
  ];

  test.each(consentCases)('treats accepted version %p as current=%p', (accepted, current) => {
    expect(isLegalConsentCurrent(accepted)).toBe(current);
  });

  test('reads only the signed-in owner consent version', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { terms_version: '2026-08-10' },
      error: null,
    });

    await expect(getLegalConsentVersion('owner-1')).resolves.toBe('2026-08-10');
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockSelect).toHaveBeenCalledWith('terms_version');
    expect(mockEq).toHaveBeenCalledWith('id', 'owner-1');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  test('requires an explicit strict acceptance mutation for returning users', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await expect(acceptCurrentLegalTerms()).resolves.toBeUndefined();
    expect(mockRpc).toHaveBeenCalledWith('record_consent', {
      p_version: LEGAL_VERSION,
    });
  });

  test('does not mark acceptance when the strict mutation fails', async () => {
    const failure = new Error('offline');
    mockRpc.mockResolvedValue({ error: failure });

    await expect(acceptCurrentLegalTerms()).rejects.toBe(failure);
  });

  test('keeps signup stamping best-effort', async () => {
    mockRpc.mockRejectedValue(new Error('offline'));
    await expect(recordConsent()).resolves.toBeUndefined();
  });

  test('re-acceptance refreshes the shared Terms and Privacy timestamp in an owner-scoped RPC', () => {
    const migrationPath = path.resolve(
      __dirname,
      '../../supabase/migrations/0119_refresh_legal_consent.sql',
    );
    const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';
    expect(migration).toContain('terms_accepted_at = excluded.terms_accepted_at');
    expect(migration).toContain('values (auth.uid(), p_version, now(), now())');
    expect(migration).toContain('grant execute on function public.record_consent(text) to authenticated');
  });
});
