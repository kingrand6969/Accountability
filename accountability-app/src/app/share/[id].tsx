import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../auth/AuthProvider';
import { resolvePublicSharePost } from '../../feed/publicShare';
import {
  canonicalPublicShareDestination,
  executeShareHandoff,
} from '../../navigation/routeAccessContract';
import { BrandMark } from '../../ui/BrandMark';
import { colors, font, spacing } from '../../ui/theme';

export default function SharedUpdateRoute() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const shareId = typeof id === 'string' ? id : undefined;
  const webUrl = canonicalPublicShareDestination(shareId);
  const [status, setStatus] = useState<'loading' | 'web' | 'unavailable'>(() =>
    webUrl ? 'loading' : 'unavailable',
  );
  const [openingWeb, setOpeningWeb] = useState(false);
  const displayStatus =
    !webUrl ? 'unavailable' : !authLoading && !session ? 'web' : status;

  async function openPublicWeb() {
    if (!webUrl || openingWeb) return;
    setOpeningWeb(true);
    try {
      await WebBrowser.openBrowserAsync(webUrl);
    } finally {
      setOpeningWeb(false);
    }
  }

  useEffect(() => {
    let alive = true;
    if (authLoading) return () => { alive = false; };
    executeShareHandoff({
      session: session ? 'signed-in' : 'signed-out',
      shareId,
      resolveAuthenticatedShare: resolvePublicSharePost,
      navigateToPost: (postId) => {
        router.replace({ pathname: '/post/[id]', params: { id: postId } } as never);
      },
      isCurrent: () => alive,
    }).then((result) => {
        if (!alive) return;
        if (result === 'web-fallback') setStatus('web');
        if (result === 'unavailable') setStatus('unavailable');
      });
    return () => { alive = false; };
  }, [authLoading, router, session, shareId]);

  return (
    <View style={styles.screen}>
      <BrandMark size={58} color={colors.primary} accessibilityLabel="AccountAbility" />
      <View
        style={styles.status}
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          openingWeb
            ? 'Opening shared update'
            : displayStatus === 'loading'
              ? 'Loading shared update'
              : displayStatus === 'web'
                ? 'Shared update is ready to open on the web'
                : 'Shared update is unavailable'
        }
      >
      {displayStatus === 'loading' ? (
        <>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.title}>Opening shared update…</Text>
        </>
      ) : (
        <>
          <Ionicons
            name={displayStatus === 'web' ? 'open-outline' : 'time-outline'}
            size={30}
            color={colors.navy}
          />
          <Text style={styles.title}>
            {displayStatus === 'web'
              ? 'Open this shared update on the web'
              : 'This update is no longer available'}
          </Text>
          <Text style={styles.copy}>
            {displayStatus === 'web'
              ? 'The public page is the safe source for this shared update.'
              : 'It may have expired or been removed by its owner.'}
          </Text>
          <Pressable
            onPress={displayStatus === 'web' ? openPublicWeb : () => router.replace('/' as never)}
            disabled={openingWeb}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={displayStatus === 'web' ? 'Open public shared update' : 'Go to AccountAbility feed'}
            accessibilityState={{ busy: openingWeb, disabled: openingWeb }}
          >
            <Text style={styles.buttonText}>
              {displayStatus === 'web'
                ? (openingWeb ? 'Opening…' : 'Open Shared Update')
                : 'Go to Feed'}
            </Text>
          </Pressable>
        </>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.xl, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  status: { alignItems: 'center', gap: spacing.lg },
  title: { color: colors.navy, fontFamily: 'Georgia', fontSize: 25, textAlign: 'center' },
  copy: { maxWidth: 340, color: colors.inkSoft, fontFamily: font.regular, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  button: { minHeight: 48, minWidth: 180, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: { color: '#FFFFFF', fontFamily: font.bold, fontSize: 14 },
  pressed: { opacity: 0.72 },
});
