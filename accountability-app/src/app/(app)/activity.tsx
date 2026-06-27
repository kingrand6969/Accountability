import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

const PILLARS = [
  {
    key: 'gym',
    emoji: '🏋️',
    title: 'Exercise Library',
    sub: 'Browse 800+ exercises, filter & log',
    route: '/gym' as const,
    ready: true,
  },
  {
    key: 'diet',
    emoji: '🥗',
    title: 'Diet & Calories',
    sub: 'Track meals, calories & macros',
    route: '/diet' as const,
    ready: true,
  },
  {
    key: 'money',
    emoji: '💸',
    title: 'Money',
    sub: 'Income, expenses & budgets',
    route: null,
    ready: false,
  },
  {
    key: 'activity',
    emoji: '🏃',
    title: 'Activity',
    sub: 'GPS runs, rides & walks',
    route: null,
    ready: false,
  },
];

export default function Track() {
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.intro}>Your tracking tools. More coming each update.</Text>
      {PILLARS.map((p) => (
        <Pressable
          key={p.key}
          style={[styles.card, !p.ready && styles.cardDisabled]}
          onPress={() => {
            if (p.ready && p.route) router.push(p.route);
          }}
        >
          <Text style={styles.emoji}>{p.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{p.title}</Text>
            <Text style={styles.sub}>{p.sub}</Text>
          </View>
          <Text style={[styles.badge, p.ready && styles.badgeReady]}>
            {p.ready ? '›' : 'Soon'}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  intro: { color: '#666', marginBottom: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#f7f7f9',
    borderRadius: 14,
    padding: 18,
  },
  cardDisabled: { opacity: 0.55 },
  emoji: { fontSize: 30 },
  title: { fontSize: 17, fontWeight: '700' },
  sub: { color: '#666', marginTop: 2 },
  badge: { color: '#999', fontWeight: '700' },
  badgeReady: { color: '#2563eb', fontSize: 22 },
});
