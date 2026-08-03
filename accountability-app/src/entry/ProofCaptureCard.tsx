import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { BrandMark } from '../ui/BrandMark';
import { font } from '../ui/theme';
import type { ProofExport, RenderAssetHandle } from './proofExport';

const PROOF_RUNNER_HERO = require('../../assets/images/proof-runner-hero-v1.webp');

function metricLabel(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

export type ProofCaptureRendererContext = Readonly<{
  dto: ProofExport;
  backgroundImage: RenderAssetHandle | null;
  routeImages: readonly RenderAssetHandle[];
  buddyPortraitImages: readonly RenderAssetHandle[];
  resolve: (handle: RenderAssetHandle) => string;
}>;

export function buildProofCardSummary(model: ProofExport): string {
  const details = [
    `${model.brand}.`,
    `${model.headline}`,
    `${metricLabel(model.metrics.workouts, 'workout')}.`,
    `${metricLabel(model.metrics.activities, 'activity', 'activities')}.`,
    `${model.metrics.streakDays} day streak.`,
    typeof model.locationLabel === 'string' ? `Location: ${model.locationLabel}.` : null,
    typeof model.amountDisplay === 'string' ? `Amount: ${model.amountDisplay}.` : null,
    Array.isArray(model.buddyDisplayNames) && model.buddyDisplayNames.length > 0
      ? `Buddies: ${model.buddyDisplayNames.join(', ')}.`
      : null,
    `${model.format} format.`,
  ];
  return details.filter(Boolean).join(' ');
}

export function ProofCaptureCard({ context }: { context: ProofCaptureRendererContext }) {
  const cardModel = context.dto;
  return (
    <ImageBackground
      source={PROOF_RUNNER_HERO}
      style={styles.card}
      resizeMode="cover"
      accessibilityIgnoresInvertColors
    >
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={styles.topScrim}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.88)']}
        locations={[0, 0.45, 1]}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      <View
        style={styles.cardContent}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <View style={styles.brandRow}>
          <BrandMark size={24} color="#FFFFFF" accessibilityLabel="AccountAbility" />
          <Text allowFontScaling={false} style={styles.brandTop}>
            Account<Text allowFontScaling={false} style={styles.brandAbility}>Ability</Text>
          </Text>
        </View>

        <View style={styles.bottomBlock}>
          <Text allowFontScaling={false} style={styles.proofHeadline}>
            {typeof cardModel.headline === 'string'
              ? cardModel.headline.replace(' today.', '\ntoday.')
              : null}
          </Text>

          <View style={styles.pills}>
            <View style={styles.pill}>
              <Ionicons name="barbell-outline" size={14} color="#fff" />
              <Text allowFontScaling={false} style={styles.pillText}>
                {metricLabel(cardModel.metrics.workouts, 'workout')}
              </Text>
            </View>
            <View style={styles.pill}>
              <Ionicons name="walk-outline" size={14} color="#fff" />
              <Text allowFontScaling={false} style={styles.pillText}>
                {metricLabel(cardModel.metrics.activities, 'activity', 'activities')}
              </Text>
            </View>
          </View>

          <Text allowFontScaling={false} style={styles.tagline}>
            {cardModel.metrics.streakDays > 0
              ? `${metricLabel(cardModel.metrics.streakDays, 'day')} of keeping my promise.`
              : 'Progress is proof of my promise.'}
          </Text>
          {typeof cardModel.locationLabel === 'string' ? (
            <View style={styles.proofMeta}>
              <Ionicons name="location" size={13} color="#FFFFFF" />
              <Text allowFontScaling={false} style={styles.proofMetaText}>
                {cardModel.locationLabel}
              </Text>
            </View>
          ) : null}
          {typeof cardModel.amountDisplay === 'string' ? (
            <View style={styles.proofMeta}>
              <Ionicons name="cash" size={13} color="#FFFFFF" />
              <Text allowFontScaling={false} style={styles.proofMetaText}>
                {cardModel.amountDisplay}
              </Text>
            </View>
          ) : null}
          {Array.isArray(cardModel.buddyDisplayNames) &&
          typeof cardModel.buddyDisplayNames[0] === 'string' ? (
            <View style={styles.proofMeta}>
              <Ionicons name="people-outline" size={13} color="#FFFFFF" />
              <Text allowFontScaling={false} style={styles.proofMetaText}>
                {cardModel.buddyDisplayNames[0]}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, width: '100%' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 82 },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '66%' },
  cardContent: { flex: 1, padding: 16, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandTop: {
    color: 'rgba(255,255,255,0.95)',
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 14,
    letterSpacing: 1,
  },
  brandAbility: { color: '#60A5FA' },
  bottomBlock: { gap: 8 },
  proofHeadline: {
    color: '#FFFFFF',
    fontFamily: font.extrabold,
    fontSize: 32,
    lineHeight: 33,
    letterSpacing: -0.8,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 7,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  pillText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  tagline: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  proofMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  proofMetaText: { color: '#FFFFFF', fontFamily: font.semibold, fontSize: 12 },
});
