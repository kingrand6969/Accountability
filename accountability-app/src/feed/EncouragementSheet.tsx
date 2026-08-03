import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Avatar } from './Avatar';
import type { PostComment } from './types';
import type { PostEncourager, VoiceEncouragement } from './api';
import { authorLabel } from './format';
import { useResolvedMediaUrl } from '../media/useResolvedMediaUrl';
import { colors, font, radius, spacing } from '../ui/theme';

export type EncouragementViewState = 'loading' | 'empty' | 'retryable-error' | 'offline' | 'privacy-redacted' | 'populated';

export function deriveEncouragementViewState(input: {
  loading: boolean;
  online: boolean;
  rowCount: number;
  error?: boolean;
  redacted?: boolean;
}): EncouragementViewState {
  if (!input.online) return 'offline';
  if (input.loading) return 'loading';
  if (input.error) return 'retryable-error';
  if (input.redacted) return 'privacy-redacted';
  return input.rowCount > 0 ? 'populated' : 'empty';
}

type VoiceAction = 'delete' | 'report' | 'block';
type EncouragementView = { ownerId: string; postId: string; generation: number };
export type EncouragementOperationToken = EncouragementView & {
  rowId: string;
  rowOwnerId: string;
  action: VoiceAction;
  operation: number;
};

export function createEncouragementOperationToken(
  view: EncouragementView,
  rowId: string,
  rowOwnerId: string,
  action: VoiceAction,
  operation: number,
): EncouragementOperationToken {
  return { ...view, rowId, rowOwnerId, action, operation };
}

export function encouragementOperationOwnsCompletion(
  token: EncouragementOperationToken,
  current: EncouragementOperationToken,
  view: EncouragementView,
  mounted: boolean,
) {
  return mounted
    && token.ownerId === current.ownerId
    && token.postId === current.postId
    && token.generation === current.generation
    && token.rowId === current.rowId
    && token.rowOwnerId === current.rowOwnerId
    && token.action === current.action
    && token.operation === current.operation
    && token.ownerId === view.ownerId
    && token.postId === view.postId
    && token.generation === view.generation;
}

export function encouragementActionVisibility(
  viewerId: string | null,
  senderId: string,
  postOwnerId: string,
) {
  const isSender = !!viewerId && viewerId === senderId;
  const isRecipient = !!viewerId && viewerId === postOwnerId && viewerId !== senderId;
  return { delete: isSender, report: isRecipient, block: isRecipient };
}

export class VoiceRowActionController {
  private view: EncouragementView;
  private rowId: string;
  private senderId: string;
  private operation = 0;
  private lock: EncouragementOperationToken | null = null;

  constructor(view: EncouragementView, rowId: string, senderId: string) {
    this.view = { ...view };
    this.rowId = rowId;
    this.senderId = senderId;
  }

  update(view: EncouragementView, rowId: string, senderId: string) {
    if (view.ownerId !== this.view.ownerId || view.postId !== this.view.postId
      || view.generation !== this.view.generation || rowId !== this.rowId || senderId !== this.senderId) {
      this.invalidate();
      this.view = { ...view };
      this.rowId = rowId;
      this.senderId = senderId;
    }
  }

  begin(action: VoiceAction) {
    if (this.lock) return null;
    const token = createEncouragementOperationToken(
      this.view, this.rowId, this.senderId, action, ++this.operation,
    );
    this.lock = token;
    return token;
  }

  complete(token: EncouragementOperationToken, mounted: boolean) {
    const current = this.lock;
    if (!current || !encouragementOperationOwnsCompletion(token, current, this.view, mounted)) {
      return { apply: false, release: false };
    }
    this.lock = null;
    return { apply: true, release: true };
  }

  busy(action: VoiceAction) {
    return this.lock?.action === action;
  }

  invalidate() {
    this.operation += 1;
    this.lock = null;
  }
}

export class SingleThankCoordinator {
  private pending = false;
  async run(callback: () => Promise<void> | void) {
    if (this.pending) return;
    this.pending = true;
    try {
      await callback();
    } finally {
      this.pending = false;
    }
  }
}

export function encouragementSheetVisible(requested: boolean, dismissed: boolean) {
  return requested && !dismissed;
}

type Props = {
  visible: boolean;
  encouragers: PostEncourager[];
  voices: VoiceEncouragement[];
  comments: PostComment[];
  supporterCount: number;
  loading?: boolean;
  online?: boolean;
  error?: string | null;
  redacted?: boolean;
  onRetry?(): void;
  currentUserId?: string | null;
  postOwnerId?: string;
  postId?: string;
  generation?: number;
  onClose(): void;
  onReply(name: string): void;
  onThankEveryone(): void | Promise<void>;
  onRecordVoice(): void;
  onDeleteVoice?(voiceId: string): Promise<void>;
  onReportVoice?(voiceId: string): Promise<void>;
  onBlockVoiceSender?(voiceId: string): Promise<void>;
};

export function EncouragementSheet(props: Props) {
  const {
    visible, encouragers, voices, comments, supporterCount, onClose, onReply,
    onThankEveryone, onRecordVoice, loading = false, online = true, error = null, redacted = false,
    onRetry, currentUserId = null, postOwnerId = '', postId = '', generation = 0,
    onDeleteVoice, onReportVoice, onBlockVoiceSender,
  } = props;
  const thankCoordinator = useRef(new SingleThankCoordinator());
  const modalVisible = encouragementSheetVisible(visible, false);
  const state = deriveEncouragementViewState({
    loading,
    online,
    error: !!error,
    redacted,
    rowCount: comments.length + voices.length + encouragers.length,
  });

  return (
    <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close encouragement" />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>Encouragement</Text>
            <Text style={styles.subtitle}>
              {state === 'privacy-redacted'
                ? 'Support details unavailable'
                : `${supporterCount} ${supporterCount === 1 ? 'buddy showed' : 'buddies showed'} up for you`}
            </Text>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {state === 'loading' ? <SheetState text="Loading encouragement…" /> : null}
            {state === 'offline' ? <SheetState text="Encouragement is unavailable while offline." /> : null}
            {state === 'privacy-redacted' ? <SheetState text="Encouragement is private or no longer available." /> : null}
            {state === 'empty' ? <SheetState text="No encouragement yet." /> : null}
            {state === 'retryable-error' ? (
              <SheetState text="Encouragement could not be loaded." action="Retry" onAction={onRetry} />
            ) : null}
            {state === 'populated' ? comments.map((comment) => (
              <MessageRow
                key={comment.id}
                name={authorLabel(comment.author_name)}
                avatar={comment.author_avatar}
                body={comment.body}
                onReply={onReply}
              />
            )) : null}
            {state === 'populated' ? voices.map((voice) => (
              <VoiceMessage
                key={`${currentUserId}:${postId}:${generation}:${voice.id}:${voice.user_id}`}
                voice={voice}
                onReply={onReply}
                view={{ ownerId: currentUserId ?? '', postId, generation }}
                visibility={encouragementActionVisibility(currentUserId, voice.user_id, postOwnerId)}
                onDelete={onDeleteVoice}
                onReport={onReportVoice}
                onBlock={onBlockVoiceSender}
              />
            )) : null}
            {state === 'populated' && comments.length === 0 && voices.length === 0
              ? encouragers.map((person) => (
                <MessageRow key={person.id} name={authorLabel(person.name)} avatar={person.avatar_url} body="Showed up for you" onReply={onReply} />
              ))
              : null}
          </ScrollView>
          {state !== 'privacy-redacted' ? <View style={styles.secondaryAction}>
            <Pressable onPress={onRecordVoice} style={styles.recordVoice} accessibilityRole="button" accessibilityLabel="Record a voice encouragement, up to 10 seconds">
              <Ionicons name="mic-outline" size={18} color={colors.primary} />
              <Text style={styles.recordVoiceText}>Send voice encouragement</Text>
            </Pressable>
          </View> : null}
          {state !== 'privacy-redacted' ? <Pressable
            onPress={() => void thankCoordinator.current.run(onThankEveryone)}
            style={({ pressed }) => [styles.thank, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Thank everyone with one public comment"
          >
            <Text style={styles.thankText}>Thank everyone</Text>
          </Pressable> : null}
        </View>
      </View>
    </Modal>
  );
}

function SheetState({ text, action, onAction }: { text: string; action?: string; onAction?(): void }) {
  return (
    <View style={styles.state}>
      <Text style={styles.stateText}>{text}</Text>
      {action && onAction ? <Pressable onPress={onAction} accessibilityRole="button"><Text style={styles.retry}>{action}</Text></Pressable> : null}
    </View>
  );
}

function MessageRow({ name, avatar, body, onReply }: {
  name: string; avatar: string | null; body: string; onReply(name: string): void;
}) {
  return (
    <View style={styles.message}>
      <Avatar url={avatar} name={name} size={34} />
      <View style={styles.bubble}><Text style={styles.messageBody}>{body}</Text><Text style={styles.messageName}>{name}</Text></View>
      <Reply name={name} onReply={onReply} />
    </View>
  );
}

function VoiceMessage(props: {
  voice: VoiceEncouragement;
  onReply(name: string): void;
  view: EncouragementView;
  visibility: ReturnType<typeof encouragementActionVisibility>;
  onDelete?(voiceId: string): Promise<void>;
  onReport?(voiceId: string): Promise<void>;
  onBlock?(voiceId: string): Promise<void>;
}) {
  const { voice, onReply, view, visibility } = props;
  const url = useResolvedMediaUrl(voice.voice_ref);
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const name = authorLabel(voice.name);
  const seconds = Math.max(1, Math.ceil(voice.duration_ms / 1000));
  const [confirm, setConfirm] = useState<VoiceAction | null>(null);
  const [actionState, setActionState] = useState<'idle' | 'loading' | 'success' | 'retry' | 'forbidden'>('idle');
  const [actionsExpanded, setActionsExpanded] = useState(false);
  const mounted = useRef(true);
  const controller = useRef(new VoiceRowActionController(view, voice.id, voice.user_id));
  useEffect(() => () => {
    mounted.current = false;
    controller.current.invalidate();
  }, []);

  async function runAction(action: VoiceAction) {
    const callback = action === 'delete' ? props.onDelete : action === 'report' ? props.onReport : props.onBlock;
    if (!visibility[action] || !callback) {
      setActionState('forbidden');
      return;
    }
    controller.current.update(view, voice.id, voice.user_id);
    const token = controller.current.begin(action);
    if (!token) return;
    setActionState('loading');
    try {
      await callback(voice.id);
      if (controller.current.complete(token, mounted.current).apply) setActionState('success');
    } catch {
      if (controller.current.complete(token, mounted.current).apply) setActionState('retry');
    }
  }

  return (
    <View>
      <View style={styles.message}>
        <Avatar url={voice.avatar_url} name={voice.name} size={34} />
        <Pressable disabled={!url} onPress={() => (status.playing ? player.pause() : player.play())} style={[styles.voiceBubble, !url && styles.loadingVoice]} accessibilityRole="button" accessibilityLabel={`${status.playing ? 'Pause' : 'Play'} ${seconds} second voice encouragement from ${name}`}>
          <Ionicons name={status.playing ? 'pause-circle' : 'play-circle'} size={26} color={colors.primary} />
          <View style={styles.voiceWave}>{[8, 15, 11, 20, 13, 18, 9, 16].map((height, index) => <View key={index} style={[styles.voiceBar, { height }]} />)}</View>
          <Text style={styles.voiceDuration}>0:{String(seconds).padStart(2, '0')}</Text>
        </Pressable>
        <Reply name={name} onReply={onReply} />
        {(visibility.delete || visibility.report || visibility.block) ? (
          <Pressable
            onPress={() => setActionsExpanded((value) => !value)}
            style={styles.overflow}
            accessibilityRole="button"
            accessibilityLabel={`Voice options for ${name}`}
            accessibilityState={{ expanded: actionsExpanded }}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {actionsExpanded ? (
        <View style={styles.rowActions}>
          {visibility.delete ? <SmallAction label="Delete" onPress={() => setConfirm('delete')} disabled={actionState === 'loading'} /> : null}
          {visibility.report ? <SmallAction label="Report abuse" onPress={() => setConfirm('report')} disabled={actionState === 'loading'} /> : null}
          {visibility.block ? <SmallAction label="Block sender" onPress={() => setConfirm('block')} disabled={actionState === 'loading'} /> : null}
        </View>
      ) : null}
      {confirm ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>Confirm {confirm === 'report' ? 'report abuse' : confirm}?</Text>
          <SmallAction label="Cancel" onPress={() => setConfirm(null)} disabled={actionState === 'loading'} />
          <SmallAction label="Confirm" onPress={() => void runAction(confirm)} disabled={actionState === 'loading'} busy={actionState === 'loading'} />
        </View>
      ) : null}
      {actionState === 'loading' ? <ActivityIndicator color={colors.primary} /> : null}
      {actionState === 'success' ? <Text style={styles.actionMessage}>Done</Text> : null}
      {actionState === 'retry' ? <Text style={styles.actionError}>Action failed. Confirm to retry.</Text> : null}
      {actionState === 'forbidden' ? <Text style={styles.actionError}>This action is forbidden for this account.</Text> : null}
    </View>
  );
}

function Reply({ name, onReply }: { name: string; onReply(name: string): void }) {
  return <Pressable onPress={() => onReply(name)} style={styles.reply} accessibilityRole="button" accessibilityLabel={`Reply to ${name}`}><Text style={styles.replyText}>Reply</Text></Pressable>;
}

function SmallAction({ label, onPress, disabled = false, busy = false }: { label: string; onPress(): void; disabled?: boolean; busy?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={styles.smallActionButton} accessibilityRole="button" accessibilityState={{ disabled, busy }}><Text style={styles.smallAction}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(4,12,25,0.64)' },
  sheet: { height: '54%', minHeight: 360, backgroundColor: colors.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: spacing.md },
  head: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  title: { color: colors.navy, fontFamily: font.serif, fontSize: 24, lineHeight: 30 },
  subtitle: { color: colors.textMuted, fontFamily: font.medium, fontSize: 12, marginTop: 1 },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: 7 },
  message: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bubble: { flex: 1, backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  messageName: { color: colors.textMuted, fontFamily: font.medium, fontSize: 9.5, marginTop: 1 },
  messageBody: { color: colors.navy, fontFamily: font.regular, fontSize: 12.5 },
  voiceBubble: { flex: 1, minHeight: 40, borderRadius: radius.pill, backgroundColor: colors.card, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  loadingVoice: { opacity: 0.55 },
  voiceWave: { flex: 1, height: 22, flexDirection: 'row', alignItems: 'center', gap: 2 },
  voiceBar: { width: 2.5, borderRadius: 2, backgroundColor: colors.primary },
  voiceDuration: { color: colors.textMuted, fontFamily: font.medium, fontSize: 10.5 },
  reply: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  replyText: { color: colors.primary, fontFamily: font.semibold, fontSize: 10.5 },
  secondaryAction: { paddingHorizontal: spacing.xl, alignItems: 'flex-start' },
  recordVoice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5 },
  recordVoiceText: { color: colors.primary, fontFamily: font.semibold, fontSize: 12 },
  thank: { minHeight: 48, marginHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  thankText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 15 },
  state: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  stateText: { color: colors.textMuted, fontFamily: font.regular, textAlign: 'center' },
  retry: { color: colors.primary, fontFamily: font.bold, minHeight: 44 },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
  overflow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  confirm: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md },
  confirmText: { color: colors.text, fontFamily: font.medium, fontSize: 11 },
  smallActionButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  smallAction: { color: colors.primary, fontFamily: font.semibold, fontSize: 11 },
  actionMessage: { color: colors.success, textAlign: 'right', fontFamily: font.medium, fontSize: 11 },
  actionError: { color: colors.danger, textAlign: 'right', fontFamily: font.medium, fontSize: 11 },
  pressed: { opacity: 0.76 },
});
