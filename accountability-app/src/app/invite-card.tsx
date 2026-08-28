import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMyProfile } from '../profiles/api';
import { useAppTheme } from '../ui/AppThemeProvider';
import { useResolvedImageUrl } from '../media/useResolvedImageUrl';
import {
  font,
  radius,
  shadow,
  spacing,
  type AppThemeColors,
} from '../ui/theme';

export default function InviteCard() {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const palette = useMemo(() => invitePalette(theme), [theme]);
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const [name, setName] = useState('A friend');
  const [avatar, setAvatar] = useState<string | null>(null);
  const resolvedAvatar = useResolvedImageUrl(avatar);
  const [sharing, setSharing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getMyProfile()
        .then((profile) => {
          setName(profile?.display_name?.trim() || 'A friend');
          setAvatar(profile?.avatar_url ?? null);
        })
        .catch(() => {});
    }, []),
  );

  async function shareCard() {
    if (sharing) return;
    setSharing(true);
    try {
      if (Platform.OS !== 'web' && cardRef.current && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(cardRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
        });
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: 'Invite a buddy to AccountAbility',
        });
        return;
      }
      await Share.share({
        message: `${name} invited you to build better habits together on AccountAbility.`,
      });
    } catch (error) {
      if (String(error).toLowerCase().includes('cancel')) return;
      Alert.alert('Could not share', 'Please try again. Your invitation is still here.');
    } finally {
      setSharing(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + spacing.lg },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.eyebrow}>YOUR INVITATION</Text>
      <Text style={styles.title}>Better together.</Text>
      <Text style={styles.subtitle}>
        Share a polished invitation—not a technical link.
      </Text>

      <View
        ref={cardRef}
        collapsable={false}
        accessible
        accessibilityLabel="Invitation artwork"
        style={styles.capture}
      >
        <LinearGradient
          colors={['#111411', '#263223', '#446B00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.orbOne} />
          <View style={styles.orbTwo} />
          <View style={styles.brandRow}>
            <Image source={require('../../assets/images/logo.png')} style={styles.logo} />
            <Text style={styles.brand}>AccountAbility</Text>
          </View>

          <View style={styles.inviter}>
            {resolvedAvatar ? (
              <Image source={{ uri: resolvedAvatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="person" size={26} color="#fff" />
              </View>
            )}
            <View style={styles.inviterCopy}>
              <Text style={styles.invitedBy}>INVITED BY</Text>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
            </View>
          </View>

          <Text style={styles.cardHeadline}>Let’s show up for{'\n'}each other.</Text>
          <Text style={styles.cardBody}>
            Build streaks, celebrate wins and stay accountable with someone you trust.
          </Text>

          <View style={styles.pillRow}>
            <View style={styles.pill}>
              <Ionicons name="flame" size={17} color="#fbbf24" />
              <Text style={styles.pillText}>Streaks</Text>
            </View>
            <View style={styles.pill}>
              <Ionicons name="people" size={17} color="#B9FF3D" />
              <Text style={styles.pillText}>Buddies</Text>
            </View>
            <View style={styles.pill}>
              <Ionicons name="trophy" size={17} color="#fcd34d" />
              <Text style={styles.pillText}>Wins</Text>
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerPrimary}>Join me on AccountAbility</Text>
            <Text style={styles.footerSecondary}>Achieve. Consistency.</Text>
          </View>
        </LinearGradient>
      </View>

      <Pressable
        onPress={shareCard}
        disabled={sharing}
        accessibilityRole="button"
        accessibilityLabel="Share invitation card"
        style={({ pressed }) => [
          styles.shareButton,
          pressed && styles.pressed,
          sharing && styles.disabled,
        ]}
      >
        {sharing ? (
          <ActivityIndicator color={palette.onAction} />
        ) : (
          <>
            <Ionicons name="share-social" size={21} color={palette.onAction} />
            <Text style={styles.shareText}>Share invitation</Text>
          </>
        )}
      </Pressable>
      <Text style={styles.privacy}>
        Only this invitation image is shared. Your private app data is not included.
      </Text>
    </ScrollView>
  );
}

function invitePalette(theme: AppThemeColors) {
  return {
    canvas: theme.surface.canvas,
    title: theme.ink.primary,
    muted: theme.ink.muted,
    action: theme.ink.action,
    onAction: theme.ink.inverse,
  } as const;
}

const createStyles = (theme: AppThemeColors) => {
  const palette = invitePalette(theme);

  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    marginTop: spacing.sm,
    color: palette.action,
    fontFamily: font.extrabold,
    fontSize: 12,
    letterSpacing: 1.5,
  },
  title: { marginTop: 5, color: palette.title, fontFamily: font.extrabold, fontSize: 28 },
  subtitle: {
    color: palette.muted,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  capture: { width: '100%', maxWidth: 360, aspectRatio: 4 / 5 },
  card: {
    flex: 1,
    borderRadius: 28,
    padding: 24,
    overflow: 'hidden',
    ...shadow.card,
  },
  orbOne: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(185,255,61,0.22)',
    right: -100,
    top: -75,
  },
  orbTwo: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(14,165,233,0.18)',
    left: -110,
    bottom: 30,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logo: { width: 28, height: 28, resizeMode: 'contain' },
  brand: { color: '#fff', fontFamily: font.extrabold, fontSize: 18 },
  inviter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 30,
    padding: 10,
    paddingRight: 18,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#fff' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#6F9F00' },
  inviterCopy: { maxWidth: 180 },
  invitedBy: { color: '#E8F4D7', fontFamily: font.bold, fontSize: 9, letterSpacing: 1.2 },
  name: { color: '#fff', fontFamily: font.extrabold, fontSize: 17, marginTop: 1 },
  cardHeadline: {
    color: '#fff',
    fontFamily: font.extrabold,
    fontSize: 34,
    lineHeight: 39,
    marginTop: 26,
    letterSpacing: -0.7,
  },
  cardBody: {
    color: '#EEF7E4',
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 285,
    marginTop: 12,
  },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 22 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(2,6,23,0.24)',
  },
  pillText: { color: '#fff', fontFamily: font.semibold, fontSize: 12 },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  footerPrimary: { color: '#fff', fontFamily: font.extrabold, fontSize: 16 },
  footerSecondary: { color: '#E8F4D7', fontFamily: font.medium, fontSize: 12, marginTop: 3 },
  shareButton: {
    width: '100%',
    maxWidth: 360,
    height: 52,
    borderRadius: 26,
    marginTop: spacing.lg,
    backgroundColor: palette.action,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  shareText: { color: palette.onAction, fontFamily: font.bold, fontSize: 16 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.6 },
  privacy: {
    color: palette.muted,
    fontFamily: font.regular,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    maxWidth: 330,
    marginTop: 12,
  },
  });
};
