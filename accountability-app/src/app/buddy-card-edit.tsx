import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  getMyBuddyCard,
  saveMyBuddyCard,
  getCardMetrics,
  type BuddyCard,
  type CardMetrics,
} from '../buddy/card';
import { PublicBuddyCardFace } from '../buddy/PublicBuddyCardFace';
import { getRank } from '../achievements/api';
import { getMyProfile } from '../profiles/api';
import { supabase } from '../lib/supabase';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { colors, font, radius, shadow, spacing } from '../ui/theme';

const TRAITS = [
  'Encouraging',
  'Consistent',
  'Goal focused',
  'Morning training',
  'Running',
  'Gym focused',
  'Competitive',
  'Beginner friendly',
  'Daily check-ins',
] as const;

export default function BuddyCardEdit() {
  const router = useRouter();
  const [card, setCard] = useState<BuddyCard>({});
  const [saving, setSaving] = useState(false);
  const [myName, setMyName] = useState<string | null>(null);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [myArea, setMyArea] = useState<string | null>(null);
  const [myCover, setMyCover] = useState<string | null>(null);
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
        setMyCover(p?.cover_url ?? null);
      })
      .catch(() => {});
    // live data so the preview shows exactly what visitors will see
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
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

  const headline = card.show_headline ? card.headline?.trim() || null : null;
  const about = card.show_bio ? card.about?.trim() || null : null;
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
        hero_url: card.show_hero ? card.hero_url ?? myCover : null,
        rank_name: myRankName ?? card.rank_name,
        medals: myMedals ?? card.medals,
        medals_list: myMedalList ?? card.medals_list,
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
        placeholder="e.g. Morning runs - 5k pace - looking for a jog partner"
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
      <Text style={styles.sectionTitle}>What non-buddies may see</Text>
      <Text style={styles.traitHint}>
        Every item below is off until you choose to share it.
      </Text>
      <PrivacyToggle
        label="Use my cover photo as the card hero"
        detail={myCover ? 'This makes your public card photo-led.' : 'Add a cover photo in Edit profile first.'}
        value={Boolean(card.show_hero && myCover)}
        disabled={!myCover}
        onChange={(value) =>
          setCard((current) => ({
            ...current,
            show_hero: value,
            hero_url: value ? myCover : null,
          }))
        }
      />
      <PrivacyToggle label="Show my focus line" value={card.show_headline === true} onChange={(value) => setCard((c) => ({ ...c, show_headline: value }))} />
      <PrivacyToggle label="Show my selected accountability traits" value={card.show_traits === true} onChange={(value) => setCard((c) => ({ ...c, show_traits: value }))} />
      <PrivacyToggle label="Show my area" value={card.show_area === true} onChange={(value) => setCard((c) => ({ ...c, show_area: value }))} />
      <PrivacyToggle label="Show my About text" value={card.show_bio === true} onChange={(value) => setCard((c) => ({ ...c, show_bio: value }))} />
      <PrivacyToggle label="Show my activity time" value={card.show_last_active === true} onChange={(value) => setCard((c) => ({ ...c, show_last_active: value }))} />
      <PrivacyToggle label="Show my momentum rank" value={card.show_rank === true} onChange={(value) => setCard((c) => ({ ...c, show_rank: value }))} />
      <PrivacyToggle label="Show my earned medals" value={card.show_medals === true} onChange={(value) => setCard((c) => ({ ...c, show_medals: value }))} />
      <PrivacyToggle label="Show consistency" value={card.show_consistency === true} onChange={(value) => setCard((c) => ({ ...c, show_consistency: value }))} />
      <PrivacyToggle label="Show points" value={card.show_points === true} onChange={(value) => setCard((c) => ({ ...c, show_points: value }))} />
      <PrivacyToggle label="Show distance" value={card.show_distance === true} onChange={(value) => setCard((c) => ({ ...c, show_distance: value }))} />
      <PrivacyToggle label="Show challenge wins" value={card.show_challenge_wins === true} onChange={(value) => setCard((c) => ({ ...c, show_challenge_wins: value }))} />
      <PrivacyToggle label="Show selected public posts" value={card.show_posts === true} onChange={(value) => setCard((c) => ({ ...c, show_posts: value }))} />
      <Text style={styles.label}>Your accountability style</Text>
      <Text style={styles.traitHint}>Choose up to three traits visitors should know.</Text>
      <View style={styles.traitGrid}>
        {TRAITS.map((trait) => {
          const selected = card.traits?.includes(trait) ?? false;
          const full = (card.traits?.length ?? 0) >= 3;
          return (
            <Pressable
              key={trait}
              onPress={() =>
                setCard((current) => ({
                  ...current,
                  traits: selected
                    ? (current.traits ?? []).filter((item) => item !== trait)
                    : [...(current.traits ?? []), trait].slice(0, 3),
                }))
              }
              disabled={!selected && full}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled: !selected && full }}
              style={({ pressed }) => [
                styles.trait,
                selected && styles.traitSelected,
                !selected && full && styles.traitDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.traitText, selected && styles.traitTextSelected]}>
                {trait}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>
        Non-buddies only see the items you enable. Posts must also be individually marked
        &quot;Show on Buddy Card&quot;.
      </Text>

      {/* Live preview uses the same component visitors see. */}
      <Text style={styles.sectionTitle}>How visitors see you</Text>
      <View style={styles.card}>
        <PublicBuddyCardFace
          name={myName}
          area={myArea}
          avatar={myAvatar}
          headline={headline}
          card={previewCard}
          metrics={myMetrics}
          onPressMedals={() => router.push('/achievements' as never)}
        />
        {about ? (
          <View style={styles.aboutBox}>
            <Text style={styles.aboutTitle}>About</Text>
            <Text style={styles.aboutText}>{about}</Text>
          </View>
        ) : null}
      </View>

      <Button title="Save my buddy card" onPress={onSave} loading={saving} style={styles.save} />
    </ScrollView>
  );
}

function PrivacyToggle({
  label,
  detail,
  value,
  disabled,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.toggleRow, disabled && styles.toggleDisabled]}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {detail ? <Text style={styles.toggleDetail}>{detail}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} />
    </View>
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
  traitHint: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted },
  traitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  toggleRow: {
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleDisabled: { opacity: 0.5 },
  toggleCopy: { flex: 1, paddingVertical: 8 },
  toggleLabel: { color: colors.text, fontFamily: font.semibold, fontSize: 13.5 },
  toggleDetail: { marginTop: 2, color: colors.textMuted, fontFamily: font.regular, fontSize: 11.5 },
  trait: {
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  traitSelected: { borderColor: colors.primary, backgroundColor: '#eff6ff' },
  traitDisabled: { opacity: 0.42 },
  traitText: { color: colors.textSecondary, fontFamily: font.semibold, fontSize: 12.5 },
  traitTextSelected: { color: colors.primary },
  pressed: { opacity: 0.75 },
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
