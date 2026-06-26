import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useIsPro } from './ProProvider';

/**
 * Wrap any Pro-only feature. Pro users see the feature; free users see an
 * upsell card that opens the paywall.
 */
export function ProLock({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { isPro } = useIsPro();
  const router = useRouter();

  if (isPro) return <>{children}</>;

  return (
    <View style={styles.card}>
      <Text style={styles.badge}>⭐ PRO</Text>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      <Pressable style={styles.button} onPress={() => router.push('/paywall')}>
        <Text style={styles.buttonText}>Upgrade to Pro</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#f0c000',
    backgroundColor: '#fffdf5',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    alignItems: 'flex-start',
  },
  badge: { fontWeight: '800', color: '#b58900', fontSize: 12 },
  title: { fontSize: 16, fontWeight: '700' },
  desc: { color: '#666' },
  button: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  buttonText: { color: '#fff', fontWeight: '700' },
});
