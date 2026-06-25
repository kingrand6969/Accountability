import { StyleSheet, Text, View } from 'react-native';

export default function Feed() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Feed</Text>
      <Text style={styles.sub}>Friends&rsquo; wins and streaks will appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading: { fontSize: 24, fontWeight: '700' },
  sub: { color: '#666', marginTop: 8, textAlign: 'center' },
});
