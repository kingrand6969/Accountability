import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useFonts, Anton_400Regular } from '@expo-google-fonts/anton';
import {
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { getHomeStats, type HomeStats } from '../home/api';
import { createPost } from '../feed/api';
import { uploadPostImage } from '../feed/uploadPostImage';

const ACCENT = '#fbbf24'; // amber flame accent

export default function WinCard() {
  const router = useRouter();
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);
  const [fontsLoaded] = useFonts({
    Anton_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_800ExtraBold,
  });

  useFocusEffect(
    useCallback(() => {
      getHomeStats().then(setStats).catch(() => {});
    }, []),
  );

  if (!stats || !fontsLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const message =
    stats.streak > 0
      ? `🔥 ${stats.streak}-day streak on Accountability! Showing up every day. 💪`
      : `Building better habits with Accountability 💪 — ${stats.weekWorkouts} workouts this week!`;

  async function pickPhoto(fromCamera: boolean) {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera needed', 'Allow camera access to take a selfie for your win card.');
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.85,
        cameraType: ImagePicker.CameraType.front,
      };
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
    } catch {
      Alert.alert('Could not open camera', 'Try choosing a photo from your gallery instead.');
    }
  }

  async function captureCard(result: 'base64' | 'tmpfile'): Promise<string | null> {
    if (Platform.OS === 'web' || !cardRef.current) return null;
    try {
      return await captureRef(cardRef, { format: 'png', quality: 0.95, result });
    } catch {
      return null;
    }
  }

  async function onShareToFeed() {
    setPosting(true);
    try {
      let imageUrl: string | null = null;
      const base64 = await captureCard('base64');
      if (base64) {
        try {
          imageUrl = await uploadPostImage(base64, 'png');
        } catch {
          imageUrl = null;
        }
      }
      await createPost(message, imageUrl);
      Alert.alert(
        'Shared to your feed 🎉',
        imageUrl ? 'Your win card is on your feed.' : 'Your win is on your feed.',
      );
      router.back();
    } catch (e) {
      Alert.alert('Could not share', String((e as Error).message ?? e));
    } finally {
      setPosting(false);
    }
  }

  async function onShareExternally() {
    setSharing(true);
    try {
      const uri = await captureCard('tmpfile');
      if (uri && Platform.OS !== 'web') {
        try {
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your win' });
            return;
          }
        } catch {
          // fall through
        }
      }
      await Share.share({ message: `${message}\n\n#accountability` });
    } catch {
      // dismissed
    } finally {
      setSharing(false);
    }
  }

  const cardInner = (
    <>
      {/* top scrim for wordmark legibility */}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent']}
        style={styles.topScrim}
        pointerEvents="none"
      />
      {/* bottom scrim for stats legibility over any photo */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.88)']}
        locations={[0, 0.45, 1]}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      <View style={styles.cardContent}>
        <View style={styles.brandRow}>
          <Ionicons name="flame" size={16} color={ACCENT} />
          <Text style={styles.brandTop}>ACCOUNTABILITY</Text>
        </View>

        <View style={styles.bottomBlock}>
          <View style={styles.streakRow}>
            <Text style={styles.streakNum}>{stats.streak}</Text>
            <View style={styles.streakSide}>
              <Ionicons name="flame" size={30} color={ACCENT} />
              <Text style={styles.streakLabel}>DAY{'\n'}STREAK</Text>
            </View>
          </View>

          <View style={styles.pills}>
            <View style={styles.pill}>
              <Ionicons name="barbell-outline" size={14} color="#fff" />
              <Text style={styles.pillText}>{stats.weekWorkouts} workouts</Text>
            </View>
            <View style={styles.pill}>
              <Ionicons name="walk-outline" size={14} color="#fff" />
              <Text style={styles.pillText}>{stats.weekActivities} activities</Text>
            </View>
          </View>

          <Text style={styles.tagline}>Showing up every day.</Text>
        </View>
      </View>
    </>
  );

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View ref={cardRef} collapsable={false} style={styles.cardWrap}>
        {photoUri ? (
          <ImageBackground source={{ uri: photoUri }} style={styles.card} resizeMode="cover">
            {cardInner}
          </ImageBackground>
        ) : (
          <LinearGradient
            colors={['#312e81', '#7c3aed', '#db2777']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            {cardInner}
          </LinearGradient>
        )}
      </View>

      <View style={styles.photoRow}>
        <Pressable
          style={styles.photoBtn}
          onPress={() => pickPhoto(true)}
          accessibilityLabel="Take a selfie for your win card"
        >
          <Ionicons name="camera-outline" size={18} color="#0f172a" />
          <Text style={styles.photoBtnText}>Selfie</Text>
        </Pressable>
        <Pressable
          style={styles.photoBtn}
          onPress={() => pickPhoto(false)}
          accessibilityLabel="Choose a photo for your win card"
        >
          <Ionicons name="image-outline" size={18} color="#0f172a" />
          <Text style={styles.photoBtnText}>Photo</Text>
        </Pressable>
        {photoUri ? (
          <Pressable
            style={styles.photoBtn}
            onPress={() => setPhotoUri(null)}
            accessibilityLabel="Remove photo"
          >
            <Ionicons name="close-outline" size={18} color="#0f172a" />
            <Text style={styles.photoBtnText}>Remove</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable style={styles.primary} onPress={onShareToFeed} disabled={posting || sharing}>
        {posting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Share to my feed</Text>
        )}
      </Pressable>
      <Pressable style={styles.secondary} onPress={onShareExternally} disabled={posting || sharing}>
        {sharing ? (
          <ActivityIndicator color="#2563eb" />
        ) : (
          <Text style={styles.secondaryText}>
            {Platform.OS === 'web' ? 'Share link' : 'Share image'}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 20, gap: 12, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardWrap: {
    borderRadius: 24,
    overflow: 'hidden',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  card: { aspectRatio: 4 / 5, width: '100%' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 110 },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '62%' },
  cardContent: { flex: 1, padding: 22, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandTop: {
    color: 'rgba(255,255,255,0.95)',
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 13,
    letterSpacing: 3.5,
  },
  bottomBlock: { gap: 14 },
  streakRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  streakNum: {
    color: '#fff',
    fontFamily: 'Anton_400Regular',
    fontSize: 104,
    lineHeight: 108,
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  streakSide: { paddingBottom: 12, gap: 2 },
  streakLabel: {
    color: '#fff',
    fontFamily: 'Inter_800ExtraBold',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 2,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  pillText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  tagline: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    alignSelf: 'center',
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 18,
    minHeight: 44,
  },
  photoBtnText: { color: '#0f172a', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  primary: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
  },
  primaryText: { color: '#fff', fontFamily: 'Inter_800ExtraBold', fontSize: 16 },
  secondary: {
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2563eb',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 400,
  },
  secondaryText: { color: '#2563eb', fontFamily: 'Inter_600SemiBold', fontSize: 16 },
});
