import React from 'react';
import { Pressable, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  APP_THEME_STORAGE_KEY,
  AppThemeProvider,
  useAppTheme,
} from './AppThemeProvider';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockedStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function Probe() {
  const { colors, mode, setMode } = useAppTheme();
  return (
    <Pressable accessibilityLabel="Choose dark" onPress={() => setMode('dark')}>
      <Text>{`${mode}:${colors.surface.canvas}`}</Text>
    </Pressable>
  );
}

function value(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByType(Text).props.children;
}

describe('AppThemeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedStorage.setItem.mockResolvedValue(undefined);
  });

  test('renders immediately in the approved light mode while storage is still loading', () => {
    const pending = deferred<string | null>();
    mockedStorage.getItem.mockReturnValueOnce(pending.promise);
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <AppThemeProvider>
          <Probe />
        </AppThemeProvider>,
      );
    });

    expect(value(renderer)).toBe('light:#F7F4EC');
    expect(mockedStorage.getItem).toHaveBeenCalledWith(APP_THEME_STORAGE_KEY);
    act(() => renderer.unmount());
  });

  test.each([
    ['dark', 'dark:#07111F'],
    ['light', 'light:#F7F4EC'],
    ['system', 'light:#F7F4EC'],
    [null, 'light:#F7F4EC'],
  ])('hydrates %p as %s without a blocking state', async (stored, expected) => {
    mockedStorage.getItem.mockResolvedValueOnce(stored);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppThemeProvider>
          <Probe />
        </AppThemeProvider>,
      );
    });

    expect(value(renderer)).toBe(expected);
    await act(async () => renderer.unmount());
  });

  test('applies and persists a manual selection immediately', async () => {
    mockedStorage.getItem.mockResolvedValueOnce(null);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppThemeProvider>
          <Probe />
        </AppThemeProvider>,
      );
    });

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Choose dark' }).props.onPress());

    expect(value(renderer)).toBe('dark:#07111F');
    expect(mockedStorage.setItem).toHaveBeenCalledWith(APP_THEME_STORAGE_KEY, 'dark');
    await act(async () => renderer.unmount());
  });
});
