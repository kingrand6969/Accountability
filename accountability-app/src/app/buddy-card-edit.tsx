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
  createBuddyCardEditorLoadLifecycle,
  createSynchronousSubmitLock,
  loadBuddyCardEditorData,
  moveFeaturedMedal,
  normalizeBuddyCardEditorDraft,
  setBuddyCardRankingConsent,
  shouldPreventBuddyCardEditorExit,
  toggleFeaturedMedal,
  type BuddyCardEditorLoadToken,
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
import { useAppTheme } from '../ui/AppThemeProvider';
import { showToast } from '../ui/Toast';
import { font, radius, shadow, spacing, type AppThemeColors } from '../ui/theme';
import { navigateBackSafely } from '../navigation/routeAccessContract';
import {
  presentationTraitName,
  traitOptionSelected,
} from '../buddy/presentation';

const TRAITS = [
  'Cheering',
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
  const { colors: theme } = useAppTheme();
  const { mode: scheme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const editorPalette = resolveBuddyCardPalette('polar_blue', scheme);

  const lifecycleRef = useRef(createBuddyCardEditorLoadLifecycle());
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

  const load = useCallback(async (token: BuddyCardEditorLoadToken) => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: authAtStart } = await supabase.auth.getUser();
      const ownerId = authAtStart.user?.id ?? null;
      if (!ownerId) throw new Error('Sign in to edit your Buddy Card.');
      if (!lifecycleRef.current.bindOwner(token, ownerId)) return;
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
      const completion = lifecycleRef.current.complete(token, authAtEnd.user?.id ?? null);
      if (completion === 'stale') return;
      if (completion === 'account-changed') {
        setLoadError(ACCOUNT_CHANGED);
        setLoading(false);
        return;
      }

      const earnedIds = rank.medalList.map((medal) => medal.id);
      const selected = normalizeFeaturedMedalIds(storedCard.featured_medal_ids, earnedIds);
      const resolvedPalette = BUDDY_CARD_PALETTE_KEYS.includes(
        storedCard.palette_key as BuddyCardPaletteKey,
      )
        ? (storedCard.palette_key as BuddyCardPaletteKey)
        : 'polar_blue';
      const normalizedDraft = normalizeBuddyCardEditorDraft({
        ...storedCard,
        palette_key: resolvedPalette,
        featured_medal_ids: selected,
      });

      setCard(normalizedDraft);
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
      if (!lifecycleRef.current.isCurrent(token)) return;
      setLoadError(String((error as Error).message ?? error));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    lifecycle.mount();
    const token = lifecycle.begin();
    void load(token);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const transition = lifecycle.authEvent(session?.user.id ?? null);
      if (transition.action === 'ignore') return;
      savingRef.current.release();
      setSaving(false);
      setBaselineFingerprint(null);
      setCard({});
      setFeaturedMedalIds([]);
      if (transition.action === 'reload') {
        setLoadError(null);
        setLoading(true);
        void load(transition.token);
      } else {
        setLoadError('Sign in to edit your Buddy Card.');
        setLoading(false);
      }
    });
    return () => {
      lifecycle.unmount();
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
    const expectedOwnerId = lifecycleRef.current.expectedOwner();
    if (!expectedOwnerId) {
      savingRef.current.release();
      Alert.alert('Could not save', ACCOUNT_CHANGED);
      return;
    }

    setSaving(true);
    const token = lifecycleRef.current.currentToken();
    try {
      const toSave = buildBuddyCardEditorPatch(draftCard, earnedIds);
      await saveMyBuddyCard(toSave, expectedOwnerId);
      if (
        !lifecycleRef.current.isCurrent(token) ||
        lifecycleRef.current.expectedOwner() !== expectedOwnerId
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
        if (lifecycleRef.current.isCurrent(token)) navigateBackSafely(router);
      });
    } catch (error) {
      const { data: authAfterFailure } = await supabase.auth.getUser();
      if (
        lifecycleRef.current.isCurrent(token) &&
        lifecycleRef.current.expectedOwner() === expectedOwnerId &&
        authAfterFailure.user?.id === expectedOwnerId
      ) {
        Alert.alert('Could not save', String((error as Error).message ?? error));
      }
    } finally {
      if (lifecycleRef.current.isCurrent(token)) {
        savingRef.current.release();
        setSaving(false);
      }
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.ink.action} />
        <Text style={styles.statusText}>Loading your Buddy Card…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={34} color={theme.ink.action} />
        <Text style={styles.errorTitle}>Could not load your Buddy Card</Text>
        <Text style={styles.statusText}>{loadError}</Text>
        <Button title="Try again" onPress={() => setReloadKey((value) => value + 1)} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionTitle}>Appearance</Text>
      <Text style={styles.traitHint}>Choose a clean color atmosphere. Rank and medal colors stay official.</Text>
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

      <Text style={styles.sectionTitle}>Featured medals</Text>
      <Text style={styles.traitHint}>You can feature up to four medals. Their order here is their order on your card.</Text>
      {featuredMedalIds.length >= MAX_FEATURED_MEDALS ? (
        <Text accessibilityLiveRegion="polite" style={styles.limitText}>Four medals selected. Remove one before choosing another.</Text>
      ) : null}
      {selectionNotice ? (
        <Text accessibilityLiveRegion="polite" style={styles.limitText}>{selectionNotice}</Text>
      ) : null}
      {myMedalList.length === 0 ? (
        <Text style={styles.emptyText}>Earn your first medal to feature it here.</Text>
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
                  selected && styles.medalRowSelected,
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
                    <Text style={styles.medalTitle}>{definition.title}</Text>
                    <Text style={styles.medalTier}>{state.tierName}{selected ? ` · Position ${selectedIndex + 1}` : ''}</Text>
                  </View>
                  <Ionicons
                    name={selected ? 'checkmark-circle' : 'add-circle-outline'}
                    size={24}
                    color={selected ? theme.ink.action : theme.ink.muted}
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
                      <Ionicons name="chevron-up" size={20} color={theme.ink.action} />
                    </Pressable>
                    <Pressable
                      onPress={() => setFeaturedMedalIds(moveFeaturedMedal(featuredMedalIds, snapshot.id, 1, earnedIds))}
                      disabled={selectedIndex === featuredMedalIds.length - 1}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${definition.title} later`}
                      accessibilityState={{ disabled: selectedIndex === featuredMedalIds.length - 1 }}
                      style={[styles.orderButton, selectedIndex === featuredMedalIds.length - 1 && styles.disabled]}
                    >
                      <Ionicons name="chevron-down" size={20} color={theme.ink.action} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.sectionTitle}>Profile text</Text>
      <Text style={styles.label}>Focus line</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Morning runs · 5K pace · looking for a jog partner"
        placeholderTextColor={theme.ink.muted}
        value={card.headline ?? ''}
        onChangeText={(headlineValue) => setCard((current) => ({ ...current, headline: headlineValue }))}
        maxLength={90}
      />
      <Text style={styles.label}>About you</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="What are you working on? What kind of buddy do you want?"
        placeholderTextColor={theme.ink.muted}
        value={card.about ?? ''}
        onChangeText={(aboutValue) => setCard((current) => ({ ...current, about: aboutValue }))}
        multiline
        maxLength={400}
      />

      <Text style={styles.sectionTitle}>What non-buddies may see</Text>
      <Text style={styles.traitHint}>Every item below is off until you choose to share it.</Text>
      <PrivacyToggle label="Show my focus line" value={card.show_headline === true} onChange={(value) => setCard((current) => ({ ...current, show_headline: value }))} />
      <PrivacyToggle label="Show my selected accountability traits" value={card.show_traits === true} onChange={(value) => setCard((current) => ({ ...current, show_traits: value }))} />
      <PrivacyToggle label="Show my area" value={card.show_area === true} onChange={(value) => setCard((current) => ({ ...current, show_area: value }))} />
      <PrivacyToggle label="Show my About text" value={card.show_bio === true} onChange={(value) => setCard((current) => ({ ...current, show_bio: value }))} />
      <PrivacyToggle label="Show my activity time" value={card.show_last_active === true} onChange={(value) => setCard((current) => ({ ...current, show_last_active: value }))} />
      <PrivacyToggle label="Show my momentum rank" value={card.show_rank === true} onChange={(value) => setCard((current) => ({ ...current, show_rank: value }))} />
      <PrivacyToggle label="Show my earned medals" value={card.show_medals === true} onChange={(value) => setCard((current) => ({ ...current, show_medals: value }))} />
      <PrivacyToggle label="Show consistency" value={card.show_consistency === true} onChange={(value) => setCard((current) => ({ ...current, show_consistency: value }))} />
      <PrivacyToggle label="Show points" value={card.show_points === true} onChange={(value) => setCard((current) => ({ ...current, show_points: value }))} />
      <PrivacyToggle label="Show distance" value={card.show_distance === true} onChange={(value) => setCard((current) => ({ ...current, show_distance: value }))} />
      <PrivacyToggle label="Show challenge wins" value={card.show_challenge_wins === true} onChange={(value) => setCard((current) => ({ ...current, show_challenge_wins: value }))} />
      <PrivacyToggle label="Share country ranking" value={card.show_country_rank === true} onChange={(value) => setCard((current) => setBuddyCardRankingConsent(current, 'show_country_rank', value))} />
      <PrivacyToggle label="Share city ranking" value={card.show_city_rank === true} onChange={(value) => setCard((current) => setBuddyCardRankingConsent(current, 'show_city_rank', value))} />
      <PrivacyToggle label="Show selected public posts" value={card.show_posts === true} onChange={(value) => setCard((current) => ({ ...current, show_posts: value }))} />

      <Text style={styles.label}>Your accountability style</Text>
      <Text style={styles.traitHint}>Choose up to three traits visitors should know.</Text>
      <View style={styles.traitGrid}>
        {TRAITS.map((trait) => {
          const selected = traitOptionSelected(card.traits, trait);
          const full = (card.traits?.length ?? 0) >= 3;
          return (
            <Pressable
              key={trait}
              onPress={() =>
                setCard((current) => ({
                  ...current,
                  traits: selected
                    ? (current.traits ?? []).filter((item) => presentationTraitName(item) !== trait)
                  : [...(current.traits ?? []), trait].slice(0, 3),
                }))
              }
              disabled={!selected && full}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled: !selected && full }}
              style={({ pressed }) => [
                styles.trait,
                selected && styles.traitSelected,
                !selected && full && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.traitText, selected && styles.traitTextSelected]}>{trait}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>Non-buddies only see enabled items. Posts must also be individually marked “Show on Buddy Card”.</Text>

      <Text style={styles.sectionTitle}>Live preview</Text>
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
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createPrivacyToggleStyles(theme), [theme]);

  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        style={styles.toggleSwitch}
        value={value}
        onValueChange={onChange}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
        trackColor={{ false: theme.border.strong, true: theme.ink.action }}
        thumbColor={value ? theme.ink.inverse : theme.surface.raised}
      />
    </View>
  );
}

function createPrivacyToggleStyles(theme: AppThemeColors) {
  return StyleSheet.create({
    toggleRow: { minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border.subtle, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    toggleLabel: { flex: 1, fontFamily: font.semibold, fontSize: 13.5, color: theme.ink.primary, paddingVertical: spacing.sm },
    toggleSwitch: { minWidth: 48, minHeight: 48, alignSelf: 'center' },
  });
}

function createStyles(theme: AppThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: theme.surface.canvas },
  statusText: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: 'center', color: theme.ink.muted },
  errorTitle: { fontFamily: font.bold, fontSize: 18, textAlign: 'center', color: theme.ink.primary },
  container: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 48, backgroundColor: theme.surface.canvas },
  sectionTitle: { fontSize: 12, fontFamily: font.bold, color: theme.ink.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.lg },
  paletteList: { gap: 10, marginTop: 4 },
  paletteOption: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  swatches: { flexDirection: 'row' },
  swatch: { width: 22, height: 32, borderRadius: 8, marginRight: -5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)' },
  paletteName: { flex: 1, fontFamily: font.semibold, fontSize: 14 },
  traitHint: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 18, color: theme.ink.muted },
  limitText: { fontFamily: font.semibold, fontSize: 12.5, lineHeight: 18, color: theme.ink.action },
  emptyText: { fontFamily: font.regular, fontSize: 13, paddingVertical: spacing.md, color: theme.ink.muted },
  medalList: { gap: 10, marginTop: 4 },
  medalRow: { borderWidth: 1, borderColor: theme.border.subtle, borderRadius: radius.md, backgroundColor: theme.surface.card, overflow: 'hidden', flexDirection: 'row', alignItems: 'stretch' },
  medalRowSelected: { borderColor: theme.ink.action },
  medalSelect: { minHeight: 64, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  medalCopy: { flex: 1 },
  medalTitle: { fontFamily: font.semibold, fontSize: 14, color: theme.ink.primary },
  medalTier: { fontFamily: font.regular, fontSize: 12, marginTop: 2, color: theme.ink.muted },
  orderActions: { flexDirection: 'row', borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.border.subtle },
  orderButton: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13.5, fontFamily: font.semibold, color: theme.ink.primary, marginTop: spacing.sm },
  input: { borderWidth: 1, borderColor: theme.border.subtle, borderRadius: radius.sm, backgroundColor: theme.surface.raised, color: theme.ink.primary, padding: spacing.md, fontSize: 15, fontFamily: font.regular },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  traitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  trait: { minHeight: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.raised, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  traitSelected: { backgroundColor: theme.surface.muted, borderColor: theme.ink.action },
  traitText: { fontFamily: font.semibold, fontSize: 12.5, color: theme.ink.primary },
  traitTextSelected: { color: theme.ink.action },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
  hint: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 18, color: theme.ink.muted, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: radius.xl, padding: spacing.md, ...shadow.card },
  aboutBox: { alignSelf: 'stretch', borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  aboutTitle: { fontFamily: font.bold, fontSize: 13.5, marginBottom: 4 },
  aboutText: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 20 },
  save: { marginTop: spacing.lg },
});
}
