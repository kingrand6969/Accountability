import type { ReactNode } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { font, radius, spacing } from './theme';

/** Branded backdrop for the auth screens: gradient, wordmark, elevated form card. */
export function AuthShell({ children, glass = false }: { children: ReactNode; glass?: boolean }) {
  return (
    <SafeAreaView style={styles.screen}>
      <LinearGradient
        colors={['#60a5fa', '#2563eb', '#1e3a8a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.75, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
            <Text style={styles.tagline}>Build consistency. Together.</Text>
          </View>
          {glass ? (
            <View style={styles.glassFrame}>
              <BlurView intensity={Platform.OS === 'web' ? 40 : 55} tint="light" style={styles.glass}>
                <View style={styles.glassTint}>{children}</View>
              </BlurView>
            </View>
          ) : (
            <View style={styles.card}>{children}</View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1e40af' },
  keyboard: { flex: 1 },
  glowTop: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.16)',
    top: -100,
    right: -80,
  },
  glowBottom: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(96,165,250,0.2)',
    bottom: -150,
    left: -110,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  brand: { alignItems: 'center', gap: 5, marginBottom: spacing.lg },
  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logo: { width: 54, height: 54 },
  wordmark: {
    fontFamily: font.display,
    fontSize: 32,
    color: '#fff',
    letterSpacing: 0.5,
  },
  tagline: { fontFamily: font.medium, fontSize: 13.5, color: '#dbeafe' },
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
  glassFrame: {
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.48)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  glass: { overflow: 'hidden' },
  glassTint: {
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.76)',
  },
});
