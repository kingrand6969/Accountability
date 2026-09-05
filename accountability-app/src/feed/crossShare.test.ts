import { Alert, Platform, Share } from 'react-native';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as Sharing from 'expo-sharing';
import { promptCrossShare } from './crossShare';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));

const mockedSharing = Sharing as jest.Mocked<typeof Sharing>;

function alertButtons() {
  const call = (Alert.alert as jest.Mock).mock.calls.at(-1);
  return call?.[2] as { text?: string; onPress?: () => void | Promise<void> }[];
}

describe('post cross-share media lifetime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  });

  test('does not settle until the user dismisses the cross-share offer', async () => {
    let settled = false;
    const result = promptCrossShare('Great run', 'file:///draft.jpg').then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    alertButtons().find((button) => button.text === 'Not now')?.onPress?.();
    await result;
    expect(settled).toBe(true);
  });

  test('keeps the operation pending until native media sharing finishes', async () => {
    let finishShare!: () => void;
    mockedSharing.shareAsync.mockReturnValueOnce(new Promise<void>((resolve) => {
      finishShare = resolve;
    }));
    let settled = false;
    const result = promptCrossShare('Great run', 'file:///draft.jpg').then(() => {
      settled = true;
    });

    const share = alertButtons().find((button) => button.text === 'Share…');
    const pressing = share?.onPress?.();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(mockedSharing.shareAsync).toHaveBeenCalledWith('file:///draft.jpg', expect.any(Object));
    finishShare();
    await pressing;
    await result;
    expect(settled).toBe(true);
  });
});
