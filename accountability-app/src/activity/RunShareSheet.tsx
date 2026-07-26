import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
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
import {
  RUN_SHARE_FORMATS,
  runShareExportSize,
  runShareRatio,
  type RunMediaFit,
  type RunShareFormat,
} from './runShareFormats';
import type { PostAudience } from '../feed/types';
import { createShareOperationGate } from './shareOperationGate';

const LIME = '#c6f24e';

export type FinishedRun = {
  activityId: string | null;
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
  const [originalRatio, setOriginalRatio] = useState<number | null>(null);
  const [format, setFormat] = useState<RunShareFormat>('feed');
  const [mediaFit, setMediaFit] = useState<RunMediaFit>('cover');
  const [audience, setAudience] = useState<Exclude<PostAudience, 'group'>>('buddies');
  const [posting, setPosting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showEnds, setShowEnds] = useState(false); // opt in to reveal home/finish
  const cardRef = useRef<View>(null);
  const shareOperationGate = useRef(createShareOperationGate()).current;

  // size the 4:5 card to fit BOTH the width and the space left after the
  // header/mode-picker/buttons, so it never clips on short screens
  const cardRatio = runShareRatio(format, originalRatio);
  const maxPreviewHeight = Math.max(170, height - 520);
  const cardWidth = Math.max(170, Math.min(width - 40, 340, Math.floor(maxPreviewHeight * cardRatio)));

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
        allowsEditing: false,
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
        const asset = res.assets[0];
        setPhotoUri(asset.uri);
        setOriginalRatio(asset.width && asset.height ? asset.width / asset.height : null);
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
      const output = runShareExportSize(format, originalRatio);
      return await captureRef(cardRef, {
        format: 'jpg',
        quality: 0.97,
        result,
        width: output.width,
        height: output.height,
      });
    } catch {
      return null;
    }
  }

  async function onPost() {
    if (!run.activityId) {
      Alert.alert('Preview only', 'Save a real GPS activity on your phone before posting a verified Run card.');
      return;
    }

    await shareOperationGate.run(async () => {
      setPosting(true);
      try {
        let imageUrl: string | null = null;
        const base64 = await capture('base64');
        if (base64) {
          imageUrl = await uploadPostImage(base64, 'jpg').catch(() => null);
        }
        await createPost(caption, imageUrl, null, null, null, false, {
          audience,
          postType: 'run',
          activityId: run.activityId,
          shareData: { format, media_fit: mediaFit, route_ends_visible: showEnds },
        });
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
        setPosting(false);
      }
    });
  }

  async function onShare() {
    await shareOperationGate.run(async () => {
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
    });
  }

  const busy = posting || sharing;

  return (
    <View style={styles.overlay}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Share your run</Text>
        <Pressable
          onPress={onClose}
          style={styles.skipBtn}
          accessibilityRole="button"
          accessibilityLabel="Skip sharing"
          disabled={busy}
        >
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
          aspectRatio={cardRatio}
          mediaFit={mediaFit}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.formatRow}
        accessibilityLabel="Run card orientation"
      >
        {RUN_SHARE_FORMATS.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setFormat(item.id)}
            disabled={busy}
            style={[styles.formatChip, format === item.id && styles.formatChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: format === item.id }}
            accessibilityLabel={`${item.label}, ${item.short}`}
          >
            <Text style={[styles.formatLabel, format === item.id && styles.formatLabelActive]}>
              {item.label}
            </Text>
            <Text style={[styles.formatRatio, format === item.id && styles.formatLabelActive]}>
              {item.short}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {mode === 'photo' ? (
        <Pressable
          onPress={() => setMediaFit((fit) => (fit === 'cover' ? 'contain' : 'cover'))}
          style={styles.fitControl}
          accessibilityRole="switch"
          accessibilityState={{ checked: mediaFit === 'contain' }}
          accessibilityLabel="Fit the whole photo inside the selected orientation"
        >
          <Ionicons name={mediaFit === 'cover' ? 'crop-outline' : 'scan-outline'} size={15} color="#cbd5e1" />
          <Text style={styles.fitText}>{mediaFit === 'cover' ? 'Crop to fill' : 'Fit whole photo'}</Text>
        </Pressable>
      ) : null}

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

      <View style={styles.audienceRow}>
        <Text style={styles.audienceTitle}>Who can see it?</Text>
        {(['buddies', 'public'] as const).map((value) => (
          <Pressable
            key={value}
            onPress={() => setAudience(value)}
            disabled={busy}
            style={[styles.audienceChip, audience === value && styles.audienceChipActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: audience === value }}
          >
            <Ionicons
              name={value === 'buddies' ? 'people' : 'earth'}
              size={14}
              color={audience === value ? '#101319' : '#cbd5e1'}
            />
            <Text style={[styles.audienceText, audience === value && styles.audienceTextActive]}>
              {value === 'buddies' ? 'Buddies' : 'Public'}
            </Text>
          </Pressable>
        ))}
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
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
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
    width: '100%',
    maxWidth: 560,
  },
  headerTitle: { color: '#fff', fontFamily: font.extrabold, fontSize: 18 },
  skip: { color: '#94a3b8', fontFamily: font.bold, fontSize: 15 },
  skipBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  preview: { justifyContent: 'center' },
  formatRow: { gap: 7, paddingHorizontal: 2 },
  formatChip: {
    minWidth: 68,
    minHeight: 44,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,36,48,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  formatChipActive: { borderColor: LIME, backgroundColor: 'rgba(198,242,78,0.14)' },
  formatLabel: { color: '#e2e8f0', fontFamily: font.bold, fontSize: 12 },
  formatRatio: { color: '#94a3b8', fontFamily: font.medium, fontSize: 10 },
  formatLabelActive: { color: LIME },
  fitControl: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  fitText: { color: '#cbd5e1', fontFamily: font.semibold, fontSize: 12 },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    minHeight: 44,
    width: '100%',
    maxWidth: 560,
    justifyContent: 'center',
  },
  privacyText: { color: '#94a3b8', fontFamily: font.medium, fontSize: 12 },
  privacyAction: { color: '#c6f24e', fontFamily: font.bold, fontSize: 12 },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 560,
  },
  audienceRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
    gap: 8,
  },
  audienceTitle: {
    color: '#94a3b8',
    fontFamily: font.semibold,
    fontSize: 12,
    marginRight: 'auto',
  },
  audienceChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  audienceChipActive: { backgroundColor: LIME, borderColor: LIME },
  audienceText: { color: '#cbd5e1', fontFamily: font.bold, fontSize: 12 },
  audienceTextActive: { color: '#101319' },
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
    width: '100%',
    maxWidth: 560,
  },
  primaryText: { color: '#101319', fontFamily: font.extrabold, fontSize: 16 },
  secondary: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: 14,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 560,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  secondaryText: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  dim: { opacity: 0.6 },
});
