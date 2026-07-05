import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { saveRemoteImageToMemories } from './api';
import { showToast } from '../ui/Toast';

/** Bookmark button overlaid on any post photo — copies it into Memories. */
export function SaveToMemories({ url }: { url: string }) {
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
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      onPress={onSave}
      hitSlop={8}
      accessibilityLabel={saved ? 'Saved to Memories' : 'Save to Memories'}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={17} color="#fff" />
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
});
