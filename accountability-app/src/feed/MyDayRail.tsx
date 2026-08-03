import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '../ui/CachedImage';
import type { MyDayValues } from './SocialModeSelector';
import { colors, font, radius, spacing } from '../ui/theme';

const TILES = [
  { key: 'move', label: 'Move', icon: 'walk-outline', color: '#1d4ed8' },
  { key: 'fuel', label: 'Fuel', icon: 'flame-outline', color: '#ea580c' },
  { key: 'mind', label: 'Mind', icon: 'sparkles-outline', color: '#7c3aed' },
  { key: 'connect', label: 'Connect', icon: 'people-outline', color: '#0f766e' },
] as const;

const EMPTY_VALUES: MyDayValues = {
  move: { value: null, image: null },
  fuel: { value: null, image: null },
  mind: { value: null, image: null },
  connect: { value: null, image: null },
};

export function MyDayRail({ values = EMPTY_VALUES }: { values?: MyDayValues }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>My Day</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tiles}
        accessibilityLabel="My Day summary"
      >
        {TILES.map((tile) => {
          const value = values[tile.key];
          return (
            <View
              key={tile.key}
              style={styles.tile}
              accessible
              accessibilityLabel={`${tile.label}: ${value.value ?? 'Not set'}`}
            >
              {value.image ? (
                <CachedImage uri={value.image} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <LinearGradient
                  colors={[tile.color, `${tile.color}bb`]}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <View style={styles.scrim} pointerEvents="none" />
              <Ionicons name={tile.icon} size={17} color="#fff" style={styles.foreground} />
              <View style={styles.foreground}>
                <Text style={styles.tileLabel}>{tile.label}</Text>
                <Text style={styles.tileValue} numberOfLines={2}>{value.value ?? 'Not set'}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: colors.card,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  heading: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    color: colors.navy,
    fontFamily: font.bold,
    fontSize: 13,
  },
  tiles: { paddingHorizontal: spacing.md, gap: 6 },
  tile: {
    width: 86,
    height: 92,
    borderRadius: radius.md,
    padding: spacing.sm,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(4,18,45,.28)' },
  foreground: { zIndex: 1 },
  tileLabel: { color: '#fff', fontFamily: font.bold, fontSize: 12 },
  tileValue: { color: 'rgba(255,255,255,.88)', fontFamily: font.medium, fontSize: 10.5 },
});
