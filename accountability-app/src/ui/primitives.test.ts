import { describe, expect, it, jest } from '@jest/globals';
import { createElement, type ComponentType, type ReactElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Image, Text, View } from 'react-native';

import {
  CreamCard,
  EditorialHeading,
  HeroImageCard,
  heroForegroundTextStyle,
  IconButton,
  OutlinedButton,
  PrimaryButton,
  RoundedBottomSheetSurface,
} from './surfaces';
import { QuietTopTabs, SegmentedControl } from './navigation';
import { colors, radius, semanticColors, spacing, type } from './theme';

function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

function findPressables(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    (node) =>
      (node.type as { displayName?: string })?.displayName === 'Pressable' ||
      ((node.type as { name?: string })?.name === 'Pressable' &&
        typeof node.props.style === 'function'),
  );
}

function findDeepestByLabel(
  renderer: TestRenderer.ReactTestRenderer,
  accessibilityLabel: string,
) {
  return renderer.root
    .findAllByProps({ accessibilityLabel })
    .at(-1)!;
}

function srgbToLinear(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance([red, green, blue]: readonly number[]) {
  return (
    0.2126 * srgbToLinear(red) +
    0.7152 * srgbToLinear(green) +
    0.0722 * srgbToLinear(blue)
  );
}

function contrastRatio(
  foreground: readonly number[],
  background: readonly number[],
) {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function compositeOverWhite(rgba: string) {
  const match = rgba.match(
    /^rgba\((\d+),(\d+),(\d+),(0(?:\.\d+)?|1(?:\.0+)?)\)$/,
  );
  if (!match) throw new Error(`Expected an rgba color, received ${rgba}`);
  const [, red, green, blue, alpha] = match;
  const opacity = Number(alpha);
  return [red, green, blue].map(
    (channel) => Number(channel) * opacity + 255 * (1 - opacity),
  );
}

describe('AccountAbility shared primitives', () => {
  it('uses the editorial semantic type role and permits Dynamic Type wrapping', () => {
    const renderer = render(
      createElement(
        EditorialHeading,
        { accessibilityLabel: 'Journey heading' },
        'Show up for yourself.',
      ),
    );
    const heading = renderer.root.findByType(Text);

    expect(heading.props.accessibilityRole).toBe('header');
    expect(heading.props.accessibilityLabel).toBe('Journey heading');
    expect(heading.props.allowFontScaling).not.toBe(false);
    expect(heading.props.numberOfLines).toBeUndefined();
    expect(heading.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining(type.editorialHeading)]),
    );
  });

  const buttonCases: [string, ComponentType<any>, string, string][] = [
    ['primary', PrimaryButton, colors.primary, colors.onPrimary],
    ['outlined', OutlinedButton, semanticColors.surface.card, colors.primary],
  ];

  it.each(buttonCases)(
    'provides an accessible %s button with disabled and pressed states',
    (_name, Component, backgroundColor, textColor) => {
      const onPress = jest.fn();
      const renderer = render(
        createElement(Component as ComponentType<any>, {
          label: 'Continue',
          onPress,
          disabled: true,
          style: {
            width: 1,
            height: 1,
            minWidth: 1,
            minHeight: 1,
          },
        }),
      );
      const control = findPressables(renderer)[0];
      const label = renderer.root.findAllByType(Text).at(-1)!;

      expect(control.props.accessibilityRole).toBe('button');
      expect(control.props.accessibilityLabel).toBe('Continue');
      expect(control.props.accessibilityState).toEqual({ disabled: true });
      expect(control.props.disabled).toBe(true);
      const idleStyles = control.props.style({ pressed: false });
      expect(idleStyles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ backgroundColor }),
          expect.objectContaining({ opacity: 0.48 }),
        ]),
      );
      expect(idleStyles.at(-1)).toEqual(
        expect.objectContaining({
          minHeight: spacing.touch,
          minWidth: spacing.touch,
        }),
      );
      expect(control.props.style({ pressed: true })).toEqual(
        expect.arrayContaining([expect.objectContaining({ opacity: 0.86 })]),
      );
      expect(label.props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ color: textColor })]),
      );
    },
  );

  it('provides an icon-only button with a required label and square hit target', () => {
    const renderer = render(
      createElement(IconButton, {
        accessibilityLabel: 'Search',
        icon: createElement(Text, null, 'icon'),
        onPress: jest.fn(),
        selected: true,
        style: {
          width: 1,
          height: 1,
          minWidth: 1,
          minHeight: 1,
        },
      }),
    );
    const control = findPressables(renderer)[0];

    expect(control.props.accessibilityRole).toBe('button');
    expect(control.props.accessibilityLabel).toBe('Search');
    expect(control.props.accessibilityState).toEqual({ selected: true });
    expect(control.props.hitSlop).toBeGreaterThanOrEqual(0);
    expect(control.props.style({ pressed: false }).at(-1)).toEqual(
      expect.objectContaining({
        minHeight: spacing.touch,
        minWidth: spacing.touch,
      }),
    );
  });

  it('uses approved cream card and rounded bottom-sheet surfaces without safe-area assumptions', () => {
    const cardRenderer = render(
      createElement(
        CreamCard,
        { accessibilityLabel: 'Today summary' },
        createElement(Text, null, 'Summary'),
      ),
    );
    const card = findDeepestByLabel(cardRenderer, 'Today summary');
    expect(card.props.accessibilityRole).toBe('summary');
    expect(card.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: semanticColors.surface.canvas,
          borderRadius: radius.card,
        }),
      ]),
    );

    const sheetRenderer = render(
      createElement(
        RoundedBottomSheetSurface,
        { accessibilityLabel: 'Encouragement' },
        createElement(Text, null, 'Sheet'),
      ),
    );
    const sheet = findDeepestByLabel(sheetRenderer, 'Encouragement');
    expect(sheet.props.accessibilityRole).toBe('summary');
    expect(sheet.props.accessibilityViewIsModal).toBe(true);
    expect(sheet.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: semanticColors.surface.canvas,
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
        }),
      ]),
    );
    expect(sheet.props.style).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ paddingTop: expect.anything() }),
      ]),
    );
  });

  it('renders a semantic image-led card with accessible image and unrestricted content', () => {
    const renderer = render(
      createElement(
        HeroImageCard,
        {
          image: { uri: 'https://example.test/proof.jpg' },
          imageAccessibilityLabel: 'Morning run at sunrise',
          style: { minWidth: 1, minHeight: 1, width: 1, height: 1 },
        },
        createElement(Text, null, 'Morning run.'),
      ),
    );
    const image = renderer.root.findByType(Image);
    const card = renderer.root.findAllByType(View)[0];
    const layerOrder = renderer.root
      .findAll(
        (node) =>
          typeof node.props.testID === 'string' &&
          node.props.testID.startsWith('hero-image-card-'),
      )
      .map((node) => node.props.testID)
      .filter((testID, index, all) => all.indexOf(testID) === index);

    expect(image.props.accessibilityRole).toBe('image');
    expect(image.props.accessibilityLabel).toBe('Morning run at sunrise');
    expect(card.props.style.at(-1)).toEqual(
      expect.objectContaining({
        minHeight: spacing.touch,
        minWidth: spacing.touch,
      }),
    );
    expect(card.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ borderRadius: radius.card }),
      ]),
    );
    expect(layerOrder).toEqual([
      'hero-image-card-image',
      'hero-image-card-scrim',
      'hero-image-card-content',
    ]);
    expect(
      renderer.root.findByProps({ testID: 'hero-image-card-scrim' }).props.style,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          backgroundColor: expect.stringMatching(/^rgba\(/),
        }),
      ]),
    );
    const scrimStyle = renderer.root.findByProps({
      testID: 'hero-image-card-scrim',
    }).props.style;
    const scrimColor = scrimStyle.find(
      (entry: { backgroundColor?: string } | undefined) =>
        entry?.backgroundColor,
    ).backgroundColor;
    const worstCaseBackground = compositeOverWhite(scrimColor);
    expect(contrastRatio([255, 255, 255], worstCaseBackground)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      renderer.root.findByProps({ testID: 'hero-image-card-content' }).props
        .style,
    ).toEqual(
      expect.objectContaining({ padding: spacing.lg }),
    );
    expect(heroForegroundTextStyle).toEqual(
      expect.objectContaining({ color: semanticColors.ink.inverse }),
    );
    expect(renderer.root.findByType(Text).props.numberOfLines).toBeUndefined();
  });

  it('exposes a selectable segmented control with labels, state, disabled behavior, and 44pt targets', () => {
    const onChange = jest.fn();
    const renderer = render(
      createElement(SegmentedControl, {
        accessibilityLabel: 'Feed view',
        options: [
          { value: 'buddies', label: 'Buddies' },
          { value: 'discover', label: 'Discover', disabled: true },
        ],
        value: 'buddies',
        onChange,
        style: { minWidth: 1, minHeight: 1, width: 1, height: 1 },
      }),
    );
    const controls = findPressables(renderer);

    expect(
      findDeepestByLabel(renderer, 'Feed view').props.accessibilityRole,
    ).toBe('tablist');
    expect(controls[0].props.accessibilityRole).toBe('tab');
    expect(controls[0].props.accessibilityState).toEqual({
      selected: true,
      disabled: false,
    });
    expect(controls[0].props.style({ pressed: false }).at(-1)).toEqual(
      expect.objectContaining({
        minHeight: spacing.touch,
        minWidth: spacing.touch,
      }),
    );
    act(() => controls[0].props.onPress());
    expect(onChange).toHaveBeenCalledWith('buddies');
    expect(controls[1].props.disabled).toBe(true);
    expect(controls[1].props.accessibilityState.disabled).toBe(true);
  });

  it('exposes quiet top tabs with selected indicator and wrapping labels', () => {
    const renderer = render(
      createElement(QuietTopTabs, {
        accessibilityLabel: 'Finance sections',
        tabs: [
          { value: 'today', label: 'Today' },
          { value: 'goals', label: 'Goals' },
          { value: 'more', label: 'More' },
        ],
        value: 'goals',
        onChange: jest.fn(),
        style: { minWidth: 1, minHeight: 1, width: 1, height: 1 },
      }),
    );
    const controls = findPressables(renderer);
    const selected = controls[1];

    expect(
      findDeepestByLabel(renderer, 'Finance sections').props.accessibilityRole,
    ).toBe('tablist');
    expect(selected.props.accessibilityState.selected).toBe(true);
    expect(selected.props.style({ pressed: false }).at(-1)).toEqual(
      expect.objectContaining({
        minHeight: spacing.touch,
        minWidth: spacing.touch,
      }),
    );
    expect(
      renderer.root.findByProps({ testID: 'quiet-tab-indicator-goals' }).props
        .style,
    ).toEqual(expect.objectContaining({ backgroundColor: colors.navy }));
    expect(
      renderer.root.findAllByType(Text)[1].props.numberOfLines,
    ).toBeUndefined();
  });
});
