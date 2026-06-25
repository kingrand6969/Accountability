import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthProvider';

export default function Profile() {
  const { session } = useAuth();

  async function onSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Could not sign out', error.message);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Profile</Text>
      <Text style={styles.sub}>{session?.user.email ?? 'Signed in'}</Text>
      <Pressable style={styles.button} onPress={onSignOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  heading: { fontSize: 24, fontWeight: '700' },
  sub: { color: '#666' },
  button: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
