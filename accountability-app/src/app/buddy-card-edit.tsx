import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/build/react-navigation/core/usePreventRemove';

import { getRank } from '../achievements/api';
import { MEDALS, medalState } from '../achievements/catalog';
import { Medal } from '../achievements/Medal';
import {
  getBoardRank,
  getBuddyStats,
  getCardMetrics,
  getMyBuddyCard,
  saveMyBuddyCard,
  type BoardRank,
  type BuddyCard,
  type BuddyStats,
  type CardMetrics,
} from '../buddy/card';
import {
  buddyCardEditorFingerprint,
  buildBuddyCardEditorPatch,
  createSynchronousSubmitLock,
  loadBuddyCardEditorData,
  moveFeaturedMedal,
  shouldPreventBuddyCardEditorExit,
  toggleFeaturedMedal,
} from '../buddy/editorModel';
import { MAX_FEATURED_MEDALS, normalizeFeaturedMedalIds } from '../buddy/featuredMedals';
import {
  BUDDY_CARD_PALETTE_KEYS,
  resolveBuddyCardPalette,
  type BuddyCardPaletteKey,
} from '../buddy/palette';
import { PublicBuddyCardFace } from '../buddy/PublicBuddyCardFace';
import { supabase } from '../lib/supabase';
import { getMyProfile } from '../profiles/api';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { font, radius, shadow, spacing } from '../ui/theme';

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

const PALETTE_NAMES: Record<BuddyCardPaletteKey, string> = {
  polar_blue: 'Polar Blue',
  victory_ember: 'Victory Ember',
  momentum_teal: 'Momentum Teal',
  power_violet: 'Power Violet',
};

const ACCOUNT_CHANGED = 'Account changed. Review your Buddy Card and try again.';

type MedalSnapshot = { id: string; tier: number };

export default function BuddyCardEdit() {
  const router = useRouter();
  const navigation = useNavigation();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const editorPalette = resolveBuddyCardPalette('polar_blue', scheme);

  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const expectedOwnerRef = useRef<string | null>(null);
  const savingRef = useRef(createSynchronousSubmitLock());

  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [card, setCard] = useState<BuddyCard>({});
  const [paletteKey, setPaletteKey] = useState<BuddyCardPaletteKey>('polar_blue');
  const [featuredMedalIds, setFeaturedMedalIds] = useState<string[]>([]);
  const [baselineFingerprint, setBaselineFingerprint] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [myName, setMyName] = useState<string | null>(null);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [myArea, setMyArea] = useState<string | null>(null);
  const [myMemberSince, setMyMemberSince] = useState('—');
  const [myLastActive, setMyLastActive] = useState<string | null>(null);
  const [myStats, setMyStats] = useState<BuddyStats | null>(null);
  const [myBoardRank, setMyBoardRank] = useState<BoardRank | null>(null);
  const [myMetrics, setMyMetrics] = useState<CardMetrics | null>(null);
  const [myRankName, setMyRankName] = useState<string | null>(null);
  const [myMedals, setMyMedals] = useState<number | null>(null);
  const [myMedalList, setMyMedalList] = useState<MedalSnapshot[]>([]);

  const draftCard = useMemo<BuddyCard>(
    () => ({ ...card, palette_key: paletteKey, featured_medal_ids: featuredMedalIds }),
    [card, featuredMedalIds, paletteKey],
  );
  const currentFingerprint = buddyCardEditorFingerprint(draftCard);
  const dirty = shouldPreventBuddyCardEditorExit(
    baselineFingerprint,
    currentFingerprint,
    saving,
  );

  usePreventRemove(dirty, ({ data }) => {
    Alert.alert(
      'Discard unsaved Buddy Card changes?',
      'Your appearance and sharing changes have not been saved.',
      [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(data.action),
        },
      ],
    );
  });

  const load = useCallback(async (generation: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: authAtStart } = await supabase.auth.getUser();
      const ownerId = authAtStart.user?.id ?? null;
      if (!ownerId) throw new Error('Sign in to edit your Buddy Card.');

      expectedOwnerRef.current = ownerId;
      const {
        card: storedCard,
        profile,
        rank,
        metrics,
        stats,
        boardRank,
      } = await loadBuddyCardEditorData(ownerId, {
        card: getMyBuddyCard,
        profile: getMyProfile,
        rank: () => getRank({ expectedOwnerId: ownerId, snapshot: false }),
        metrics: getCardMetrics,
        stats: getBuddyStats,
        boardRank: getBoardRank,
      });
      const { data: authAtEnd } = await supabase.auth.getUser();
      if (
        !mountedRef.current ||
        generation !== generationRef.current ||
        authAtEnd.user?.id !== ownerId
      ) {
        return;
      }

      const earnedIds = rank.medalList.map((medal) => medal.id);
      const selected = normalizeFeaturedMedalIds(storedCard.featured_medal_ids, earnedIds);
      const resolvedPalette = BUDDY_CARD_PALETTE_KEYS.includes(
        storedCard.palette_key as BuddyCardPaletteKey,
      )
        ? (storedCard.palette_key as BuddyCardPaletteKey)
        : 'polar_blue';
      const normalizedDraft: BuddyCard = {
        ...storedCard,
        palette_key: resolvedPalette,
        featured_medal_ids: selected,
      };

      setCard(storedCard);
      setPaletteKey(resolvedPalette);
      setFeaturedMedalIds(selected);
      setBaselineFingerprint(buddyCardEditorFingerprint(normalizedDraft));
      setMyName(profile?.display_name ?? null);
      setMyAvatar(profile?.avatar_url ?? null);
      setMyArea(profile?.area ?? null);
      setMyMemberSince(
        profile?.created_at
          ? new Date(profile.created_at).toLocaleDateString(undefined, {
              month: 'short',
              year: 'numeric',
            })
          : '—',
      );
      setMyLastActive(profile?.last_active_at ?? null);
      setMyRankName(rank.name);
      setMyMedals(rank.earned);
      setMyMedalList(rank.medalList);
      setMyMetrics(metrics);
      setMyStats(stats);
      setMyBoardRank(boardRank);
      setLoading(false);
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      setLoadError(String((error as Error).message ?? error));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const generation = ++generationRef.current;
    void load(generation);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const expectedOwner = expectedOwnerRef.current;
      if (!expectedOwner || session?.user.id === expectedOwner) return;
      generationRef.current += 1;
      expectedOwnerRef.current = null;
      savingRef.current.release();
      setSaving(false);
      setBaselineFingerprint(null);
      setCard({});
      setFeaturedMedalIds([]);
      setLoadError(ACCOUNT_CHANGED);
      setLoading(false);
    });
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      expectedOwnerRef.current = null;
      data.subscription.unsubscribe();
    };
  }, [load, reloadKey]);

  const earnedIds = useMemo(() => myMedalList.map((medal) => medal.id), [myMedalList]);
  const headline = card.show_headline ? card.headline?.trim() || null : null;
  const about = card.show_bio ? card.about?.trim() || null : null;
  const previewCard: BuddyCard = {
    ...card,
    palette_key: paletteKey,
    featured_medal_ids: featuredMedalIds,
    rank_name: myRankName ?? card.rank_name,
    medals: myMedals ?? card.medals,
    medals_list: myMedalList.length > 0 ? myMedalList : card.medals_list,
  };

  function updateMedalSelection(id: string) {
    const result = toggleFeaturedMedal(featuredMedalIds, id, earnedIds);
    setFeaturedMedalIds(result.ids);
    setSelectionNotice(
      result.limitReached ? 'Four medals are already featured. Remove one to add another.' : null,
    );
  }

  async function onSave() {
    if (!savingRef.current.tryAcquire()) return;
    const expectedOwnerId = expectedOwnerRef.current;
    if (!expectedOwnerId) {
      savingRef.current.release();
      Alert.alert('Could not save', ACCOUNT_CHANGED);
      return;
    }

    setSaving(true);
    const generation = generationRef.current;
    try {
      const toSave = buildBuddyCardEditorPatch(draftCard, earnedIds);
      await saveMyBuddyCard(toSave, expectedOwnerId);
      if (
        !mountedRef.current ||
        generation !== generationRef.current ||
        expectedOwnerRef.current !== expectedOwnerId
      ) {
        return;
      }
      const savedDraft = { ...card, ...toSave };
      setCard(savedDraft);
      setPaletteKey(toSave.palette_key);
      setFeaturedMedalIds(toSave.featured_medal_ids);
      setBaselineFingerprint(buddyCardEditorFingerprint(savedDraft));
      showToast('Buddy Card saved');
      setSaving(false);
      savingRef.current.release();
      requestAnimationFrame(() => {
        if (mountedRef.current && generation === generationRef.current) router.back();
      });
    } catch (error) {
      const { data: authAfterFailure } = await supabase.auth.getUser();
      if (
        mountedRef.current &&
        generation === generationRef.current &&
        expectedOwnerRef.current === expectedOwnerId &&
        authAfterFailure.user?.id === expectedOwnerId
      ) {
        Alert.alert('Could not save', String((error as Error).message ?? error));
      }
    } finally {
      if (mountedRef.current && generation === generationRef.current) {
        savingRef.current.release();
        setSaving(false);
      }
    }
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: editorPalette.canvas }]}>
        <ActivityIndicator color={editorPalette.accent} />
        <Text style={[styles.statusText, { color: editorPalette.textMuted }]}>Loading your Buddy Card…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.centered, { backgroundColor: editorPalette.canvas }]}>
        <Ionicons name="alert-circle-outline" size={34} color={editorPalette.accent} />
        <Text style={[styles.errorTitle, { color: editorPalette.text }]}>Could not load your Buddy Card</Text>
        <Text style={[styles.statusText, { color: editorPalette.textMuted }]}>{loadError}</Text>
        <Button title="Try again" onPress={() => setReloadKey((value) => value + 1)} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: editorPalette.canvas }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.sectionTitle, { color: editorPalette.textMuted }]}>Appearance</Text>
      <Text style={[styles.traitHint, { color: editorPalette.textMuted }]}>Choose a clean color atmosphere. Rank and medal colors stay official.</Text>
      <View accessibilityRole="radiogroup" style={styles.paletteList}>
        {BUDDY_CARD_PALETTE_KEYS.map((optionKey) => {
          const selected = paletteKey === optionKey;
          const option = resolveBuddyCardPalette(optionKey, scheme);
          return (
            <Pressable
              key={optionKey}
              onPress={() => setPaletteKey(optionKey)}
              accessibilityRole="radio"
              accessibilityLabel={PALETTE_NAMES[optionKey]}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.paletteOption,
                { backgroundColor: option.surface, borderColor: selected ? option.accent : option.border },
                selected && { borderWidth: 2 },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.swatches}>
                <View style={[styles.swatch, { backgroundColor: option.accent }]} />
                <View style={[styles.swatch, { backgroundColor: option.accentSecondary }]} />
              </View>
              <Text style={[styles.paletteName, { color: option.text }]}>{PALETTE_NAMES[optionKey]}</Text>
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={selected ? option.accent : option.textMuted}
              />
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { color: editorPalette.textMuted }]}>Featured medals</Text>
      <Text style={[styles.traitHint, { color: editorPalette.textMuted }]}>You can feature up to four medals. Their order here is their order on your card.</Text>
      {featuredMedalIds.length >= MAX_FEATURED_MEDALS ? (
        <Text accessibilityLiveRegion="polite" style={[styles.limitText, { color: editorPalette.accent }]}>Four medals selected. Remove one before choosing another.</Text>
      ) : null}
      {selectionNotice ? (
        <Text accessibilityLiveRegion="polite" style={[styles.limitText, { color: editorPalette.accent }]}>{selectionNotice}</Text>
      ) : null}
      {myMedalList.length === 0 ? (
        <Text style={[styles.emptyText, { color: editorPalette.textMuted }]}>Earn your first medal to feature it here.</Text>
      ) : (
        <View style={styles.medalList}>
          {myMedalList.map((snapshot) => {
            const definition = MEDALS.find((medal) => medal.id === snapshot.id);
            if (!definition) return null;
            const selectedIndex = featuredMedalIds.indexOf(snapshot.id);
            const selected = selectedIndex >= 0;
            const full = featuredMedalIds.length >= MAX_FEATURED_MEDALS;
            const tier = Math.max(0, Math.min(snapshot.tier, definition.tiers.length - 1));
            const state = medalState(definition, definition.tiers[tier]?.at ?? 0);
            return (
              <View
                key={snapshot.id}
                style={[
                  styles.medalRow,
                  { backgroundColor: editorPalette.surface, borderColor: selected ? editorPalette.accent : editorPalette.border },
                ]}
              >
                <Pressable
                  onPress={() => updateMedalSelection(snapshot.id)}
                  disabled={!selected && full}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Feature ${definition.title}`}
                  accessibilityHint={selected ? 'Removes this medal from your Buddy Card' : 'Adds this medal to your Buddy Card'}
                  accessibilityState={{ checked: selected, disabled: !selected && full }}
                  style={({ pressed }) => [styles.medalSelect, pressed && styles.pressed, !selected && full && styles.disabled]}
                >
                  <Medal state={state} size={48} animate={false} />
                  <View style={styles.medalCopy}>
                    <Text style={[styles.medalTitle, { color: editorPalette.text }]}>{definition.title}</Text>
                    <Text style={[styles.medalTier, { color: editorPalette.textMuted }]}>{state.tierName}{selected ? ` · Position ${selectedIndex + 1}` : ''}</Text>
                  </View>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'add-circle-outline'}
                    size={24}
                    color={selected ? editorPalette.accent : editorPalette.textMuted}
                  />
                </Pressable>
                {selected ? (
                  <View style={styles.orderActions}>
                    <Pressable
                      onPress={() => setFeaturedMedalIds(moveFeaturedMedal(featuredMedalIds, snapshot.id, -1, earnedIds))}
                      disabled={selectedIndex === 0}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${definition.title} earlier`}
                      accessibilityState={{ disabled: selectedIndex === 0 }}
                      style={[styles.orderButton, selectedIndex === 0 && styles.disabled]}
                    >
                      <Ionicons name="chevron-up" size={20} color={editorPalette.accent} />
                    </Pressable>
                    <Pressable
                      onPress={() => setFeaturedMedalIds(moveFeaturedMedal(featuredMedalIds, snapshot.id, 1, earnedIds))}
                      disabled={selectedIndex === featuredMedalIds.length - 1}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${definition.title} later`}
                      accessibilityState={{ disabled: selectedIndex === featuredMedalIds.length - 1 }}
                      style={[styles.orderButton, selectedIndex === featuredMedalIds.length - 1 && styles.disabled]}
                    >
                      <Ionicons name="chevron-down" size={20} color={editorPalette.accent} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <Text style={[styles.sectionTitle, { color: editorPalette.textMuted }]}>Profile text</Text>
      <Text style={[styles.label, { color: editorPalette.text }]}>Focus line</Text>
      <TextInput
        style={[styles.input, { color: editorPalette.text, backgroundColor: editorPalette.surface, borderColor: editorPalette.border }]}
        placeholder="e.g. Morning runs · 5K pace · looking for a jog partner"
        placeholderTextColor={editorPalette.textMuted}
        value={card.headline ?? ''}
        onChangeText={(headlineValue) => setCard((current) => ({ ...current, headline: headlineValue }))}
        maxLength={90}
      />
      <Text style={[styles.label, { color: editorPalette.text }]}>About you</Text>
      <TextInput
        style={[styles.input, styles.multiline, { color: editorPalette.text, backgroundColor: editorPalette.surface, borderColor: editorPalette.border }]}
        placeholder="What are you working on? What kind of buddy do you want?"
        placeholderTextColor={editorPalette.textMuted}
        value={card.about ?? ''}
        onChangeText={(aboutValue) => setCard((current) => ({ ...current, about: aboutValue }))}
        multiline
        maxLength={400}
      />

      <Text style={[styles.sectionTitle, { color: editorPalette.textMuted }]}>What non-buddies may see</Text>
      <Text style={[styles.traitHint, { color: editorPalette.textMuted }]}>Every item below is off until you choose to share it.</Text>
      <PrivacyToggle label="Show my focus line" value={card.show_headline === true} onChange={(value) => setCard((current) => ({ ...current, show_headline: value }))} palette={editorPalette} />
      <PrivacyToggle label="Show my selected accountability traits" value={card.show_traits === true} onChange={(value) => setCard((current) => ({ ...current, show_traits: value }))} palette={editorPalette} />
      <PrivacyToggle label="Show my area" value={card.show_area === true} onChange={(value) => setCard((current) => ({ ...current, show_area: value }))} palette={editorPalette} />
      <PrivacyToggle label="Show my About text" value={card.show_bio === true} onChange={(value) => setCard((current) => ({ ...current, show_bio: value }))} palette={editorPalette} />
      <PrivacyToggle label="Show my activity time" value={card.show_last_active === true} onChange={(value) => setCard((current) => ({ ...current, show_last_active: value }))} palette={editorPalette} />
      <PrivacyToggle label="Show my momentum rank" value={card.show_rank === true} onChange={(value) => setCard((current) => ({ ...current, show_rank: value }))} palette={editorPalette} />
      <PrivacyToggle label="Show my earned medals" value={card.show_medals === true} onChange={(value) => setCard((current) => ({ ...current, show_medals: value }))} palette={editorPalette} />
      <PrivacyToggle label="Show consistency" value={card.show_consistency === true} onChange={(value) => setCard((current) => ({ ...current, show_consistency: value }))} palette={editorPalette} />
      <PrivacyToggle label="Show points" value={card.show_points === true} onChange={(value) => setCard((current) => ({ ...current, show_points: value }))} palette={editorPalette} />
      <PrivacyToggle label="Show distance" value={card.show_distance === true} onChange={(value) => setCard((current) => ({ ...current, show_distance: value }))} palette={editorPalette} />
      <PrivacyToggle label="Show challenge wins" value={card.show_challenge_wins === true} onChange={(value) => setCard((current) => ({ ...current, show_challenge_wins: value }))} palette={editorPalette} />
      <PrivacyToggle label="Show selected public posts" value={card.show_posts === true} onChange={(value) => setCard((current) => ({ ...current, show_posts: value }))} palette={editorPalette} />

      <Text style={[styles.label, { color: editorPalette.text }]}>Your accountability style</Text>
      <Text style={[styles.traitHint, { color: editorPalette.textMuted }]}>Choose up to three traits visitors should know.</Text>
      <View style={styles.traitGrid}>
        {TRAITS.map((trait) => {
          const selected = card.traits?.includes(trait) ?? false;
          const full = (card.traits?.length ?? 0) >= 3;
          return (
            <Pressable
              key={trait}
              onPress={() => setCard((current) => ({
                ...current,
                traits: selected
                  ? (current.traits ?? []).filter((item) => item !== trait)
                  : [...(current.traits ?? []), trait].slice(0, 3),
              }))}
              disabled={!selected && full}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled: !selected && full }}
              style={({ pressed }) => [
                styles.trait,
                { backgroundColor: selected ? editorPalette.surfaceTint : editorPalette.surface, borderColor: selected ? editorPalette.accent : editorPalette.border },
                !selected && full && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.traitText, { color: selected ? editorPalette.accent : editorPalette.text }]}>{trait}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: editorPalette.textMuted }]}>Non-buddies only see enabled items. Posts must also be individually marked “Show on Buddy Card”.</Text>

      <Text style={[styles.sectionTitle, { color: editorPalette.textMuted }]}>Live preview</Text>
      <View style={[styles.card, { backgroundColor: editorPalette.canvas, borderColor: editorPalette.border }]}>
        <PublicBuddyCardFace
          name={myName}
          area={myArea}
          avatar={myAvatar}
          memberSince={myMemberSince}
          lastActive={myLastActive}
          headline={headline}
          card={previewCard}
          stats={myStats}
          boardRank={myBoardRank}
          metrics={myMetrics}
          ownerView
          onPressMedals={() => router.push('/achievements' as never)}
        />
        {about ? (
          <View style={[styles.aboutBox, { backgroundColor: editorPalette.surface, borderColor: editorPalette.border }]}>
            <Text style={[styles.aboutTitle, { color: editorPalette.text }]}>About</Text>
            <Text style={[styles.aboutText, { color: editorPalette.textMuted }]}>{about}</Text>
          </View>
        ) : null}
      </View>

      <Button title="Save my Buddy Card" onPress={onSave} loading={saving} style={styles.save} />
    </ScrollView>
  );
}

function PrivacyToggle({
  label,
  value,
  onChange,
  palette,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  palette: ReturnType<typeof resolveBuddyCardPalette>;
}) {
  return (
    <View style={[styles.toggleRow, { borderBottomColor: palette.border }]}>
      <Text style={[styles.toggleLabel, { color: palette.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ false: palette.border, true: palette.accentSecondary }}
        thumbColor={value ? palette.accent : palette.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  statusText: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  errorTitle: { fontFamily: font.bold, fontSize: 18, textAlign: 'center' },
  container: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 48 },
  sectionTitle: { fontSize: 12, fontFamily: font.bold, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.lg },
  paletteList: { gap: 10, marginTop: 4 },
  paletteOption: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  swatches: { flexDirection: 'row' },
  swatch: { width: 22, height: 32, borderRadius: 8, marginRight: -5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  paletteName: { flex: 1, fontFamily: font.semibold, fontSize: 14 },
  traitHint: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 18 },
  limitText: { fontFamily: font.semibold, fontSize: 12.5, lineHeight: 18 },
  emptyText: { fontFamily: font.regular, fontSize: 13, paddingVertical: spacing.md },
  medalList: { gap: 10, marginTop: 4 },
  medalRow: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden', flexDirection: 'row', alignItems: 'stretch' },
  medalSelect: { minHeight: 64, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  medalCopy: { flex: 1 },
  medalTitle: { fontFamily: font.semibold, fontSize: 14 },
  medalTier: { fontFamily: font.regular, fontSize: 12, marginTop: 2 },
  orderActions: { flexDirection: 'row', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(100,116,139,0.28)' },
  orderButton: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13.5, fontFamily: font.semibold, marginTop: spacing.sm },
  input: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.md, fontSize: 15, fontFamily: font.regular },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  toggleRow: { minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  toggleLabel: { flex: 1, fontFamily: font.semibold, fontSize: 13.5, paddingVertical: spacing.sm },
  traitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  trait: { minHeight: 48, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  traitText: { fontFamily: font.semibold, fontSize: 12.5 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
  hint: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.md, ...shadow.card },
  aboutBox: { alignSelf: 'stretch', borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  aboutTitle: { fontFamily: font.bold, fontSize: 13.5, marginBottom: 4 },
  aboutText: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 20 },
  save: { marginTop: spacing.lg },
});
