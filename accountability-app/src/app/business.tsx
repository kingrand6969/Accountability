import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Stack } from 'expo-router';
import { BusinessPane } from '../business/BusinessPane';
import { GlassBackdrop } from '../ui/Glass';
import { colors } from '../ui/theme';

/** Standalone route (☰ menu → Business). The same pane also lives inside the
 *  Finance tab beside Savings — that placement is the primary home. */
export default function BusinessScreen() {
  const { width } = useWindowDimensions();
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Business' }} />
      <GlassBackdrop />
      <BusinessPane width={width} topInset={8} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceAlt },
});
