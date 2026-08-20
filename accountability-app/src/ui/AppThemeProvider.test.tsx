import React from 'react';
import { Appearance, Platform, Pressable, Text } from 'react-native';
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
const setColorSchemeSpy = jest
  .spyOn(Appearance, 'setColorScheme')
  .mockImplementation(() => undefined);
const originalPlatformOS = Platform.OS;

function setPlatformOS(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
}

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
    setPlatformOS(originalPlatformOS === 'web' ? 'ios' : originalPlatformOS);
    mockedStorage.setItem.mockResolvedValue(undefined);
  });

  test('keeps manual theme context working on web without calling the native appearance setter', () => {
    setPlatformOS('web');
    mockedStorage.getItem.mockReturnValueOnce(deferred<string | null>().promise);
    let renderer!: TestRenderer.ReactTestRenderer;

    expect(() => {
      act(() => {
        renderer = TestRenderer.create(
          <AppThemeProvider>
            <Probe />
          </AppThemeProvider>,
        );
      });
    }).not.toThrow();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Choose dark' }).props.onPress());

    expect(value(renderer)).toBe('dark:#07111F');
    expect(setColorSchemeSpy).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  test('keeps rendering natively when the appearance setter is unavailable', () => {
    const setter = Appearance.setColorScheme;
    Object.defineProperty(Appearance, 'setColorScheme', {
      configurable: true,
      value: undefined,
    });
    mockedStorage.getItem.mockReturnValueOnce(deferred<string | null>().promise);
    let renderer!: TestRenderer.ReactTestRenderer;

    try {
      expect(() => {
        act(() => {
          renderer = TestRenderer.create(
            <AppThemeProvider>
              <Probe />
            </AppThemeProvider>,
          );
        });
      }).not.toThrow();
      expect(value(renderer)).toBe('light:#F7F4EC');
      act(() => renderer.unmount());
    } finally {
      Object.defineProperty(Appearance, 'setColorScheme', {
        configurable: true,
        value: setter,
      });
    }
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
    expect(setColorSchemeSpy).toHaveBeenCalledWith('light');
    act(() => renderer.unmount());
  });

  test('synchronizes the native appearance after hydrating a saved dark preference', async () => {
    mockedStorage.getItem.mockResolvedValueOnce('dark');
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <AppThemeProvider>
          <Probe />
        </AppThemeProvider>,
      );
    });

    expect(value(renderer)).toBe('dark:#07111F');
    expect(setColorSchemeSpy.mock.calls).toEqual([['light'], ['dark']]);
    await act(async () => renderer.unmount());
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
    expect(setColorSchemeSpy).toHaveBeenLastCalledWith('dark');
    await act(async () => renderer.unmount());
  });

  test('does not let late hydration override a manual selection or its native appearance', async () => {
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

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Choose dark' }).props.onPress());
    await act(async () => pending.resolve('light'));

    expect(value(renderer)).toBe('dark:#07111F');
    expect(setColorSchemeSpy.mock.calls).toEqual([['light'], ['dark']]);
    await act(async () => renderer.unmount());
  });
});
