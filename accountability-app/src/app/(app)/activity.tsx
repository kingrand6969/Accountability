import type { ComponentProps } from 'react';
import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, shadow, spacing } from '../../ui/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const PILLARS: {
  key: string;
  icon: IoniconName;
  tint: string;
  title: string;
  sub: string;
  route: '/gym' | '/diet' | '/money' | '/activity-track' | '/insights' | '/books';
}[] = [
  {
    key: 'insights',
    icon: 'stats-chart-outline',
    tint: '#2563eb',
    title: 'Progress & Insights',
    sub: 'Your day, week & month at a glance',
    route: '/insights',
  },
  {
    key: 'gym',
    icon: 'barbell-outline',
    tint: '#7c3aed',
    title: 'Exercise Library',
    sub: 'Browse 800+ exercises, filter & log',
    route: '/gym',
  },
  {
    key: 'diet',
    icon: 'nutrition-outline',
    tint: '#16a34a',
    title: 'Diet & Calories',
    sub: 'Track meals, calories & macros',
    route: '/diet',
  },
  {
    key: 'money',
    icon: 'wallet-outline',
    tint: '#dc2626',
    title: 'Money',
    sub: 'Income, expenses & budgets',
    route: '/money',
  },
  {
    key: 'activity',
    icon: 'walk-outline',
    tint: '#ea580c',
    title: 'Activity',
    sub: 'GPS runs, rides & walks',
    route: '/activity-track',
  },
  {
    key: 'books',
    icon: 'book-outline',
    tint: '#0d9488',
    title: 'Daily Reads',
    sub: 'A free e-book for your interests · Pro',
    route: '/books',
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
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => router.push(p.route)}
          accessibilityLabel={p.title}
        >
          <View style={[styles.iconBadge, { backgroundColor: `${p.tint}15` }]}>
            <Ionicons name={p.icon} size={26} color={p.tint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{p.title}</Text>
            <Text style={styles.sub}>{p.sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background },
  intro: { color: colors.textMuted, fontFamily: font.regular, marginBottom: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 76,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontFamily: font.bold, color: colors.text },
  sub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13.5, marginTop: 2 },
});
