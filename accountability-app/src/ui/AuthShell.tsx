import type { ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
          <View style={styles.logoWrap}>
            <Image source={require('../../assets/images/logo.png')} style={styles.logo} />
          </View>
          <Text style={styles.wordmark}>AccountAbility</Text>
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
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: '#fffffc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logo: { width: 60, height: 60 },
  wordmark: {
    fontFamily: font.display,
    fontSize: 34,
    color: '#fff',
    letterSpacing: 0.5,
  },
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
