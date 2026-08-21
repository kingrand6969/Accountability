import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../ui/AppThemeProvider';
import { font, spacing, type AppThemeColors } from '../ui/theme';
import type { ProgressPhoto } from './types';

export function ProgressPhotoVault({ photos }: { photos: readonly ProgressPhoto[] }) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Appearance progress</Text>
      <Text style={styles.private}>Private · Only you can see this</Text>
      {photos.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No private progress photos yet</Text>
          <Text style={styles.emptyCopy}>Your saved appearance check-ins will stay private here.</Text>
        </View>
      ) : photos.map((photo) => (
        <View key={photo.id} style={styles.photo} accessibilityLabel={`Private progress photo from ${new Date(photo.capturedAt).toLocaleDateString()}`}>
          <View style={styles.placeholder}><Text style={styles.placeholderText}>Private photo</Text></View>
          <View style={styles.photoMeta}>
            <Text style={styles.photoDate}>{new Date(photo.capturedAt).toLocaleDateString()}</Text>
            {photo.weightKg == null ? null : <Text style={styles.photoWeight}>{photo.weightKg.toFixed(1)} kg</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  section: { marginTop: spacing.section },
  title: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 20 },
  private: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 12.5, marginTop: spacing.xs },
  empty: { marginTop: spacing.md, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card, borderRadius: 16, padding: spacing.lg },
  emptyTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 15 },
  emptyCopy: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  photo: { minHeight: 88, marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card, borderRadius: 16, padding: spacing.md },
  placeholder: { width: 64, height: 64, borderRadius: 12, backgroundColor: theme.surface.muted, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 10, textAlign: 'center' },
  photoMeta: { flex: 1 },
  photoDate: { color: theme.ink.primary, fontFamily: font.semibold, fontSize: 14 },
  photoWeight: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 12.5, marginTop: spacing.xs },
});
