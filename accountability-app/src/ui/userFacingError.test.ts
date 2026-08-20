import { describe, expect, jest, test } from '@jest/globals';

type ErrorContext = 'load' | 'comment' | 'update' | 'publish' | 'media';
type ErrorMapper = (error: unknown, context: ErrorContext) => string;

function loadMapper(): ErrorMapper | undefined {
  try {
    return jest.requireActual<{ userFacingErrorMessage?: ErrorMapper }>('./userFacingError')
      .userFacingErrorMessage;
  } catch {
    return undefined;
  }
}

describe('allowlisted user-facing errors', () => {
  test.each<readonly [unknown, ErrorContext, string]>([
    [
      new Error('TypeError: Network request failed https://private.example/x?X-Amz-Signature=secret'),
      'load',
      "You're offline or the connection timed out. Check your connection, then try again.",
    ],
    [
      { status: 401, message: 'invalid JWT eyJhbGciOiJIUzI1NiJ9.secret' },
      'publish',
      'Your session has expired. Sign in again, then retry.',
    ],
    [
      { code: '42501', message: 'new row violates row-level security policy for table posts' },
      'comment',
      "You don't have permission to do that.",
    ],
    [
      { status: 422, message: 'invalid input syntax for uuid: r2://private/object' },
      'publish',
      'Some information is missing or invalid. Review it, then try again.',
    ],
    [
      { status: 429, message: 'rate limit exceeded for user@example.com' },
      'update',
      'Too many attempts. Wait a moment, then try again.',
    ],
    [
      new Error('PostgrestError: relation posts_internal does not exist\n at query(sql.ts:91)'),
      'publish',
      'Nothing was posted. Please try again.',
    ],
  ])(
    'maps hostile backend detail to a fixed safe message',
    (error, context, expected) => {
      const mapper = loadMapper();
      const message = mapper?.(error, context) ?? '__missing_mapper__';

      expect(message).toBe(expected);
      expect(message).not.toMatch(/https?:|r2:\/\/|signature|jwt|eyJ|sql|relation|posts_internal|user@|stack|query\(/i);
    },
  );

  test.each<readonly [ErrorContext, string]>([
    ['load', "Couldn't load this right now. Please try again."],
    ['comment', "Your comment wasn't posted. Please try again."],
    ['update', "Your change wasn't saved. Please try again."],
    ['publish', 'Nothing was posted. Please try again.'],
    ['media', "The media couldn't be prepared. Retry or remove it."],
  ])('uses the fixed %s fallback for unknown failures', (context, expected) => {
    const mapper = loadMapper();
    expect(mapper?.({ deeply: { nested: 'r2://secret/object' } }, context) ?? '__missing_mapper__')
      .toBe(expected);
  });
});
