import { StyleSheet } from 'react-native';

import { font, radius, spacing, type AppThemeColors } from '../ui/theme';

const SHARE_CARD_BACKGROUND = '#081A3A';
const SHARE_CARD_TEXT = '#FFFFFF';

export function createShareStudioStyles(theme: AppThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.surface.canvas },
    header: { minHeight: 56, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border.subtle },
    headerAction: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
    headerTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 19 },
    headerSpacer: { width: 48, height: 48 },
    content: { flexGrow: 1, width: '100%', maxWidth: 560, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.section, gap: spacing.xl },
    preview: { width: '100%', maxWidth: 448, alignSelf: 'center', aspectRatio: 4 / 5, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: SHARE_CARD_BACKGROUND },
    previewPhoto: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    previewShade: { flex: 1, justifyContent: 'flex-end', padding: spacing.xl, backgroundColor: 'rgba(0,0,0,0)' },
    previewShadePhoto: { backgroundColor: 'rgba(0,0,0,0.72)' },
    previewEyebrow: { color: SHARE_CARD_TEXT, fontFamily: font.semibold, fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
    previewTitle: { color: SHARE_CARD_TEXT, fontFamily: font.extrabold, fontSize: 30, lineHeight: 36, marginTop: spacing.xs },
    metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
    metric: { minWidth: 104, flexShrink: 1 },
    metricValue: { color: SHARE_CARD_TEXT, fontFamily: font.bold, fontSize: 19 },
    metricLabel: { color: SHARE_CARD_TEXT, fontFamily: font.medium, fontSize: 12, marginTop: 2 },
    section: { gap: spacing.sm },
    sectionTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 16, lineHeight: 22 },
    sectionCopy: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 13, lineHeight: 19 },
    mediaOptions: { gap: spacing.sm },
    mediaOption: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: theme.border.subtle, borderRadius: radius.md, backgroundColor: theme.surface.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    mediaSelected: { borderWidth: 2, borderColor: theme.border.action, backgroundColor: theme.surface.raised },
    mediaCopy: { flex: 1, minWidth: 0 },
    mediaLabel: { color: theme.ink.primary, fontFamily: font.semibold, fontSize: 15, lineHeight: 20 },
    mediaDetail: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
    statusRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    statusText: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 13 },
    privateNote: { color: theme.ink.secondary, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
    captionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md },
    counter: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 12 },
    caption: { minHeight: 112, maxHeight: 220, borderWidth: 1, borderColor: theme.border.subtle, borderRadius: radius.md, backgroundColor: theme.surface.card, color: theme.ink.primary, fontFamily: font.regular, fontSize: 16, lineHeight: 23, padding: spacing.md },
    bodyStatsRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: theme.border.subtle, borderRadius: radius.md, backgroundColor: theme.surface.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
    visibilityCopy: { flex: 1, minWidth: 0 },
    switchTarget: { minWidth: 56, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    visibilityTitle: { color: theme.ink.primary, fontFamily: font.semibold, fontSize: 15, lineHeight: 21 },
    visibilitySummary: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
    error: { color: theme.status.danger, fontFamily: font.medium, fontSize: 13, lineHeight: 19 },
    continueButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.md, backgroundColor: theme.ink.action, paddingHorizontal: spacing.lg },
    continueText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 16 },
    disabled: { opacity: theme.interaction.disabledOpacity },
    pressed: { opacity: 0.72 },
  });
}
