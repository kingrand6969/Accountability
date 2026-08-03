import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PostAudience } from '../feed/types';
import { colors, font, radius, spacing } from '../ui/theme';
import {
  CREATE_HUB_MODEL,
  type CreateAudience,
  type CreateChoice,
  type CreateMedia,
} from './createFlow';

type MediaChoice = CreateMedia;
type Audience = CreateAudience & Exclude<PostAudience, 'group'>;

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
  onContinue: (choice: CreateChoice, media: MediaChoice, audience: Audience) => void;
}) {
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<CreateChoice['id']>('post');
  const [media, setMedia] = useState<MediaChoice>('photo');
  const [audience, setAudience] = useState<Audience>('buddies');
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
          <Ionicons name="chevron-back" size={25} color={colors.text} />
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
                    color={selectedChoice ? colors.onPrimary : colors.primary}
                  />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.rowTitle}>{choice.title}</Text>
                  <Text style={styles.rowDetail}>{choice.detail}</Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={selectedChoice ? colors.primary : colors.textFaint}
                />
              </Pressable>
            );
          })}
        </View>

        {selectedId === 'photo-video' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Media</Text>
            <View style={styles.segment} accessibilityRole="radiogroup">
              {(['photo', 'video'] as const).map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setMedia(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: media === value }}
                  accessibilityLabel={value === 'photo' ? 'Choose photo' : 'Choose video'}
                  onFocus={() => setFocusedControl(`media-${value}`)}
                  onBlur={() => setFocusedControl(null)}
                  style={({ pressed }) => [
                    styles.segmentButton,
                    media === value && styles.segmentSelected,
                    (pressed || focusedControl === `media-${value}`) && styles.controlFocused,
                  ]}
                >
                  <Ionicons
                    name={value === 'photo' ? 'image-outline' : 'videocam-outline'}
                    size={20}
                    color={colors.text}
                  />
                  <Text style={styles.segmentText}>
                    {value === 'photo' ? 'Photo' : 'Video'}
                    {media === value ? '  ✓' : ''}
                  </Text>
                </Pressable>
              ))}
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
                    ? media === 'photo'
                      ? 'image'
                      : 'videocam'
                    : icons[selected.id]
                }
                size={34}
                color={colors.onPrimary}
              />
            </View>
            <View style={styles.copy}>
              <Text style={styles.previewText}>
                {selected.id === 'photo-video'
                  ? `${media === 'photo' ? 'Photo' : 'Video'} post`
                  : selected.title}
              </Text>
              <Text style={styles.previewDetail}>{selected.detail}</Text>
            </View>
          </View>
        </View>

        {(selectedId === 'post' || selectedId === 'photo-video') && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Audience</Text>
            <View style={styles.audienceSegment} accessibilityRole="radiogroup">
              {(['buddies', 'public'] as const).map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setAudience(value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: audience === value }}
                  accessibilityLabel={value === 'buddies' ? 'Buddies only' : 'Public'}
                  onFocus={() => setFocusedControl(`audience-${value}`)}
                  onBlur={() => setFocusedControl(null)}
                  style={({ pressed }) => [
                    styles.audienceButton,
                    audience === value && styles.segmentSelected,
                    (pressed || focusedControl === `audience-${value}`) && styles.controlFocused,
                  ]}
                >
                  <Ionicons
                    name={value === 'buddies' ? 'people-outline' : 'earth-outline'}
                    size={20}
                    color={colors.text}
                  />
                  <Text style={styles.segmentText}>
                    {value === 'buddies' ? 'Buddies' : 'Public'}
                    {audience === value ? '  ✓' : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPress={() => onContinue(selected, media, audience)}
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
          <Ionicons name="arrow-forward" size={20} color={colors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F4EC' },
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
  title: { color: colors.text, fontFamily: font.extrabold, fontSize: 20 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  eyebrow: {
    color: colors.textMuted,
    fontFamily: font.semibold,
    fontSize: 13,
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#E8E2D7',
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
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8E2D7' },
  rowSelected: { backgroundColor: colors.primarySoft },
  destinationIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  iconSelected: { backgroundColor: colors.primary },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { color: colors.text, fontFamily: font.bold, fontSize: 16, flexShrink: 1 },
  rowDetail: {
    color: colors.textMuted,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.text, fontFamily: font.bold, fontSize: 14 },
  segment: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  segmentButton: {
    flexGrow: 1,
    flexBasis: 130,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  segmentSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primarySoft },
  segmentText: { color: colors.text, fontFamily: font.semibold, fontSize: 14, flexShrink: 1 },
  audienceSegment: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  audienceButton: {
    minHeight: 44,
    minWidth: 112,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  previewSection: { gap: spacing.sm },
  preview: {
    minHeight: 92,
    borderRadius: radius.lg,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E8E2D7',
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  previewText: { color: colors.text, fontFamily: font.semibold, fontSize: 15, flexShrink: 1 },
  previewDetail: { color: colors.textMuted, fontFamily: font.regular, fontSize: 12.5, lineHeight: 17 },
  previewArtwork: {
    width: 78,
    height: 70,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  previewArtworkFlex: { backgroundColor: '#7C3AED' },
  controlFocused: { opacity: 0.72, outlineColor: colors.primary, outlineWidth: 2 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: '#F7F4EC',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  continueButton: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  continueFocused: { opacity: 0.8, outlineColor: colors.text, outlineWidth: 2 },
  continueText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 16 },
});
