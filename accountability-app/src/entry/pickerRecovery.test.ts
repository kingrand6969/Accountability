import { createPickerRecoveryController, normalizePickedAsset } from './pickerRecovery';
import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

describe('normalizePickedAsset', () => {
  test('treats a canceled picker result as quiet cancellation', () => {
    expect(normalizePickedAsset({ canceled: true, assets: null }, 'image')).toEqual({
      status: 'canceled',
    });
  });

  test('rejects a successful result with no assets', () => {
    expect(normalizePickedAsset({ canceled: false, assets: [] }, 'image')).toEqual({
      status: 'invalid',
      message: 'No image was returned. Please try again.',
    });
  });

  test('rejects an asset of the wrong media type', () => {
    expect(
      normalizePickedAsset(
        { canceled: false, assets: [{ uri: 'file:///clip.mp4', type: 'video' }] },
        'image',
      ),
    ).toEqual({
      status: 'invalid',
      message: 'The selected file is not an image. Please choose an image and try again.',
    });
  });

  test('uses a readable retry message when an image is returned for a video request', () => {
    expect(
      normalizePickedAsset(
        { canceled: false, assets: [{ uri: 'file:///photo.jpg', type: 'image' }] },
        'video',
      ),
    ).toEqual({
      status: 'invalid',
      message: 'The selected file is not a video. Please choose a video and try again.',
    });
  });

  test('rejects an asset without a usable URI', () => {
    expect(
      normalizePickedAsset(
        { canceled: false, assets: [{ uri: '   ', type: 'video' }] },
        'video',
      ),
    ).toEqual({
      status: 'invalid',
      message: 'The selected video could not be read. Please try again.',
    });
  });

  test('accepts a valid image asset', () => {
    const asset = {
      uri: 'file:///photo.jpg',
      type: 'image' as const,
      base64: 'encoded',
      mimeType: 'image/jpeg',
    };

    expect(normalizePickedAsset({ canceled: false, assets: [asset] }, 'image')).toEqual({
      status: 'accepted',
      asset,
    });
  });

  test('accepts a valid video asset', () => {
    const asset = {
      uri: 'file:///clip.mp4',
      type: 'video' as const,
      mimeType: 'video/mp4',
      duration: 12_000,
      fileSize: 42_000,
    };

    expect(normalizePickedAsset({ canceled: false, assets: [asset] }, 'video')).toEqual({
      status: 'accepted',
      asset,
    });
  });

  test('turns a pending-picker error result into a retryable invalid result', () => {
    expect(
      normalizePickedAsset(
        { code: 'E_PICKER_FAILED', message: 'The picker activity was interrupted.' },
        'image',
      ),
    ).toEqual({
      status: 'invalid',
      message: 'The image picker could not finish. Please try again.',
    });
  });

  test.each(['E_PICKER_CANCELLED', 'E_PICKER_CANCELED', 'ERR_CANCELED', 'E_CANCELED'])(
    'treats known cancellation error %s as quiet cancellation',
    (code) => {
      expect(normalizePickedAsset({ code, message: 'interrupted' }, 'image')).toEqual({
        status: 'canceled',
      });
    },
  );
});

describe('picker recovery controller', () => {
  const image = {
    canceled: false as const,
    assets: [{ uri: 'file:///photo.jpg', type: 'image' as const, width: 10, height: 10 }],
  };
  const video = {
    canceled: false as const,
    assets: [{ uri: 'file:///clip.mp4', type: 'video' as const, width: 10, height: 10 }],
  };

  function setup(result: unknown = image) {
    let context = { ownerId: 'owner-a', draftId: 'draft-a', mountToken: 1, active: true };
    const pending = jest.fn(async () => result);
    const attachPhoto = jest.fn(async () => {});
    const attachVideo = jest.fn(async () => {});
    const onInvalid = jest.fn();
    const upload = jest.fn();
    const controller = createPickerRecoveryController({
      getPendingResult: pending,
      getContext: () => context,
      attachPhoto,
      attachVideo,
      onInvalid,
    });
    return {
      controller,
      pending,
      attachPhoto,
      attachVideo,
      onInvalid,
      upload,
      setContext: (next: typeof context) => { context = next; },
    };
  }

  test('consumes a recovered photo once and hands it to the editor without uploading', async () => {
    const h = setup();
    await h.controller.recover();
    await h.controller.recover();

    expect(h.attachPhoto).toHaveBeenCalledTimes(1);
    expect(h.attachPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'file:///photo.jpg' }),
      expect.any(Function),
    );
    expect(h.upload).not.toHaveBeenCalled();
  });

  test('removes a failed consumption so a transient attach can retry', async () => {
    const h = setup();
    h.attachPhoto.mockRejectedValueOnce(new Error('disk busy'));

    await h.controller.recover();
    await h.controller.recover();

    expect(h.attachPhoto).toHaveBeenCalledTimes(2);
    expect(h.onInvalid).toHaveBeenCalledWith(
      'The recovered image could not be saved. Please choose it again.',
    );
  });

  test('reports a transient pending-result failure and retries on the next focus', async () => {
    const h = setup();
    h.pending.mockRejectedValueOnce(new Error('picker unavailable'));

    await h.controller.recover();
    await h.controller.recover();

    expect(h.onInvalid).toHaveBeenCalledWith('The media picker could not be checked. Please try again.');
    expect(h.onInvalid.mock.calls.flat().join(' ')).not.toContain('picker unavailable');
    expect(h.attachPhoto).toHaveBeenCalledTimes(1);
  });

  test('does not apply a result after account switch or unmount', async () => {
    let resolvePending!: (value: typeof image) => void;
    const h = setup(new Promise<typeof image>((resolve) => { resolvePending = resolve; }));
    const recovery = h.controller.recover();
    h.setContext({ ownerId: 'owner-b', draftId: 'draft-b', mountToken: 2, active: true });
    resolvePending(image);
    await recovery;
    expect(h.attachPhoto).not.toHaveBeenCalled();
    expect(h.onInvalid).not.toHaveBeenCalled();

    h.setContext({ ownerId: 'owner-b', draftId: 'draft-b', mountToken: 2, active: false });
    await h.controller.recover();
    expect(h.attachPhoto).not.toHaveBeenCalled();
  });

  test('ordinary compose state changes do not detach an in-flight recovery', async () => {
    let resolvePending!: (value: typeof image) => void;
    const h = setup(new Promise<typeof image>((resolve) => { resolvePending = resolve; }));
    const recovery = h.controller.recover();
    h.setContext({ ownerId: 'owner-a', draftId: 'draft-a', mountToken: 1, active: true });
    resolvePending(image);

    await recovery;

    expect(h.attachPhoto).toHaveBeenCalledTimes(1);
  });

  test('focus and AppState recovery calls do not consume pending media in editing mode', async () => {
    const h = setup();
    h.setContext({ ownerId: 'owner-a', draftId: 'draft-a', mountToken: 1, active: false });

    await h.controller.recover();
    await h.controller.recover();

    expect(h.pending).not.toHaveBeenCalled();
    expect(h.attachPhoto).not.toHaveBeenCalled();
    expect(h.attachVideo).not.toHaveBeenCalled();
  });

  test('keeps cancellation quiet and reports invalid media as retryable', async () => {
    const canceled = setup({ code: 'E_PICKER_CANCELLED', message: 'cancelled' });
    await canceled.controller.recover();
    expect(canceled.onInvalid).not.toHaveBeenCalled();

    const invalid = setup({ canceled: false, assets: [] });
    await invalid.controller.recover();
    expect(invalid.onInvalid).toHaveBeenCalledWith('No image was returned. Please try again.');
  });

  test('never exposes a native path or exception message when attachment fails', async () => {
    const h = setup();
    h.attachPhoto.mockRejectedValueOnce(new Error('ENOENT C:\\Users\\secret\\photo.jpg'));

    await h.controller.recover();

    expect(h.onInvalid).toHaveBeenCalledWith(
      'The recovered image could not be saved. Please choose it again.',
    );
    expect(h.onInvalid.mock.calls.flat().join(' ')).not.toMatch(/ENOENT|Users|photo\.jpg/);
  });

  test('hands a recovered video to durable video attachment and never photo or upload', async () => {
    const h = setup(video);
    await h.controller.recover();

    expect(h.attachVideo).toHaveBeenCalledTimes(1);
    expect(h.attachPhoto).not.toHaveBeenCalled();
    expect(h.upload).not.toHaveBeenCalled();
  });
});

describe('Compose production binding', () => {
  const source = readFileSync(require.resolve('../app/compose'), 'utf8');

  test('routes live photo and video results through the shared normalizer', () => {
    expect(source).toContain("normalizePickedAsset(res, 'image')");
    expect(source).toContain("normalizePickedAsset(res, 'video')");
  });

  test('recovers pending native picker results behind owner and mount guards', () => {
    expect(source).toContain('ImagePicker.getPendingResultAsync()');
    expect(source).toContain('recoveryControllerRef.current?.recover()');
    expect(source).toContain('ownerRef.current !== expectedOwner');
    expect(source).toContain('mountTokenRef.current !== expectedToken');
  });

  test('uses the controller and a navigation-focus recovery callback', () => {
    expect(source).toContain('createPickerRecoveryController');
    expect(source).toContain('useFocusEffect(');
    expect(source).toContain('!editingIdRef.current');
  });

  test('persists recovered photos before canonical editor handoff without an upload call', () => {
    const start = source.indexOf('async function attachRecoveredPhoto(');
    const end = source.indexOf('async function attachVideoAsset(', start);
    const recoveryPhotoSource = source.slice(start, end);

    expect(recoveryPhotoSource).toContain("makeMediaDurable(asset.uri, extension, mimeType, 'photo')");
    expect(recoveryPhotoSource).toContain('setEditorUri(durable.uri)');
    expect(recoveryPhotoSource).not.toMatch(/uploadPost(Image|Video)|createPost/);
  });

  test('increments the mount token only for auth detach and true unmount', () => {
    expect(source.match(/mountTokenRef\.current \+= 1/g)).toHaveLength(2);
    expect(source).toContain('flushDraftRef.current');
  });
});
