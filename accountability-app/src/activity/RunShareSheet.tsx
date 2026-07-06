import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { formatDurationLong, formatKm, formatPace, type Pt } from './geo';
import type { ActivityType } from './api';
import { createPost } from '../feed/api';
import { uploadPostImage } from '../feed/uploadPostImage';
import { promptCrossShare } from '../feed/crossShare';
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
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<Mode>('map');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);

  const cardWidth = Math.min(width - 40, 300);

  const caption =
    `🏃 ${run.title} · ${formatKm(run.distance)} km in ${formatDurationLong(run.elapsed)} ` +
    `· ${formatPace(run.distance, run.elapsed)} /km`;

  async function addPhoto(kind: 'selfie' | 'place') {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.85,
        cameraType: kind === 'selfie' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
      };
      let res: ImagePicker.ImagePickerResult;
      if (perm.granted && Platform.OS !== 'web') {
        res = await ImagePicker.launchCameraAsync(opts);
      } else {
        // web / no camera permission → pick from library instead
        res = await ImagePicker.launchImageLibraryAsync(opts);
      }
      if (!res.canceled && res.assets[0]) {
        setPhotoUri(res.assets[0].uri);
        setMode('photo');
      }
    } catch {
      Alert.alert('Could not open camera', 'Try choosing a photo from your gallery, or use Map only.');
    }
  }

  async function capture(result: 'base64' | 'tmpfile'): Promise<string | null> {
    if (Platform.OS === 'web' || !cardRef.current) return null;
    try {
      return await captureRef(cardRef, { format: 'jpg', quality: 0.9, result });
    } catch {
      return null;
    }
  }

  async function onPost() {
    setPosting(true);
    try {
      let imageUrl: string | null = null;
      const base64 = await capture('base64');
      if (base64) {
        imageUrl = await uploadPostImage(base64, 'jpg').catch(() => null);
      }
      await createPost(caption, imageUrl);
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
      setPosting(false);
    }
  }

  async function onShare() {
    setSharing(true);
    try {
      const uri = await capture('tmpfile');
      if (uri && Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share your run' });
        return;
      }
      await Share.share({ message: `${caption}\n\n#accountability` });
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
          points={run.points}
          width={cardWidth}
        />
      </View>

      {/* mode picker */}
      <View style={styles.modeRow}>
        <ModeBtn
          icon="happy-outline"
          label="Selfie"
          active={mode === 'photo' && !!photoUri}
          onPress={() => addPhoto('selfie')}
          disabled={busy}
        />
        <ModeBtn
          icon="camera-outline"
          label="Photo"
          active={false}
          onPress={() => addPhoto('place')}
          disabled={busy}
        />
        <ModeBtn
          icon="map-outline"
          label="Map only"
          active={mode === 'map'}
          onPress={() => {
            setPhotoUri(null);
            setMode('map');
          }}
          disabled={busy}
        />
      </View>

      <Pressable style={[styles.primary, busy && styles.dim]} onPress={onPost} disabled={busy}>
        {posting ? (
          <ActivityIndicator color="#101319" />
        ) : (
          <>
            <Ionicons name="share-social" size={18} color="#101319" />
            <Text style={styles.primaryText}>Post to feed</Text>
          </>
        )}
      </Pressable>
      <Pressable style={[styles.secondary, busy && styles.dim]} onPress={onShare} disabled={busy}>
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
    paddingTop: 56,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  headerTitle: { color: '#fff', fontFamily: font.extrabold, fontSize: 18 },
  skip: { color: '#94a3b8', fontFamily: font.bold, fontSize: 15 },
  preview: { flex: 1, justifyContent: 'center' },
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
