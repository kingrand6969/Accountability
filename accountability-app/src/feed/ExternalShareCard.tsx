import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandMark } from '../ui/BrandMark';
import { colors, font } from '../ui/theme';

/**
 * A deliberately sanitized public derivative. It is rendered from approved
 * display copy only and never receives the post's private image/media URL.
 */
export const ExternalShareCard = forwardRef<View, { title: string; author: string | null }>(
  function ExternalShareCard({ title, author }, ref) {
    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        <LinearGradient
          colors={['#081A3A', '#0D3D83', '#155EEF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.orbitOne} />
        <View style={styles.orbitTwo} />
        <View style={styles.brand}>
          <BrandMark size={28} color="#FFFFFF" accessibilityLabel="AccountAbility" />
          <Text style={styles.wordmark}>Account<Text style={styles.ability}>Ability</Text></Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{author ? `${author} SHOWED UP` : 'A WIN WORTH SHARING'}</Text>
          <Text style={styles.title} numberOfLines={4}>{title.trim() || 'I showed up today.'}</Text>
          <Text style={styles.note}>Progress is proof of your promise.</Text>
        </View>
        <View style={styles.footer}>
          <Text style={styles.footerText}>Build consistency. Together.</Text>
          <Text style={styles.domain}>joinaccountability.app</Text>
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  card: {
    width: 1200,
    height: 630,
    overflow: 'hidden',
    backgroundColor: colors.navy,
    padding: 58,
    justifyContent: 'space-between',
  },
  orbitOne: { position: 'absolute', width: 560, height: 560, borderRadius: 280, borderWidth: 2, borderColor: 'rgba(255,255,255,0.12)', right: -130, top: -210 },
  orbitTwo: { position: 'absolute', width: 360, height: 360, borderRadius: 180, borderWidth: 2, borderColor: 'rgba(255,255,255,0.16)', right: -20, top: -100 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmark: { color: '#FFFFFF', fontFamily: font.extrabold, fontSize: 28 },
  ability: { color: '#9CC0FF' },
  copy: { maxWidth: 900 },
  eyebrow: { color: '#BFD2F4', fontFamily: font.bold, fontSize: 18, letterSpacing: 2.2 },
  title: { color: '#FFFFFF', fontFamily: 'Georgia', fontSize: 68, lineHeight: 76, marginTop: 18 },
  note: { color: '#D9E6FF', fontFamily: font.medium, fontStyle: 'italic', fontSize: 24, marginTop: 20 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { color: '#FFFFFF', fontFamily: font.semibold, fontSize: 20 },
  domain: { color: '#D9E6FF', fontFamily: font.bold, fontSize: 20 },
});
