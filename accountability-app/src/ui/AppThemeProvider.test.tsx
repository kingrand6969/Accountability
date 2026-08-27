import React from 'react';
import { Appearance, Platform, Pressable, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { AppThemeProvider, useAppTheme } from './AppThemeProvider';

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

function ThemeConsumer() {
  const { colors, mode, setMode } = useAppTheme();
  return (
    <Pressable accessibilityLabel="Choose light" onPress={() => setMode('light')}>
      <Text>{`${mode}:${colors.surface.canvas}:${colors.ink.action}`}</Text>
    </Pressable>
  );
}

function renderedValue(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByType(Text).props.children;
}

describe('AppThemeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatformOS(originalPlatformOS === 'web' ? 'ios' : originalPlatformOS);
  });

  test('provides the approved dark theme immediately', () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <AppThemeProvider>
          <ThemeConsumer />
        </AppThemeProvider>,
      );
    });

    expect(renderedValue(renderer)).toBe('dark:#0B0D0B:#B9FF3D');
    act(() => renderer.unmount());
  });

  test('keeps the dark theme when a consumer requests light mode', () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <AppThemeProvider>
          <ThemeConsumer />
        </AppThemeProvider>,
      );
    });

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Choose light' }).props.onPress());

    expect(renderedValue(renderer)).toBe('dark:#0B0D0B:#B9FF3D');
    act(() => renderer.unmount());
  });

  test('does not read or write a stored appearance preference', () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <AppThemeProvider>
          <ThemeConsumer />
        </AppThemeProvider>,
      );
    });
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Choose light' }).props.onPress());

    expect(mockedStorage.getItem).not.toHaveBeenCalled();
    expect(mockedStorage.setItem).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  test('synchronizes the native appearance to dark once when supported', () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <AppThemeProvider>
          <ThemeConsumer />
        </AppThemeProvider>,
      );
    });
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Choose light' }).props.onPress());

    expect(setColorSchemeSpy).toHaveBeenCalledTimes(1);
    expect(setColorSchemeSpy).toHaveBeenCalledWith('dark');
    act(() => renderer.unmount());
  });

  test('keeps rendering when native appearance synchronization is unavailable', () => {
    const setter = Appearance.setColorScheme;
    Object.defineProperty(Appearance, 'setColorScheme', {
      configurable: true,
      value: undefined,
    });
    let renderer!: TestRenderer.ReactTestRenderer;

    try {
      expect(() => {
        act(() => {
          renderer = TestRenderer.create(
            <AppThemeProvider>
              <ThemeConsumer />
            </AppThemeProvider>,
          );
        });
      }).not.toThrow();
      expect(renderedValue(renderer)).toBe('dark:#0B0D0B:#B9FF3D');
      act(() => renderer.unmount());
    } finally {
      Object.defineProperty(Appearance, 'setColorScheme', {
        configurable: true,
        value: setter,
      });
    }
  });
});
