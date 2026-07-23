import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { RunCard } from './RunCard';
import { formatDurationLong, formatKm, formatPace, trimRouteEnds, type Pt } from './geo';
import type { ActivityType } from './api';
import { createPost } from '../feed/api';
import { uploadPostImage } from '../feed/uploadPostImage';
import { promptCrossShare } from '../feed/crossShare';
import { recordRunSelfie } from '../achievements/api';
import { font } from '../ui/theme';

const LIME = '#c6f24e';

export type FinishedRun = {
  type: ActivityType;
  distance: number;
  elapsed: number;
  points: Pt[];
  title: string;
};

type Mode = 'map' | 'photo';

/** Full-screen overlay shown after Stop & Save — turn the run into a shareable card. */
export function RunShareSheet({ run, onClose }: { run: FinishedRun; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('map');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoKind, setPhotoKind] = useState<'selfie' | 'place' | null>(null);
  const [posting, setPosting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showEnds, setShowEnds] = useState(false); // opt in to reveal home/finish
  const cardRef = useRef<View>(null);
  // synchronous re-entrancy guard — state updates are async, so a fast
  // double-tap would otherwise post twice
  const inFlight = useRef(false);

  // size the 4:5 card to fit BOTH the width and the space left after the
  // header/mode-picker/buttons, so it never clips on short screens
  const cardWidth = Math.min(width - 40, 340, Math.floor(((height - 400) * 4) / 5));

  // the shared route hides its true start/end by default (privacy zone); the
  // user can opt to reveal them, and the full route always stays in the saved activity
  const cardPoints = useMemo(
    () => (showEnds ? run.points : trimRouteEnds(run.points)),
    [run.points, showEnds],
  );

  // Android hardware back closes the sheet instead of popping the run screen
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!posting && !sharing) onClose();
      return true;
    });
    return () => sub.remove();
  }, [posting, sharing, onClose]);

  const caption =
    `🏃 ${run.title} · ${formatKm(run.distance)} km in ${formatDurationLong(run.elapsed)} ` +
    `· ${formatPace(run.distance, run.elapsed)} /km`;

  async function addPhoto(kind: 'selfie' | 'place') {
    try {
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: Platform.OS !== 'web',
        aspect: [9, 16],
        quality: 0.85,
        cameraType: kind === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
      };
      let res: ImagePicker.ImagePickerResult;
      // web has no camera and needs the picker to open synchronously (an
      // await before it breaks the user-gesture) → go straight to the library
      if (Platform.OS === 'web') {
        res = await ImagePicker.launchImageLibraryAsync(opts);
      } else {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        res = perm.granted
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
      }
      if (!res.canceled && res.assets[0]) {
        setPhotoUri(res.assets[0].uri);
        setPhotoKind(kind);
        setMode('photo');
      }
    } catch {
      Alert.alert('Could not open camera', 'Try choosing a photo from your gallery, or use Map only.');
    }
  }

  async function capture(result: 'base64' | 'tmpfile'): Promise<string | null> {
    if (Platform.OS === 'web' || !cardRef.current) return null;
    try {
      // 4:5 at 1080×1350 — Instagram/FB portrait HD; near-lossless jpg so the
      // stats stay crisp (the on-screen preview renders small)
      return await captureRef(cardRef, {
        format: 'jpg',
        quality: 0.97,
        result,
        width: 1080,
        height: 1350,
      });
    } catch {
      return null;
    }
  }

  async function onPost() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPosting(true);
    try {
      let imageUrl: string | null = null;
      const base64 = await capture('base64');
      if (base64) {
        imageUrl = await uploadPostImage(base64, 'jpg').catch(() => null);
      }
      await createPost(caption, imageUrl);
      // a posted selfie counts toward the Selfie Club mission (2/5/10/25 km)
      if (photoKind === 'selfie') recordRunSelfie(run.distance / 1000).catch(() => {});
      if (Platform.OS === 'web') {
        Alert.alert('Posted 🎉', 'Your run is on your feed.');
      } else {
        const tmp = await capture('tmpfile');
        promptCrossShare(caption, tmp);
      }
      onClose();
    } catch (e) {
      Alert.alert('Could not post', String((e as Error).message ?? e));
    } finally {
      inFlight.current = false;
      setPosting(false);
    }
  }

  async function onShare() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSharing(true);
    try {
      const uri = await capture('tmpfile');
      if (uri && Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share your run' });
        if (photoKind === 'selfie') recordRunSelfie(run.distance / 1000).catch(() => {});
        return;
      }
      await Share.share({ message: `${caption}\n\n#accountability` });
      if (photoKind === 'selfie') recordRunSelfie(run.distance / 1000).catch(() => {});
    } catch {
      // dismissed
    } finally {
      setSharing(false);
    }
  }

  const busy = posting || sharing;

  return (
    <View style={styles.overlay}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Share your run</Text>
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Skip sharing" disabled={busy}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.preview}>
        <RunCard
          ref={cardRef}
          mode={mode}
          photoUri={photoUri}
          distanceM={run.distance}
          durationS={run.elapsed}
          points={cardPoints}
          width={cardWidth}
        />
      </View>

      {/* privacy: start & end hidden by default; user can opt to show them */}
      <Pressable
        style={styles.privacyRow}
        onPress={() => setShowEnds((v) => !v)}
        disabled={busy}
        accessibilityRole="switch"
        accessibilityState={{ checked: showEnds }}
        accessibilityLabel="Show start and end points"
      >
        <Ionicons
          name={showEnds ? 'eye-outline' : 'shield-checkmark'}
          size={13}
          color={showEnds ? '#c6f24e' : '#94a3b8'}
        />
        <Text style={styles.privacyText}>
          {showEnds ? 'Showing start & end points' : 'Start & end hidden for privacy'}
        </Text>
        <Text style={styles.privacyAction}>{showEnds ? 'Hide' : 'Show'}</Text>
      </Pressable>

      {/* mode picker */}
      <View style={styles.modeRow}>
        <ModeBtn
          icon="happy-outline"
          label="Selfie"
          active={mode === 'photo' && photoKind === 'selfie'}
          onPress={() => addPhoto('selfie')}
          disabled={busy}
        />
        <ModeBtn
          icon="camera-outline"
          label="Photo"
          active={mode === 'photo' && photoKind === 'place'}
          onPress={() => addPhoto('place')}
          disabled={busy}
        />
        <ModeBtn
          icon="map-outline"
          label="Map only"
          active={mode === 'map'}
          onPress={() => {
            setPhotoUri(null);
            setPhotoKind(null);
            setMode('map');
          }}
          disabled={busy}
        />
      </View>

      <Pressable
        style={[styles.primary, busy && styles.dim]}
        onPress={onPost}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Post your run to the feed"
        accessibilityState={{ disabled: busy, busy: posting }}
      >
        {posting ? (
          <ActivityIndicator color="#101319" />
        ) : (
          <>
            <Ionicons name="share-social" size={18} color="#101319" />
            <Text style={styles.primaryText}>Post to feed</Text>
          </>
        )}
      </Pressable>
      <Pressable
        style={[styles.secondary, busy && styles.dim]}
        onPress={onShare}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={Platform.OS === 'web' ? 'Share a link' : 'Share the run image'}
        accessibilityState={{ disabled: busy, busy: sharing }}
      >
        {sharing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.secondaryText}>
            {Platform.OS === 'web' ? 'Share link' : 'Share image'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function ModeBtn({
  icon,
  label,
  active,
  onPress,
  disabled,
}: {
  icon: 'happy-outline' | 'camera-outline' | 'map-outline';
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.modeBtn, active && styles.modeBtnActive]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={active ? '#101319' : '#cbd5e1'} />
      <Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0b0e14',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 24,
    alignItems: 'center',
    justifyContent: 'center', // center the compact stack — no stretched gaps
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  headerTitle: { color: '#fff', fontFamily: font.extrabold, fontSize: 18 },
  skip: { color: '#94a3b8', fontFamily: font.bold, fontSize: 15 },
  preview: { justifyContent: 'center' },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  privacyText: { color: '#94a3b8', fontFamily: font.medium, fontSize: 12 },
  privacyAction: { color: '#c6f24e', fontFamily: font.bold, fontSize: 12 },
  modeRow: { flexDirection: 'row', gap: 8, alignSelf: 'stretch', justifyContent: 'center' },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(30,36,48,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  modeBtnActive: { backgroundColor: LIME, borderColor: LIME },
  modeText: { color: '#cbd5e1', fontFamily: font.bold, fontSize: 13.5 },
  modeTextActive: { color: '#101319' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: LIME,
    borderRadius: 999,
    paddingVertical: 16,
    alignSelf: 'stretch',
  },
  primaryText: { color: '#101319', fontFamily: font.extrabold, fontSize: 16 },
  secondary: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: 14,
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  secondaryText: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  dim: { opacity: 0.6 },
});
