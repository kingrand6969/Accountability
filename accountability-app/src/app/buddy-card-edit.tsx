import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  getMyBuddyCard,
  saveMyBuddyCard,
  getBuddyStats,
  getBoardRank,
  getCardMetrics,
  type BoardRank,
  type BuddyCard,
  type BuddyStats,
  type CardMetrics,
} from '../buddy/card';
import { BuddyCardFace } from '../buddy/BuddyCardFace';
import { getRank } from '../achievements/api';
import { getMyProfile } from '../profiles/api';
import { supabase } from '../lib/supabase';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { colors, font, radius, shadow, spacing } from '../ui/theme';

export default function BuddyCardEdit() {
  const router = useRouter();
  const [card, setCard] = useState<BuddyCard>({});
  const [saving, setSaving] = useState(false);
  const [myName, setMyName] = useState<string | null>(null);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [myArea, setMyArea] = useState<string | null>(null);
  const [myBio, setMyBio] = useState<string | null>(null);
  const [myStats, setMyStats] = useState<BuddyStats | null>(null);
  const [myBoardRank, setMyBoardRank] = useState<BoardRank | null>(null);
  const [myMetrics, setMyMetrics] = useState<CardMetrics | null>(null);
  const [myRankName, setMyRankName] = useState<string | null>(null);
  const [myMedals, setMyMedals] = useState<number | null>(null);
  const [myMedalList, setMyMedalList] = useState<{ id: string; tier: number }[] | null>(null);

  useEffect(() => {
    getMyBuddyCard().then(setCard).catch(() => {});
    getMyProfile()
      .then((p) => {
        setMyName(p?.display_name ?? null);
        setMyAvatar(p?.avatar_url ?? null);
        setMyArea(p?.area ?? null);
        setMyBio(p?.bio ?? null);
      })
      .catch(() => {});
    // live data so the preview shows exactly what visitors will see
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      getBuddyStats(uid).then(setMyStats).catch(() => {});
      getBoardRank(uid).then(setMyBoardRank).catch(() => {});
      getCardMetrics(uid).then(setMyMetrics).catch(() => {});
    });
    getRank()
      .then((r) => {
        setMyRankName(r.name);
        setMyMedals(r.earned);
        setMyMedalList(r.medalList);
      })
      .catch(() => {});
  }, []);

  // your own words, with a gentle fall-back to your profile so the card is never blank
  const headline = card.headline?.trim() || (myArea ? `Trains around ${myArea}` : null);
  const about =
    card.about?.trim() || myBio || 'They haven’t written anything yet — say hi and find out!';
  const previewCard: BuddyCard = {
    ...card,
    rank_name: myRankName ?? card.rank_name,
    medals: myMedals ?? card.medals,
    medals_list: myMedalList ?? card.medals_list,
  };

  async function onSave() {
    setSaving(true);
    try {
      const toSave: BuddyCard = {
        ...card,
        mode: 'custom',
        rank_name: myRankName ?? card.rank_name,
        medals: myMedals ?? card.medals,
      };
      await saveMyBuddyCard(toSave);
      showToast('Buddy card saved');
      router.back();
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Focus line</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Morning runs · 5k pace · looking for a jog partner"
        placeholderTextColor={colors.textFaint}
        value={card.headline ?? ''}
        onChangeText={(t) => setCard((c) => ({ ...c, headline: t }))}
        maxLength={90}
      />
      <Text style={styles.label}>About you</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="What are you working on? What kind of buddy do you want?"
        placeholderTextColor={colors.textFaint}
        value={card.about ?? ''}
        onChangeText={(t) => setCard((c) => ({ ...c, about: t }))}
        multiline
        maxLength={400}
      />
      <Text style={styles.hint}>
        Your card shows your rank, medals and stats automatically. Non-buddies also see any posts
        you marked “Show on Buddy Card”.
      </Text>

      {/* live preview — EXACTLY what a visitor sees (same component) */}
      <Text style={styles.sectionTitle}>How visitors see you</Text>
      <View style={styles.card}>
        <BuddyCardFace
          name={myName}
          area={myArea}
          avatar={myAvatar}
          memberSince="…"
          headline={headline}
          card={previewCard}
          stats={myStats}
          boardRank={myBoardRank}
          metrics={myMetrics}
          onPressMedals={() => router.push('/achievements' as never)}
        />
        <View style={styles.aboutBox}>
          <Text style={styles.aboutTitle}>Profile</Text>
          <Text style={styles.aboutText}>{about}</Text>
        </View>
      </View>

      <Button title="Save my buddy card" onPress={onSave} loading={saving} style={styles.save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.background,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  hint: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 4 },
  label: {
    fontSize: 13.5,
    fontFamily: font.semibold,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadow.card,
  },
  aboutBox: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  aboutTitle: { fontFamily: font.bold, fontSize: 13.5, color: colors.text, marginBottom: 4 },
  aboutText: {
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  save: { marginTop: spacing.lg },
});
