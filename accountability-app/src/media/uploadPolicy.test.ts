import { describe, expect, it } from '@jest/globals';
import {
  classifyUploadFailure,
  estimateBase64Bytes,
  mayUseStorageFallback,
} from './uploadPolicy';

describe('media upload cost policy', () => {
  it('never falls back to publicly addressed storage', () => {
    expect(mayUseStorageFallback({ context: { status: 503 } })).toBe(false);
    expect(mayUseStorageFallback(new TypeError('Network request failed'))).toBe(false);
    expect(mayUseStorageFallback({ context: { status: 401 } })).toBe(false);
    expect(mayUseStorageFallback({ statusCode: 413 })).toBe(false);
    expect(mayUseStorageFallback({ status: 429 })).toBe(false);
  });

  it('classifies provider failures without retaining sensitive details', () => {
    expect(classifyUploadFailure({ context: { status: 503 } })).toBe('availability');
    expect(classifyUploadFailure({ status: 401 })).toBe('auth');
    expect(classifyUploadFailure({ statusCode: 415 })).toBe('validation');
    expect(classifyUploadFailure({ status: 429 })).toBe('rate_limit');
  });

  it('estimates decoded bytes from padded base64', () => {
    expect(estimateBase64Bytes('YQ==')).toBe(1);
    expect(estimateBase64Bytes('YWI=')).toBe(2);
    expect(estimateBase64Bytes('YWJj')).toBe(3);
  });
});
