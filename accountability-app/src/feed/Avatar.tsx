import { Image, StyleSheet, Text, View } from 'react-native';

type Props = { url: string | null; name: string | null; size?: number };

export function Avatar({ url, name, size = 40 }: Props) {
  const initial = (name?.trim()?.charAt(0) ?? '?').toUpperCase();
  const radius = size / 2;
  if (url) {
    return (
      <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: radius }} />
    );
  }
  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: radius },
      ]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '700' },
});
