import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { font, radius, spacing } from './theme';

/** Branded backdrop for the auth screens: gradient, wordmark, elevated form card. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#3b82f6', '#2563eb', '#1e40af']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.flameWrap}>
            <BlurView
              intensity={24}
              tint="light"
              style={[StyleSheet.absoluteFill, { borderRadius: 34 }]}
            />
            <Ionicons name="flame" size={30} color="#fde68a" />
          </View>
          <Text style={styles.wordmark}>
            Account<Text style={styles.wordmarkAccent}>Ability</Text>
          </Text>
          <Text style={styles.tagline}>Achieve. Consistency.</Text>
        </View>
        <View style={styles.card}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1e40af' },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  brand: { alignItems: 'center', gap: 6, marginBottom: spacing.xl },
  flameWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  wordmark: {
    fontFamily: font.display,
    fontSize: 34,
    color: '#fff',
    letterSpacing: 0.5,
  },
  wordmarkAccent: { color: '#fde68a' },
  tagline: { fontFamily: font.medium, fontSize: 14, color: '#dbeafe' },
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
});
