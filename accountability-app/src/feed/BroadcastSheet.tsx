import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { listGroups, type Group } from '../groups/api';
import { createPost } from './api';
import { addStory } from '../stories/api';
import { encode } from 'base64-arraybuffer';
import { createPublicPostShare, publicShareMessage } from './publicShare';

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
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [sharedGroups, setSharedGroups] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<string | null>(null);
  const [addingToDay, setAddingToDay] = useState(false);
  const [addedToDay, setAddedToDay] = useState(false);
  const [sharingExternal, setSharingExternal] = useState(false);

  useEffect(() => {
    if (!post) return;
    setSent(new Set());
    setSharedGroups(new Set());
    setAddedToDay(false);
    Promise.all([listBuddies(), listGroups()])
      .then(([buddyRows, groupRows]) => {
        setBuddies(buddyRows);
        setGroups(groupRows.filter((group) => group.is_member));
      })
      .catch(() => {
        setBuddies([]);
        setGroups([]);
      });
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
    if (!post || sharingExternal) return;
    const title = post.body?.trim() || 'A win worth sharing';
    Alert.alert(
      'Share outside AccountAbility?',
      `${title}\n\nA revocable joinaccountability.app preview will be created. Your private ID and storage address will not appear in the message.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create & share',
          onPress: async () => {
            setSharingExternal(true);
            try {
              const url = await createPublicPostShare(post.id);
              await Share.share({ message: publicShareMessage(title, url) });
            } catch (error) {
              Alert.alert('Could not share', String((error as Error).message || 'Please try again.'));
            } finally {
              setSharingExternal(false);
            }
          },
        },
      ],
    );
  }

  async function onAddToMyDay() {
    if (!post?.image_url || addingToDay || addedToDay) return;
    setAddingToDay(true);
    try {
      const response = await fetch(post.image_url);
      if (!response.ok) throw new Error('Could not read that image.');
      const bytes = await response.arrayBuffer();
      const ext = post.image_url.split('?')[0].toLowerCase().endsWith('.png') ? 'png' : 'jpg';
      await addStory(encode(bytes), ext, post.body);
      setAddedToDay(true);
      hapticTap();
      showToast('Added to My Day');
    } catch {
      showToast('Could not add to My Day');
    } finally {
      setAddingToDay(false);
    }
  }

  async function onShareToGroup(group: Group) {
    if (!post || sending || sharedGroups.has(group.id)) return;
    setSending(group.id);
    try {
      await createPost(
        `${post.body?.trim() || 'A win worth sharing'}\n\nShared from ${post.author_name ?? 'AccountAbility'}`,
        post.image_url,
        group.id,
      );
      setSharedGroups((current) => new Set(current).add(group.id));
      hapticTap();
      showToast(`Shared to ${group.name}`);
    } catch {
      showToast('Could not share to that group');
    } finally {
      setSending(null);
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

          <Text style={styles.section}>Share inside AccountAbility</Text>
          <View style={styles.internalRow}>
            <Pressable
              onPress={onAddToMyDay}
              disabled={!post?.image_url || addingToDay || addedToDay}
              style={({ pressed }) => [
                styles.internalBtn,
                !post?.image_url && styles.disabled,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={post?.image_url ? 'Add to My Day' : 'My Day requires a photo'}
              accessibilityState={{ disabled: !post?.image_url || addingToDay || addedToDay, busy: addingToDay }}
            >
              {addingToDay ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name={addedToDay ? 'checkmark-circle' : 'add-circle-outline'} size={20} color={colors.primary} />
              )}
              <Text style={styles.internalText}>{addedToDay ? 'Added' : 'My Day'}</Text>
            </Pressable>
          </View>

          {groups && groups.length > 0 ? (
            <>
              <Text style={styles.section}>Share to a group</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupRow}>
                {groups.map((group) => {
                  const done = sharedGroups.has(group.id);
                  return (
                    <Pressable
                      key={group.id}
                      onPress={() => onShareToGroup(group)}
                      disabled={done || sending === group.id}
                      style={({ pressed }) => [styles.groupBtn, pressed && styles.pressed]}
                      accessibilityRole="button"
                      accessibilityLabel={`Share to ${group.name}`}
                      accessibilityState={{ disabled: done || sending === group.id, busy: sending === group.id }}
                    >
                      <Ionicons name={done ? 'checkmark-circle' : 'people-circle-outline'} size={22} color={done ? colors.success : colors.primary} />
                      <Text style={styles.groupName} numberOfLines={1}>{done ? 'Shared' : group.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          <Text style={styles.section}>Everywhere else</Text>
          <Pressable
            onPress={onShareExternal}
            disabled={sharingExternal}
            style={({ pressed }) => [styles.externalBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Share to other apps"
            accessibilityState={{ disabled: sharingExternal, busy: sharingExternal }}
          >
            <Ionicons name="share-social" size={19} color="#fff" />
            <Text style={styles.externalText}>Facebook, TikTok, WhatsApp & more…</Text>
          </Pressable>

          <Pressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
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
  internalRow: { flexDirection: 'row', gap: spacing.sm },
  internalBtn: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  internalText: { color: colors.text, fontFamily: font.bold, fontSize: 13.5 },
  disabled: { opacity: 0.45 },
  groupRow: { gap: spacing.sm, paddingVertical: 2 },
  groupBtn: {
    minHeight: 46,
    maxWidth: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupName: { color: colors.textSecondary, fontFamily: font.semibold, fontSize: 12.5, maxWidth: 105 },
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
  closeBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  closeText: { fontFamily: font.bold, fontSize: 14, color: colors.textMuted },
});
