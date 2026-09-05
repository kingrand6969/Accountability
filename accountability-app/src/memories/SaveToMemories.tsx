import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { saveRemoteImageToMemories } from './api';
import { showToast } from '../ui/Toast';
import { colors, font } from '../ui/theme';

/** Bookmark button overlaid on any post photo — copies it into Memories. */
export function SaveToMemories({
  url,
  inline = false,
  feedAction = false,
}: {
  url: string;
  inline?: boolean;
  feedAction?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSave() {
    if (busy || saved) return;
    setBusy(true);
    try {
      await saveRemoteImageToMemories(url);
      setSaved(true);
      showToast('Saved to Memories ✨');
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      style={({ pressed }) => [
        feedAction ? styles.feedAction : inline ? styles.inlineBtn : styles.btn,
        pressed && styles.pressed,
      ]}
      onPress={onSave}
      hitSlop={8}
      accessibilityLabel={saved ? 'Saved to Memories' : 'Save to Memories'}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || saved, busy }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={inline || feedAction ? colors.textMuted : '#fff'} />
      ) : (
        <>
          <Ionicons
            name={saved ? 'bookmark' : 'bookmark-outline'}
            size={feedAction ? 21 : 17}
            color={inline || feedAction ? (saved ? colors.primaryDark : colors.textMuted) : '#fff'}
          />
          {inline || feedAction ? (
            <Text
              style={[
                feedAction ? styles.feedActionText : styles.inlineText,
                saved && styles.inlineSaved,
              ]}
            >
              {feedAction ? 'Save' : saved ? 'Saved' : 'Save'}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  inlineBtn: {
    flex: 1,
    minWidth: 48,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  inlineText: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 13 },
  inlineSaved: { color: colors.primaryDark },
  feedAction: {
    width: 48,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  feedActionText: {
    color: colors.textMuted,
    fontFamily: font.semibold,
    fontSize: 9.5,
    lineHeight: 11,
  },
});
