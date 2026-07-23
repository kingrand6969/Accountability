import { useEffect, useState, type ComponentProps } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './Avatar';
import { colors, font, radius, spacing } from '../ui/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type MenuOption = {
  label: string;
  /** one line under the label explaining what happens — key UX context */
  subtitle?: string;
  icon: IoniconName;
  destructive?: boolean;
  onPress: () => void;
};

type Options = {
  /** who wrote it + what it says — so there's no doubt which post is affected */
  preview?: { name: string | null; body: string | null; avatar: string | null };
  options: MenuOption[];
};

let present: ((opts: Options) => void) | null = null;

/**
 * Branded action sheet for post cards. Slides up from the bottom on phones
 * (the pattern members know from every big social app) and appears as a
 * centered card on tablets/desktop. Replaces the OS Alert sheet so behaviour
 * is identical on phone, tablet AND web. Mount <PostMenuHost /> once in the
 * root layout, then call openPostMenu(...) from anywhere.
 */
export function openPostMenu(opts: Options): void {
  if (present) present(opts);
}

export function PostMenuHost() {
  const [opts, setOpts] = useState<Options | null>(null);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 700; // tablet / desktop → centered card, not bottom sheet

  useEffect(() => {
    present = setOpts;
    return () => {
      present = null;
    };
  }, []);

  function close() {
    setOpts(null);
  }
  function pick(option: MenuOption) {
    close();
    // let the modal fully dismiss before a follow-up dialog opens (iOS quirk)
    setTimeout(() => option.onPress(), 80);
  }

  const preview = opts?.preview;
  const excerpt = preview?.body?.trim().replace(/\s+/g, ' ') ?? null;

  return (
    <Modal
      visible={!!opts}
      transparent
      animationType={wide ? 'fade' : 'slide'}
      onRequestClose={close}
    >
      <Pressable
        style={[styles.backdrop, wide ? styles.backdropCenter : styles.backdropBottom]}
        onPress={close}
        accessibilityLabel="Close menu"
      >
        <Pressable
          style={[
            styles.sheet,
            wide
              ? styles.sheetWide
              : { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {!wide ? <View style={styles.handle} /> : null}

          {/* which post this is about */}
          {preview ? (
            <View style={styles.preview}>
              <Avatar url={preview.avatar} name={preview.name} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.previewName} numberOfLines={1}>
                  {preview.name ?? 'Post'}
                </Text>
                {excerpt ? (
                  <Text style={styles.previewBody} numberOfLines={1}>
                    {excerpt}
                  </Text>
                ) : (
                  <Text style={styles.previewBody}>Photo post</Text>
                )}
              </View>
            </View>
          ) : null}

          <View style={styles.group}>
            {opts?.options.map((o, i) => (
              <View key={o.label}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <Pressable
                  onPress={() => pick(o)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={o.label}
                  accessibilityHint={o.subtitle}
                >
                  <View
                    style={[styles.rowIcon, o.destructive ? styles.iconDanger : styles.iconPlain]}
                  >
                    <Ionicons
                      name={o.icon}
                      size={17}
                      color={o.destructive ? colors.danger : colors.textSecondary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowLabel, o.destructive && { color: colors.danger }]}>
                      {o.label}
                    </Text>
                    {o.subtitle ? <Text style={styles.rowSub}>{o.subtitle}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
                </Pressable>
              </View>
            ))}
          </View>

          <Pressable
            onPress={close}
            style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.75 }]}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  backdropBottom: { justifyContent: 'flex-end' },
  backdropCenter: { justifyContent: 'center', padding: spacing.xxl },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  sheetWide: {
    borderRadius: radius.xl,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    paddingVertical: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 2,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  previewName: { fontFamily: font.bold, fontSize: 13.5, color: colors.text },
  previewBody: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  group: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 62 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  rowPressed: { backgroundColor: colors.surface },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlain: { backgroundColor: colors.surface },
  iconDanger: { backgroundColor: colors.dangerSoft },
  rowLabel: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  rowSub: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, marginTop: 1.5 },
  cancel: {
    minHeight: 50,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  cancelText: { fontFamily: font.bold, fontSize: 15, color: colors.textSecondary },
});
