import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  colors as legacyColors,
  font,
  radius,
  spacing,
  type AppThemeColors,
  type AppThemeMode,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import {
  CREATE_HUB_MODEL,
  composerMediaChoices,
  type CreateChoice,
  type CreateMedia,
} from './createFlow';

type MediaChoice = CreateMedia;

const icons: Record<
  CreateChoice['id'],
  React.ComponentProps<typeof Ionicons>['name']
> = {
  post: 'create-outline',
  'photo-video': 'images-outline',
  flex: 'sparkles-outline',
  'share-run': 'walk-outline',
  'my-day': 'checkmark-circle-outline',
};

export function CreateHub({
  onClose,
  onContinue,
}: {
  onClose: () => void;
  onContinue: (choice: CreateChoice, media: MediaChoice) => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
  const palette = useMemo(() => createPalette(theme, mode), [theme, mode]);
  const [selectedId, setSelectedId] = useState<CreateChoice['id']>('post');
  const [media, setMedia] = useState<MediaChoice>('photo');
  const mediaChoices = composerMediaChoices(Platform.OS, false);
  const [focusedControl, setFocusedControl] = useState<string | null>(null);
  const selected =
    CREATE_HUB_MODEL.choices.find((choice) => choice.id === selectedId) ??
    CREATE_HUB_MODEL.choices[0];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 4 }]}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          onFocus={() => setFocusedControl('close')}
          onBlur={() => setFocusedControl(null)}
          style={({ pressed }) => [
            styles.iconButton,
            (pressed || focusedControl === 'close') && styles.controlFocused,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Close create menu"
        >
          <Ionicons name="chevron-back" size={25} color={palette.ink} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Create
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, spacing.md) + 92 },
        ]}
      >
        <Text style={styles.eyebrow}>Choose what to create</Text>
        <View accessibilityRole="radiogroup" style={styles.card}>
          {CREATE_HUB_MODEL.choices.map((choice, index) => {
            const selectedChoice = selectedId === choice.id;
            return (
              <Pressable
                key={choice.id}
                onPress={() => setSelectedId(choice.id)}
                accessibilityRole="radio"
                accessibilityLabel={choice.accessibilityLabel}
                accessibilityState={{ selected: selectedChoice }}
                onFocus={() => setFocusedControl(choice.id)}
                onBlur={() => setFocusedControl(null)}
                style={({ pressed }) => [
                  styles.row,
                  index < CREATE_HUB_MODEL.choices.length - 1 && styles.rowBorder,
                  selectedChoice && styles.rowSelected,
                  (pressed || focusedControl === choice.id) && styles.controlFocused,
                ]}
              >
                <View style={[styles.destinationIcon, selectedChoice && styles.iconSelected]}>
                  <Ionicons
                    name={icons[choice.id]}
                    size={21}
                    color={selectedChoice ? palette.onAction : palette.action}
                  />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.rowTitle}>{choice.title}</Text>
                  <Text style={styles.rowDetail}>{choice.detail}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={selectedChoice ? palette.action : palette.inkFaint}
                />
              </Pressable>
            );
          })}
        </View>

        {selectedId === 'photo-video' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Media</Text>
            <View style={styles.segment} accessibilityRole="radiogroup">
              {mediaChoices.map((value) => {
                const label = value === 'selfie'
                  ? 'Take selfie'
                  : value === 'photo'
                    ? 'Choose photo'
                    : 'Choose video';
                return (
                  <Pressable
                    key={value}
                    onPress={() => setMedia(value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: media === value }}
                    accessibilityLabel={label}
                    onFocus={() => setFocusedControl(`media-${value}`)}
                    onBlur={() => setFocusedControl(null)}
                    style={({ pressed }) => [
                      styles.segmentButton,
                      media === value && styles.segmentSelected,
                      (pressed || focusedControl === `media-${value}`) && styles.controlFocused,
                    ]}
                  >
                    <Ionicons
                      name={value === 'selfie'
                        ? 'camera-outline'
                        : value === 'photo'
                          ? 'image-outline'
                          : 'videocam-outline'}
                      size={20}
                      color={palette.ink}
                    />
                    <Text style={styles.segmentText}>
                      {label}
                      {media === value ? '  ✓' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.previewSection}>
          <Text style={styles.sectionTitle}>Preview</Text>
          <View style={styles.preview}>
            <View style={[styles.previewArtwork, selected.id === 'flex' && styles.previewArtworkFlex]}>
              <Ionicons
                name={
                  selected.id === 'photo-video'
                    ? media === 'video'
                      ? 'videocam'
                      : media === 'selfie'
                        ? 'camera'
                        : 'image'
                    : icons[selected.id]
                }
                size={34}
                color={palette.onAction}
              />
            </View>
            <View style={styles.copy}>
              <Text style={styles.previewText}>
                {selected.id === 'photo-video'
                  ? `${media === 'selfie' ? 'Selfie' : media === 'photo' ? 'Photo' : 'Video'} post`
                  : selected.title}
              </Text>
              <Text style={styles.previewDetail}>{selected.detail}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPress={() => onContinue(selected, media)}
          accessibilityRole="button"
          accessibilityLabel={`Continue with ${selected.title}`}
          onFocus={() => setFocusedControl('continue')}
          onBlur={() => setFocusedControl(null)}
          style={({ pressed }) => [
            styles.continueButton,
            (pressed || focusedControl === 'continue') && styles.continueFocused,
          ]}
        >
          <Text style={styles.continueText}>{CREATE_HUB_MODEL.continueLabel}</Text>
          <Ionicons name="arrow-forward" size={20} color={palette.onAction} />
        </Pressable>
      </View>
    </View>
  );
}

function createPalette(theme: AppThemeColors, mode: AppThemeMode) {
  return {
    canvas: mode === 'light' ? '#F4F5F1' : theme.surface.canvas,
    card: mode === 'light' ? legacyColors.card : theme.surface.card,
    divider: mode === 'light' ? '#E8E2D7' : theme.border.subtle,
    border: mode === 'light' ? legacyColors.border : theme.border.subtle,
    ink: mode === 'light' ? legacyColors.text : theme.ink.primary,
    inkMuted: mode === 'light' ? legacyColors.textMuted : theme.ink.muted,
    inkFaint: mode === 'light' ? legacyColors.textFaint : theme.ink.muted,
    action: mode === 'light' ? legacyColors.primaryDark : theme.ink.action,
    actionSoft: mode === 'light' ? legacyColors.primarySoft : theme.surface.raised,
    onAction: mode === 'light' ? '#FFFFFF' : theme.ink.inverse,
    flex: mode === 'light' ? '#53634E' : '#B9FF3D',
  };
}

function createStyles(theme: AppThemeColors, mode: AppThemeMode) {
  const palette = createPalette(theme, mode);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  header: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSpacer: { width: 38, height: 38 },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
    borderRadius: radius.pill,
  },
  title: { color: palette.ink, fontFamily: font.extrabold, fontSize: 20 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  eyebrow: {
    color: palette.inkMuted,
    fontFamily: font.semibold,
    fontSize: 13,
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.divider,
    overflow: 'hidden',
  },
  row: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    gap: 12,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.divider },
  rowSelected: { backgroundColor: palette.actionSoft },
  destinationIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.actionSoft,
  },
  iconSelected: { backgroundColor: palette.action },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { color: palette.ink, fontFamily: font.bold, fontSize: 16, flexShrink: 1 },
  rowDetail: {
    color: palette.inkMuted,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  section: { gap: spacing.sm },
  sectionTitle: { color: palette.ink, fontFamily: font.bold, fontSize: 14 },
  segment: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  segmentButton: {
    flexGrow: 1,
    flexBasis: 130,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  segmentSelected: { borderWidth: 2, borderColor: palette.action, backgroundColor: palette.actionSoft },
  segmentText: { color: palette.ink, fontFamily: font.semibold, fontSize: 14, flexShrink: 1 },
  previewSection: { gap: spacing.sm },
  preview: {
    minHeight: 92,
    borderRadius: radius.lg,
    padding: 10,
    borderWidth: 1,
    borderColor: palette.divider,
    backgroundColor: palette.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  previewText: { color: palette.ink, fontFamily: font.semibold, fontSize: 15, flexShrink: 1 },
  previewDetail: { color: palette.inkMuted, fontFamily: font.regular, fontSize: 12.5, lineHeight: 17 },
  previewArtwork: {
    width: 78,
    height: 70,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.action,
  },
  previewArtworkFlex: { backgroundColor: palette.flex },
  controlFocused: { opacity: 0.72, outlineColor: palette.action, outlineWidth: 2 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: palette.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  continueButton: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: palette.action,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  continueFocused: { opacity: 0.8, outlineColor: palette.ink, outlineWidth: 2 },
  continueText: { color: palette.onAction, fontFamily: font.bold, fontSize: 16 },
  });
}
