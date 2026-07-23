import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import type { FeedPost } from './types';
import { listBuddies, sendMessage, type Buddy } from '../buddy/api';
import { hapticTap } from '../ui/haptics';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing } from '../ui/theme';

/** What a broadcast message/share says — the post body plus provenance. */
function broadcastText(post: FeedPost): string {
  const body = post.body?.trim() || 'Check out my progress!';
  const img = post.image_url ? `\n${post.image_url}` : '';
  return `${body}${img}\n\n— shared from AccountAbility`;
}

/**
 * Broadcast a post: send it to your buddies in-app (one tap per buddy) or blast
 * it to any other app — Facebook, TikTok, WhatsApp… — via the system share sheet.
 */
export function BroadcastSheet({ post, onClose }: { post: FeedPost | null; onClose: () => void }) {
  const [buddies, setBuddies] = useState<Buddy[] | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!post) return;
    setSent(new Set());
    listBuddies()
      .then(setBuddies)
      .catch(() => setBuddies([]));
  }, [post]);

  async function onSendToBuddy(b: Buddy) {
    if (!post || sending || sent.has(b.id)) return;
    setSending(b.id);
    try {
      await sendMessage(b.id, broadcastText(post));
      hapticTap();
      setSent((cur) => new Set(cur).add(b.id));
      showToast(`Sent to ${b.name ?? 'your buddy'} 📣`);
    } catch {
      showToast('Could not send — try again');
    } finally {
      setSending(null);
    }
  }

  async function onShareExternal() {
    if (!post) return;
    try {
      await Share.share({ message: broadcastText(post) });
    } catch {
      // user dismissed, or web without navigator.share
      showToast('Sharing is available on your phone');
    }
  }

  return (
    <Modal visible={!!post} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <View style={styles.titleRow}>
            <Ionicons name="megaphone" size={18} color={colors.primary} />
            <Text style={styles.title}>Broadcast</Text>
          </View>

          <Text style={styles.section}>Send to a buddy</Text>
          {buddies === null ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 18 }} />
          ) : buddies.length === 0 ? (
            <Text style={styles.empty}>No buddies yet — add some to broadcast to them.</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.buddyRow}
            >
              {buddies.map((b) => {
                const done = sent.has(b.id);
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => onSendToBuddy(b)}
                    disabled={done || sending === b.id}
                    style={({ pressed }) => [styles.buddy, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Send to ${b.name ?? 'buddy'}`}
                  >
                    <View>
                      <Avatar url={b.avatar} name={b.name} size={52} />
                      {done ? (
                        <View style={styles.sentBadge}>
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                      ) : sending === b.id ? (
                        <View style={styles.sentBadge}>
                          <ActivityIndicator size={10} color="#fff" />
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.buddyName} numberOfLines={1}>
                      {done ? 'Sent ✓' : (b.name ?? 'Buddy')}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Text style={styles.section}>Everywhere else</Text>
          <Pressable
            onPress={onShareExternal}
            style={({ pressed }) => [styles.externalBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Share to other apps"
          >
            <Ionicons name="share-social" size={19} color="#fff" />
            <Text style={styles.externalText}>Facebook, TikTok, WhatsApp & more…</Text>
          </Pressable>

          <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 4,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: font.bold, fontSize: 18, color: colors.text },
  section: {
    fontFamily: font.bold,
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  empty: { fontFamily: font.regular, fontSize: 13.5, color: colors.textMuted, paddingVertical: 8 },
  buddyRow: { gap: spacing.md, paddingVertical: 4 },
  buddy: { alignItems: 'center', gap: 5, width: 64 },
  buddyName: { fontFamily: font.medium, fontSize: 11.5, color: colors.textSecondary },
  sentBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  externalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 13,
    minHeight: 48,
  },
  externalText: { fontFamily: font.bold, fontSize: 14.5, color: '#fff' },
  closeBtn: { alignItems: 'center', paddingVertical: 10 },
  closeText: { fontFamily: font.bold, fontSize: 14, color: colors.textMuted },
});
