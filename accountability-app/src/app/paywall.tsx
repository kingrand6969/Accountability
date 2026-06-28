import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsPro } from '../pro/ProProvider';

const BENEFITS = [
  'No ads',
  'Unlimited history + advanced insights',
  'Smart reminders & voice commands',
  'Gym Assist workout generator',
  'Diet & calorie tracker',
  'Accountability circles & challenges',
  'Data export (PDF / CSV)',
];

export default function Paywall() {
  const { isPro } = useIsPro();

  function onUpgrade() {
    Alert.alert(
      'Subscriptions coming soon',
      'In-app purchases launch with the store release — this is where checkout will open.',
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Accountability Pro</Text>
      <Text style={styles.subtitle}>Get more out of every day.</Text>

      <View style={styles.card}>
        {BENEFITS.map((b) => (
          <View key={b} style={styles.benefitRow}>
            <Text style={styles.check}>✓</Text>
            <Text style={styles.benefit}>{b}</Text>
          </View>
        ))}
      </View>

      <View style={styles.prices}>
        <View style={[styles.price, styles.priceHighlight]}>
          <Text style={styles.priceLabel}>Yearly</Text>
          <Text style={styles.priceValue}>$29.99</Text>
          <Text style={styles.priceNote}>best value · $2.50/mo</Text>
        </View>
        <View style={styles.price}>
          <Text style={styles.priceLabel}>Monthly</Text>
          <Text style={styles.priceValue}>$3.99</Text>
          <Text style={styles.priceNote}>per month</Text>
        </View>
      </View>

      {isPro ? (
        <View style={styles.proActive}>
          <Text style={styles.proActiveText}>⭐ You&apos;re on Pro</Text>
        </View>
      ) : (
        <Pressable style={styles.cta} onPress={onUpgrade}>
          <Text style={styles.ctaText}>Upgrade to Pro</Text>
        </Pressable>
      )}

      <Text style={styles.devNote}>
        Subscriptions launch with the store release — checkout opens here.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#666', fontSize: 16, marginBottom: 8 },
  card: {
    backgroundColor: '#f7f7f9',
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: { color: '#16a34a', fontSize: 16, fontWeight: '800' },
  benefit: { fontSize: 15, flex: 1 },
  prices: { flexDirection: 'row', gap: 12, marginTop: 8 },
  price: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 2,
  },
  priceHighlight: { borderColor: '#2563eb', borderWidth: 2 },
  priceLabel: { fontWeight: '700' },
  priceValue: { fontSize: 22, fontWeight: '800' },
  priceNote: { color: '#888', fontSize: 12 },
  cta: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  proActive: {
    backgroundColor: '#fffbe6',
    borderColor: '#f0c000',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  proActiveText: { fontSize: 16, fontWeight: '700', color: '#b58900' },
  devNote: { color: '#999', fontSize: 12, marginTop: 12, textAlign: 'center' },
  downgrade: { color: '#ef4444', textAlign: 'center', marginTop: 4 },
});
