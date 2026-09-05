import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAppTheme } from './AppThemeProvider';

type CrownDockRunActionProps = {
  focused: boolean;
};

const OUTER_HEX =
  'M44 1 C49 1 53 3 57 5 L77 17 C84 21 87 27 87 35 L87 57 C87 65 83 71 77 75 L57 87 C49 92 39 92 31 87 L11 75 C5 71 1 65 1 57 L1 35 C1 27 4 21 11 17 L31 5 C35 3 39 1 44 1 Z';

const INNER_HEX =
  'M44 7 C48 7 52 9 55 11 L72 21 C78 24 81 29 81 36 L81 56 C81 62 78 67 72 71 L55 81 C48 85 40 85 33 81 L16 71 C10 67 7 62 7 56 L7 36 C7 29 10 24 16 21 L33 11 C36 9 40 7 44 7 Z';

/** The enlarged, elevated Run action approved for the permanent tab bar. */
export function CrownDockRunAction({ focused }: CrownDockRunActionProps) {
  const { colors: theme } = useAppTheme();

  return (
    <View
      testID="crown-dock-run"
      pointerEvents="none"
      style={styles.root}
    >
      <View
        style={[
          styles.glow,
          {
            backgroundColor: theme.ink.action,
            opacity: focused ? 0.34 : 0.22,
          },
        ]}
      />
      <Svg
        width={76}
        height={80}
        viewBox="0 0 88 92"
        style={styles.hex}
      >
        <Path d={OUTER_HEX} fill={theme.surface.canvas} />
        <Path d={INNER_HEX} fill={theme.ink.action} />
      </Svg>
      <View style={styles.highlight} />
      <Ionicons
        name="walk"
        size={31}
        color={theme.ink.inverse}
        style={styles.icon}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: -24,
    width: 80,
    height: 88,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 4,
    elevation: 12,
  },
  glow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 2,
    height: 16,
    borderRadius: 999,
    transform: [{ scaleX: 1.18 }],
  },
  hex: {
    position: 'absolute',
    top: 0,
    shadowColor: '#000000',
    shadowOpacity: 0.42,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  highlight: {
    position: 'absolute',
    top: 10,
    width: 38,
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  icon: {
    position: 'absolute',
    top: 23,
  },
});
