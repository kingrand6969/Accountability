import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { font, spacing } from './theme';
import { BrandMark } from './BrandMark';

type Props = {
  children: ReactNode;
  footer?: ReactNode;
  glass?: boolean;
  presentation?: 'default' | 'welcome';
};

const AUTH_CANVAS = '#0B0D0B';

/** Branded backdrop for the auth screens: gradient, wordmark, elevated form card. */
export function AuthShell({
  children,
  footer,
  glass = false,
  presentation = 'default',
}: Props) {
  const welcome = presentation === 'welcome';

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <Image
        source={require('../../assets/images/auth-mountain-hero.png')}
        style={[styles.heroImage, welcome && styles.welcomeHeroImage]}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <LinearGradient
        colors={['rgba(11,13,11,0.42)', 'rgba(11,13,11,0.72)', '#0B0D0B']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.75, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', 'rgba(5,7,5,0.84)']}
        style={styles.horizonShade}
        pointerEvents="none"
      />
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, welcome && styles.welcomeScroll]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.brand, welcome && styles.welcomeBrand]}>
            <BrandMark
              size={welcome ? 112 : 76}
              color="#FFFFFF"
              accessibilityLabel="AccountAbility logo"
            />
            <Text style={[styles.wordmark, welcome && styles.welcomeWordmark]}>
              Account<Text style={styles.ability}>Ability</Text>
            </Text>
            <Text style={styles.tagline}>Build consistency. Together.</Text>
          </View>
          {glass ? (
            <View style={styles.glassFrame}>
              <BlurView intensity={Platform.OS === 'web' ? 40 : 55} tint="light" style={styles.glass}>
                <View style={styles.glassTint}>{children}</View>
              </BlurView>
            </View>
          ) : (
            <View style={[styles.card, welcome && styles.welcomeCard]}>{children}</View>
          )}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AUTH_CANVAS },
  heroImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '58%',
  },
  welcomeHeroImage: { height: '100%' },
  keyboard: { flex: 1 },
  horizonShade: StyleSheet.absoluteFill,
  glowTop: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(185,255,61,0.16)',
    top: -100,
    right: -80,
  },
  glowBottom: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(185,255,61,0.14)',
    bottom: -150,
    left: -110,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  brand: { alignItems: 'center', gap: 4, marginBottom: spacing.xl },
  welcomeBrand: {
    marginTop: 52,
    marginBottom: 72,
  },
  wordmark: {
    fontFamily: font.extrabold,
    fontSize: 29,
    color: '#fff',
    letterSpacing: -1.1,
  },
  ability: { color: '#B9FF3D' },
  welcomeWordmark: { fontSize: 31 },
  tagline: { fontFamily: font.medium, fontSize: 13.5, color: '#EAF2E5' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: spacing.xl,
    gap: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  welcomeScroll: {
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  welcomeCard: {
    backgroundColor: '#F4F5F1',
    borderRadius: 22,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  footer: {
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
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
