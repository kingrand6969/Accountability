import { StyleSheet, Text, View } from 'react-native';

export default function Add() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Add</Text>
      <Text style={styles.sub}>Quick-add events, workouts, and more.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  heading: { fontSize: 24, fontWeight: '700' },
  sub: { color: '#666', marginTop: 8, textAlign: 'center' },
});
