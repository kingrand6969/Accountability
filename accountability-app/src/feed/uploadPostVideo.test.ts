import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { uploadBytesToR2 } from '../lib/r2';
import { uploadPostVideo } from './uploadPostVideo';

jest.mock('../lib/r2', () => ({
  uploadBytesToR2: jest.fn(async () => 'media-ref'),
}));

const mockedUpload = uploadBytesToR2 as jest.MockedFunction<typeof uploadBytesToR2>;

describe('uploadPostVideo owner binding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })) as unknown as typeof fetch;
  });

  test('passes the stable operation and initiating owner to the signing boundary', async () => {
    await expect(uploadPostVideo(
      'file:///video.mp4',
      'video/mp4',
      '123e4567-e89b-42d3-a456-426614174000',
      'member-a',
    )).resolves.toBe('media-ref');

    expect(mockedUpload).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'video',
      'video/mp4',
      'mp4',
      {
        operationId: '123e4567-e89b-42d3-a456-426614174000',
        expectedOwnerId: 'member-a',
      },
    );
  });
});
