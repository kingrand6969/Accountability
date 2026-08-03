import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { font, spacing } from '../ui/theme';

export function ProofHeadlineOverlay({ headline }: { headline: string }) {
  return (
    <View style={styles.overlay} pointerEvents="none">
      <Text style={styles.headline} numberOfLines={3}>{headline}</Text>
      <View style={styles.verified}>
        <Text style={styles.verifiedText}>Verified</Text>
        <Ionicons name="checkmark-circle-outline" size={25} color="#4f8cff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    top: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  headline: {
    flex: 1,
    color: '#fff',
    fontFamily: font.serif,
    fontSize: 28,
    lineHeight: 31,
    textShadowColor: 'rgba(0,0,0,.62)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  verified: { alignItems: 'center', transform: [{ rotate: '-6deg' }] },
  verifiedText: { color: '#72a4ff', fontFamily: font.handwritten, fontSize: 19, lineHeight: 20 },
});
